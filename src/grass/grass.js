// grass/grass.js — chunk-streamed tuft grass placed on CPU using terrainHeight() (split)
// Behavior unchanged.
import * as THREE from "three";
import { terrainHeight } from "../terrain/terrain.js";

import { makeGrassBladeTexture, makeTuftGeo, patchGrassMaterial } from "./addon.js";
import { hashInt2, mulberry32 } from "./utils.js";
import { terrainNormalFromHeightFn } from "./helpers.js";

// ------------------------------------------------------------
// Create one InstancedMesh for a chunk with CPU placement
// ------------------------------------------------------------
function buildChunkMesh({
  tuftGeo,
  material,
  bladeH,
  chunkSize,
  ix,
  iz,
  densityPerMeter2,
  groundBias,
  alignToSlope,
  scaleMul = 1.0,
  isBlocked = null,
}) {
  const area = chunkSize * chunkSize;
  const count = Math.max(1, Math.floor(area * densityPerMeter2));

  const mesh = new THREE.InstancedMesh(tuftGeo, material, count);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const aRand = new Float32Array(count);
  const aPhase = new Float32Array(count);

  const rng = mulberry32(hashInt2(ix, iz));

  const x0 = ix * chunkSize;
  const z0 = iz * chunkSize;

  // stratified within chunk
  const g = Math.ceil(Math.sqrt(count));
  const cell = chunkSize / g;

  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const qAlign = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const n = new THREE.Vector3();

  let placed = 0;
  for (let cz = 0; cz < g && placed < count; cz++) {
    for (let cx = 0; cx < g && placed < count; cx++) {
      const jx = (rng() - 0.5) * 0.95;
      const jz = (rng() - 0.5) * 0.95;

      const x = x0 + (cx + 0.5 + jx) * cell;
      const z = z0 + (cz + 0.5 + jz) * cell;
      if (isBlocked && isBlocked(x, z)) continue;
      const y = terrainHeight(x, z) + groundBias;

      const s = (0.65 + rng() * 0.95) * scaleMul;
      const yaw = rng() * Math.PI * 2;

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(s);

      if (alignToSlope) {
        terrainNormalFromHeightFn(terrainHeight, x, z, 0.25, n);
        qAlign.setFromUnitVectors(up, n);
        qYaw.setFromAxisAngle(n, yaw);
        dummy.quaternion.copy(qAlign).multiply(qYaw);
      } else {
        dummy.rotation.set(0, yaw, 0);
      }

      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);

      aRand[placed] = rng();
      aPhase[placed] = rng() * Math.PI * 2;

      placed++;
    }
  }

  mesh.count = placed;
  mesh.geometry.setAttribute("aRand", new THREE.InstancedBufferAttribute(aRand, 1));
  mesh.geometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(aPhase, 1));

  return mesh;
}

