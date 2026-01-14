// terrain/terrain.js — Infinite chunked terrain + procedural grass material (split)
// Behavior unchanged.
import * as THREE from "three";

import { lerp } from "./utils.js";
import { terrainHeightProcedural, terrainHeight, placeOnTerrain, setActiveTerrain } from "./helpers.js";
import { createTerrainMaterial } from "./addon.js";

// ============================================================
// Infinite terrain streaming (chunked heightfield) — NO STUTTER
// ============================================================

function chunkKey(ix, iz) { return `${ix},${iz}`; }

class TerrainSystem {
  constructor(scene, chunkSize, seg, loadRadius) {
    this.scene = scene;
    this.CHUNK_SIZE = chunkSize;
    this.SEG = seg;
    this.VERTS = seg + 1;
    this.LOAD_RADIUS = loadRadius;

    this.material = createTerrainMaterial();
    this.ground = new THREE.Group();
    this.ground.name = "__TERRAIN_ROOT__";
    scene.add(this.ground);

    // key -> chunk
    this.chunks = new Map();

    // build queue (keys) + jobs
    this.buildQueue = [];
    this.building = new Set();

    // gradual unload
    this.unloadQueue = [];

    // avoid re-evaluating want set every frame
    this.lastCix = 1e9;
    this.lastCiz = 1e9;

    // temp
    this._want = new Set();
  }

  getProgress() {
    const wantCount = this._want.size || 1;
    let ready = 0;
    for (const k of this._want) {
      const c = this.chunks.get(k);
      if (c && c.ready) ready++;
    }
    return ready / wantCount;
  }

  isAreaReady() {
    for (const k of this._want) {
      const c = this.chunks.get(k);
      if (!c || !c.ready) return false;
    }
    return true;
  }

  // Returns null if not available yet
  sampleHeight(x, z) {
    const cs = this.CHUNK_SIZE;
    const ix = Math.floor(x / cs);
    const iz = Math.floor(z / cs);
    const k = chunkKey(ix, iz);
    const c = this.chunks.get(k);
    if (!c || !c.ready || !c.heights) return null;

    const lx = x - ix * cs;
    const lz = z - iz * cs;

    const u = THREE.MathUtils.clamp(lx / cs, 0, 1);
    const v = THREE.MathUtils.clamp(lz / cs, 0, 1);

    const gx = u * this.SEG;
    const gz = v * this.SEG;

    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(x0 + 1, this.SEG);
    const z1 = Math.min(z0 + 1, this.SEG);

    const tx = gx - x0;
    const tz = gz - z0;

    const idx = (xx, zz) => zz * this.VERTS + xx;

    const h00 = c.heights[idx(x0, z0)];
    const h10 = c.heights[idx(x1, z0)];
    const h01 = c.heights[idx(x0, z1)];
    const h11 = c.heights[idx(x1, z1)];

    const a = lerp(h00, h10, tx);
    const b = lerp(h01, h11, tx);
    return lerp(a, b, tz);
  }

  enqueueBuild(ix, iz) {
    const k = chunkKey(ix, iz);
    if (this.chunks.has(k) || this.building.has(k)) return;
    this.buildQueue.push({ ix, iz, k });
    this.building.add(k);
  }

  enqueueUnload(k) {
    if (!this.unloadQueue.includes(k)) this.unloadQueue.push(k);
  }

  startChunk(ix, iz) {
    const k = chunkKey(ix, iz);
    const cs = this.CHUNK_SIZE;

    const geo = new THREE.PlaneGeometry(cs, cs, this.SEG, this.SEG);
    geo.rotateX(-Math.PI / 2);

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.name = `TerrainChunk_${ix}_${iz}`;
    mesh.position.set(ix * cs + cs * 0.5, 0, iz * cs + cs * 0.5);

    mesh.visible = false;
    this.ground.add(mesh);

    const heights = new Float32Array(this.VERTS * this.VERTS);

    const pos = geo.attributes.position;
    const job = {
      ix, iz, k, mesh, geo, pos, heights,
      row: 0,
      worldX0: ix * cs,
      worldZ0: iz * cs,
    };

    this.chunks.set(k, { mesh, geo, ix, iz, heights, ready: false, job });
  }

  tickBuildJobs(timeBudgetMs = 2.0) {
    const t0 = performance.now();
    const cs = this.CHUNK_SIZE;

    while (this.buildQueue.length && (performance.now() - t0) < timeBudgetMs * 0.25) {
      const b = this.buildQueue.shift();
      if (this.chunks.has(b.k)) { this.building.delete(b.k); continue; }
      this.startChunk(b.ix, b.iz);
    }

    for (const [k, c] of this.chunks) {
      const job = c.job;
      if (!job || c.ready) continue;

      while (job.row < this.VERTS && (performance.now() - t0) < timeBudgetMs) {
        const zRow = job.row;

        for (let xCol = 0; xCol < this.VERTS; xCol++) {
          const i = zRow * this.VERTS + xCol;

          const lx = job.pos.getX(i);
          const lz = job.pos.getZ(i);

          const wx = job.worldX0 + lx + cs * 0.5;
          const wz = job.worldZ0 + lz + cs * 0.5;

          const h = terrainHeightProcedural(wx, wz);

          job.pos.setY(i, h);
          job.heights[i] = h;
        }

        job.row++;

        if (!job.mesh.visible) job.mesh.visible = true;
      }

      if (job.row >= this.VERTS) {
        job.geo.attributes.position.needsUpdate = true;
        job.geo.computeVertexNormals();

        c.ready = true;
        c.job = null;
        this.building.delete(k);
      }

      if ((performance.now() - t0) >= timeBudgetMs) break;
    }
  }

  tickUnload(timeBudgetMs = 1.0) {
    const t0 = performance.now();
    while (this.unloadQueue.length && (performance.now() - t0) < timeBudgetMs) {
      const k = this.unloadQueue.shift();
      const c = this.chunks.get(k);
      if (!c) continue;

      c.mesh.removeFromParent();
      c.geo.dispose();
      this.chunks.delete(k);
      this.building.delete(k);
    }
  }

  update(playerPos, dt = 0) {
    const px = playerPos?.x ?? 0;
    const pz = playerPos?.z ?? 0;

    const cs = this.CHUNK_SIZE;
    const cix = Math.floor(px / cs);
    const ciz = Math.floor(pz / cs);

    if (cix !== this.lastCix || ciz !== this.lastCiz) {
      this.lastCix = cix;
      this.lastCiz = ciz;

      this._want.clear();

      for (let dz = -this.LOAD_RADIUS; dz <= this.LOAD_RADIUS; dz++) {
        for (let dx = -this.LOAD_RADIUS; dx <= this.LOAD_RADIUS; dx++) {
          const ix = cix + dx;
          const iz = ciz + dz;
          const k = chunkKey(ix, iz);
          this._want.add(k);
          this.enqueueBuild(ix, iz);
        }
      }

      for (const k of this.chunks.keys()) {
        if (!this._want.has(k)) this.enqueueUnload(k);
      }
    }

    this.tickBuildJobs(2.3);
    this.tickUnload(0.8);
  }
}

/**
 * buildTerrain({ scene, size, seg })
 * - size = chunk size
 * - seg  = subdivisions
 * IMPORTANT: call update(player.position, dt) each frame
 */
export function buildTerrain({ scene, size = 80, seg = 80 } = {}) {
  const LOAD_RADIUS = 3;

  const sys = new TerrainSystem(scene, size, seg, LOAD_RADIUS);
  setActiveTerrain(sys);

  // Build initial target set around origin
  sys.update({ x: 0, z: 0 }, 0);

  return {
    ground: sys.ground,
    material: sys.material,               // ✅ expose real material
    update: (playerPos, dt = 0) => sys.update(playerPos, dt),
    getChunkSize: () => sys.CHUNK_SIZE,
    getProgress: () => sys.getProgress(), // ✅ loading %
    isReady: () => sys.isAreaReady(),     // ✅ gate spawn
  };
}

// Re-export these so existing imports keep working (from terrain/terrain.js)
export { terrainHeight, placeOnTerrain };