// ------------------------------------------------------------
// Public API — stream grass around player
// ------------------------------------------------------------
export function createGrassField({
  chunkSize = 40,
  loadRadius = 3,

  // tufts per m^2
  densityNear = 8.0,
  densityFar = 2.0,

  bladeH = 0.55,
  bladeW = 0.10,

  groundBias = -0.06,
  alignToSlope = true,

  // LOD tuning
  alphaTestNear = 0.22,
  alphaTestFar = 0.33,
  windAmpNear = 1.0,
  windAmpFar = 0.75,
  farScaleMul = 0.85,

  // streaming perf
  buildBudgetPerFrame = 2, // 1–3 recommended
  isBlocked = null
} = {}) {
  const alphaTex = makeGrassBladeTexture(256);
  const tuftGeo = makeTuftGeo(bladeW, bladeH);

  const group = new THREE.Group();
  group.name = "GrassField";

  // -------- shared materials (IMPORTANT for performance) ----------
  const baseNear = new THREE.MeshStandardMaterial({
    color: 0x2f7a2f,
    emissive: 0x163816,
    emissiveIntensity: 0.28,
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    alphaMap: alphaTex,
    alphaTest: alphaTestNear,
  });
  const nearMat = patchGrassMaterial(baseNear, bladeH);
  nearMat.userData._windAmpDefault = windAmpNear;

  const baseFar = baseNear.clone();
  baseFar.alphaTest = alphaTestFar;
  const farMat = patchGrassMaterial(baseFar, bladeH);
  farMat.userData._windAmpDefault = windAmpFar;

  // key -> { near: InstancedMesh, far: InstancedMesh }
  const chunks = new Map();
  const key = (ix, iz) => `${ix},${iz}`;

  // ---------- build queue (prevents hitching) ----------
  const _buildQueue = [];
  const _queued = new Set();

  let _lastCix = 1e9, _lastCiz = 1e9;

  function buildChunkPair(ix, iz) {
    const near = buildChunkMesh({
      tuftGeo,
      material: nearMat,
      bladeH,
      chunkSize,
      ix,
      iz,
      densityPerMeter2: densityNear,
      groundBias,
      alignToSlope,
      scaleMul: 1.0,
      isBlocked,
    });

    const far = buildChunkMesh({
      tuftGeo,
      material: farMat,
      bladeH,
      chunkSize,
      ix,
      iz,
      densityPerMeter2: densityFar,
      groundBias,
      alignToSlope,
      scaleMul: farScaleMul,
      isBlocked,
    });

    return { near, far };
  }

  function ensure(ix, iz) {
    const k = key(ix, iz);
    if (chunks.has(k) || _queued.has(k)) return;
    _queued.add(k);
    _buildQueue.push({ ix, iz, k });
  }

  function dispose(ix, iz) {
    const k = key(ix, iz);
    const c = chunks.get(k);
    if (!c) return;

    c.near.removeFromParent();
    c.far.removeFromParent();

    // dispose per-chunk geometry ONLY (materials are shared!)
    c.near.geometry.dispose();
    c.far.geometry.dispose();

    chunks.delete(k);
  }

  function processBuildQueue(budget = 2) {
    for (let i = 0; i < budget && _buildQueue.length; i++) {
      const job = _buildQueue.shift();
      _queued.delete(job.k);

      if (chunks.has(job.k)) continue;

      const c = buildChunkPair(job.ix, job.iz);
      chunks.set(job.k, c);
      group.add(c.near);
      group.add(c.far);
    }
  }

  function update(time, playerPos, isMoving) {
    const px = playerPos?.x ?? 0;
    const pz = playerPos?.z ?? 0;

    const cix = Math.floor(px / chunkSize);
    const ciz = Math.floor(pz / chunkSize);

    // uniforms every frame (cheap)
    const fadeNear = chunkSize * 1.0;
    const fadeFar = chunkSize * (loadRadius + 0.75);

    for (const c of chunks.values()) {
      for (const mesh of [c.near, c.far]) {
        const sh = mesh.material.userData.shader;
        if (!sh) continue;

        sh.uniforms.uTime.value = time;
        sh.uniforms.uPlayer.value.copy(playerPos);
        sh.uniforms.uMoving.value = isMoving ? 1 : 0;
        sh.uniforms.uFadeNear.value = fadeNear;
        sh.uniforms.uFadeFar.value = fadeFar;

        const def = mesh.material.userData._windAmpDefault ?? 1.0;
        sh.uniforms.uWindAmp.value = def;
      }
    }

    // re-stream only when entering a new grass chunk
    if (cix !== _lastCix || ciz !== _lastCiz) {
      _lastCix = cix;
      _lastCiz = ciz;

      const want = new Set();

      for (let dz = -loadRadius; dz <= loadRadius; dz++) {
        for (let dx = -loadRadius; dx <= loadRadius; dx++) {
          const ix = cix + dx;
          const iz = ciz + dz;
          const k = key(ix, iz);
          want.add(k);
          ensure(ix, iz);
        }
      }

      // dispose not wanted
      for (const k of Array.from(chunks.keys())) {
        if (!want.has(k)) {
          const [ix, iz] = k.split(",").map(Number);
          dispose(ix, iz);
        }
      }

      // drop queued jobs that became unwanted
      for (let i = _buildQueue.length - 1; i >= 0; i--) {
        const job = _buildQueue[i];
        if (!want.has(job.k)) {
          _buildQueue.splice(i, 1);
          _queued.delete(job.k);
        }
      }
    }

    processBuildQueue(buildBudgetPerFrame);
  }

  // initial
  update(0, new THREE.Vector3(0, 0, 0), false);

  return { group, update };
}
