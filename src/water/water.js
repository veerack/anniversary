// water/water.js — bounded lakes + bounded rivers (true "fill the carve", stable per-slice levels)
// - Rivers: water surface level is computed per river slice from PRE-CARVE bank minima (stable, no jitter).
// - Lakes: level from rim minima (pre-carve surface).
// - Volumes: skirts down to bed hide the carved void from the sides.
// - Rebake: recompute levels + rebuild river volume geometry (for streamed terrain chunks).
// - Random generation helpers included (seeded).

import * as THREE from "three";

// ============================================================
// Utils
// ============================================================

function distPointToSegment2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const apx = px - ax, apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  const t = ab2 > 1e-8 ? (apx * abx + apz * abz) / ab2 : 0;
  const tt = Math.max(0, Math.min(1, t));
  const cx = ax + abx * tt;
  const cz = az + abz * tt;
  const dx = px - cx;
  const dz = pz - cz;
  return Math.sqrt(dx * dx + dz * dz);
}

function isInsideLake(x, z, lake) {
  const dx = x - lake.x;
  const dz = z - lake.z;
  return (dx * dx + dz * dz) <= (lake.r * lake.r);
}

function isInsideRiver(x, z, river) {
  const pts = river.pts || [];
  if (pts.length < 2) return false;
  const halfW = (river.w ?? 6) * 0.5;

  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    best = Math.min(best, distPointToSegment2D(x, z, a.x, a.z, b.x, b.z));
  }
  return best <= halfW;
}

function makeWaterMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x4aa6ff,
    roughness: 0.12,
    metalness: 0.0,
    transmission: 0.18,
    transparent: true,
    opacity: 0.78,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
  });

  // hides the carved void from most angles
  mat.side = THREE.DoubleSide;
  mat.depthWrite = true;
  return mat;
}

// ============================================================
// Geometry builders
// ============================================================

function buildRiverRibbonGeometry(pts, width) {
  const n = pts.length;
  const halfW = width * 0.5;

  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const indices = [];

  // cumulative length for UVs
  const len = new Float32Array(n);
  len[0] = 0;
  for (let i = 1; i < n; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dz = pts[i].z - pts[i - 1].z;
    len[i] = len[i - 1] + Math.sqrt(dx * dx + dz * dz);
  }
  const totalLen = Math.max(1e-6, len[n - 1]);

  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[Math.min(n - 1, i + 1)];

    // tangent
    let tx = p1.x - p0.x;
    let tz = p1.z - p0.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;

    // normal
    const nx = -tz;
    const nz = tx;

    const lx = p.x + nx * halfW;
    const lz = p.z + nz * halfW;
    const rx = p.x - nx * halfW;
    const rz = p.z - nz * halfW;

    const base = i * 2;

    positions[(base + 0) * 3 + 0] = lx;
    positions[(base + 0) * 3 + 1] = 0;
    positions[(base + 0) * 3 + 2] = lz;

    positions[(base + 1) * 3 + 0] = rx;
    positions[(base + 1) * 3 + 1] = 0;
    positions[(base + 1) * 3 + 2] = rz;

    const v = len[i] / totalLen;
    uvs[(base + 0) * 2 + 0] = 0;
    uvs[(base + 0) * 2 + 1] = v;
    uvs[(base + 1) * 2 + 0] = 1;
    uvs[(base + 1) * 2 + 1] = v;

    if (i < n - 1) {
      const a = base + 0;
      const b = base + 1;
      const c = base + 2;
      const d = base + 3;
      indices.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

// River volume skirts: connect top to a bottom line sampled from bedY
function addRiverSkirtsFromBed(topGeo, river, bedYWorld, { skirtDepth = 2.0 } = {}) {
  const pos = topGeo.attributes.position;
  const nTop = pos.count; // pts.length * 2

  const newPos = new Float32Array((nTop * 2) * 3);

  // copy TOP
  for (let i = 0; i < nTop; i++) {
    newPos[i * 3 + 0] = pos.getX(i);
    newPos[i * 3 + 1] = pos.getY(i);
    newPos[i * 3 + 2] = pos.getZ(i);
  }

  // build BOTTOM: same XZ, Y = bed - skirtDepth
  for (let i = 0; i < nTop; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const bed = bedYWorld(x, z);
    newPos[(nTop + i) * 3 + 0] = x;
    newPos[(nTop + i) * 3 + 1] = bed - skirtDepth;
    newPos[(nTop + i) * 3 + 2] = z;
  }

  const indices = [];
  if (topGeo.index) indices.push(...topGeo.index.array);

  const ptsLen = (river.pts || []).length;
  for (let i = 0; i < ptsLen - 1; i++) {
    const L0 = i * 2 + 0;
    const R0 = i * 2 + 1;
    const L1 = (i + 1) * 2 + 0;
    const R1 = (i + 1) * 2 + 1;

    const bL0 = nTop + L0;
    const bR0 = nTop + R0;
    const bL1 = nTop + L1;
    const bR1 = nTop + R1;

    // left wall (L0-L1-bL1-bL0)
    indices.push(L0, L1, bL1, L0, bL1, bL0);

    // right wall (R1-R0-bR0-bR1) outward
    indices.push(R1, R0, bR0, R1, bR0, bR1);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(newPos, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function setFlatTopY(circleGeo, y) {
  const pos = circleGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, y);
  pos.needsUpdate = true;
  circleGeo.computeVertexNormals();
}

// Lake volume: top + bottom + skirts (boundary edges)
function addSkirtVolume(topGeo, bedY, { offsetX = 0, offsetZ = 0, minSkirt = 0.8, closeBottom = true } = {}) {
  const posTop = topGeo.attributes.position;
  const uvTop = topGeo.attributes.uv;
  const idxTop = topGeo.index;
  const n = posTop.count;

  const positions = new Float32Array(n * 2 * 3);
  const uvs = uvTop ? new Float32Array(n * 2 * 2) : null;

  for (let i = 0; i < n; i++) {
    const x = posTop.getX(i);
    const y = posTop.getY(i);
    const z = posTop.getZ(i);

    const wx = x + offsetX;
    const wz = z + offsetZ;

    let yB = bedY(wx, wz);
    if (yB > y - minSkirt) yB = y - minSkirt;

    // TOP
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // BOTTOM
    const j = i + n;
    positions[j * 3 + 0] = x;
    positions[j * 3 + 1] = yB;
    positions[j * 3 + 2] = z;

    if (uvs) {
      uvs[i * 2 + 0] = uvTop.getX(i);
      uvs[i * 2 + 1] = uvTop.getY(i);
      uvs[j * 2 + 0] = uvTop.getX(i);
      uvs[j * 2 + 1] = uvTop.getY(i);
    }
  }

  const indices = [];

  // TOP
  for (let i = 0; i < idxTop.count; i += 3) {
    indices.push(idxTop.getX(i), idxTop.getX(i + 1), idxTop.getX(i + 2));
  }

  // BOTTOM
  if (closeBottom) {
    for (let i = 0; i < idxTop.count; i += 3) {
      indices.push(
        idxTop.getX(i + 2) + n,
        idxTop.getX(i + 1) + n,
        idxTop.getX(i + 0) + n
      );
    }
  }

  // boundary edges → skirts
  const edgeCount = new Map();
  const addEdge = (a, b) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const k = `${lo},${hi}`;
    edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
  };

  for (let i = 0; i < idxTop.count; i += 3) {
    const a = idxTop.getX(i), b = idxTop.getX(i + 1), c = idxTop.getX(i + 2);
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }

  for (const [k, count] of edgeCount.entries()) {
    if (count !== 1) continue;
    const [aStr, bStr] = k.split(",");
    const a = parseInt(aStr, 10);
    const b = parseInt(bStr, 10);

    const aTop = a, bTop = b, aBot = a + n, bBot = b + n;
    indices.push(aTop, bTop, bBot);
    indices.push(aTop, bBot, aBot);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (uvs) g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// ============================================================
// Stable river "fill the carve" (per-slice levels)
// ============================================================

function computeRiverLevels(river, sampleSurfaceHeight, { yBias = 0.02, ySink = 0.03, bankMargin = 0.03 } = {}) {
  const pts = river.pts || [];
  if (pts.length < 2) return [];

  const width = river.w ?? 6;
  const halfW = width * 0.5;

  const surfY = (x, z) => sampleSurfaceHeight(x, z) - ySink + yBias;

  const levels = new Array(pts.length);

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[Math.min(pts.length - 1, i + 1)];

    let tx = p1.x - p0.x;
    let tz = p1.z - p0.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;

    const nx = -tz;
    const nz = tx;

    const yL = surfY(p.x + nx * halfW, p.z + nz * halfW);
    const yR = surfY(p.x - nx * halfW, p.z - nz * halfW);

    // stable slice surface: below the lower bank
    levels[i] = Math.min(yL, yR) - bankMargin;
  }

  return levels;
}

// Bake TOP geo Y using: y = min( level(slice), bed + targetDepth )
function bakeRiverTopYStable(topGeo, river, riverLevels, sampleBedHeight, {
  yBias = 0.02,
  ySink = 0.03,
  targetDepth = 0.9,
} = {}) {
  const pos = topGeo.attributes.position;
  if (!pos) return;

  const bedY = (x, z) => sampleBedHeight(x, z) - ySink + yBias;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);

    // ribbon is [L0,R0, L1,R1, ...]
    const slice = Math.floor(i / 2);
    const surface = riverLevels[slice] ?? 0;

    const yFill = bedY(x, z) + targetDepth;
    const y = Math.min(surface, yFill);

    pos.setY(i, y);
  }

  pos.needsUpdate = true;
  topGeo.computeVertexNormals();
}

// ============================================================
// Main system
// ============================================================

export function createWaterSystem(scene, {
  sampleSurfaceHeight, // pre-carve (banks/rim)
  sampleBedHeight,     // carved bed
  lakes = [],
  rivers = [],
  lakeSegments = 64,
  yBias = 0.02,
  ySink = 0.03,
  bankMargin = 0.03,
  skirtDepth = 2.0,
} = {}) {
  if (typeof sampleSurfaceHeight !== "function" || typeof sampleBedHeight !== "function") {
    throw new Error("createWaterSystem: sampleSurfaceHeight and sampleBedHeight required");
  }

  const group = new THREE.Group();
  group.name = "__WATER__";
  scene.add(group);

  const mat = makeWaterMaterial();

  const bedYWorld = (x, z) => sampleBedHeight(x, z) - ySink + yBias;
  const surfYWorld = (x, z) => sampleSurfaceHeight(x, z) - ySink + yBias;

  // ----------------------------
  // LAKES (rim-limited)
  // ----------------------------
  const lakeLevels = new Map();

  function computeLakeLevel(lake) {
    const samples = 96;
    let minRim = Infinity;

    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const x = lake.x + Math.cos(a) * lake.r;
      const z = lake.z + Math.sin(a) * lake.r;
      minRim = Math.min(minRim, surfYWorld(x, z));
    }

    return minRim - 0.02;
  }

  for (const lake of lakes) {
    const level = computeLakeLevel(lake);
    lakeLevels.set(lake, level);

    const top = new THREE.CircleGeometry(lake.r, lakeSegments);
    top.rotateX(-Math.PI / 2);

    setFlatTopY(top, level);

    const vol = addSkirtVolume(top, bedYWorld, {
      offsetX: lake.x,
      offsetZ: lake.z,
      minSkirt: 0.8,
      closeBottom: true,
    });

    const m = new THREE.Mesh(vol, mat);
    m.position.set(lake.x, 0, lake.z);
    m.receiveShadow = true;
    group.add(m);
  }

  // ----------------------------
  // RIVERS (bank-limited, stable per-slice)
  // ----------------------------
  const _riversRuntime = [];

  for (const river of rivers) {
    const pts = river.pts || [];
    if (pts.length < 2) continue;

    const width = river.w ?? 6;

    const topGeo = buildRiverRibbonGeometry(pts, width);
    const levels = computeRiverLevels(river, sampleSurfaceHeight, { yBias, ySink, bankMargin });

    bakeRiverTopYStable(topGeo, river, levels, sampleBedHeight, {
      yBias,
      ySink,
      targetDepth: river.depth ?? 0.9,
    });

    const volGeo = addRiverSkirtsFromBed(topGeo, river, bedYWorld, { skirtDepth });

    const m = new THREE.Mesh(volGeo, mat);
    m.receiveShadow = true;
    group.add(m);

    _riversRuntime.push({ river, topGeo, mesh: m, levels });
  }

  function rebake() {
    for (const r of _riversRuntime) {
      r.levels = computeRiverLevels(r.river, sampleSurfaceHeight, { yBias, ySink, bankMargin });

      bakeRiverTopYStable(r.topGeo, r.river, r.levels, sampleBedHeight, {
        yBias,
        ySink,
        targetDepth: r.river.depth ?? 0.9,
      });

      const newVol = addRiverSkirtsFromBed(r.topGeo, r.river, bedYWorld, { skirtDepth });

      r.mesh.geometry.dispose();
      r.mesh.geometry = newVol;
    }
  }

  function isWater(x, z) {
    for (const lake of lakes) if (isInsideLake(x, z, lake)) return true;
    for (const river of rivers) if (isInsideRiver(x, z, river)) return true;
    return false;
  }

  function surfaceY(x, z) {
    for (const lake of lakes) {
      if (isInsideLake(x, z, lake)) return lakeLevels.get(lake) ?? surfYWorld(x, z);
    }

    for (const r of _riversRuntime) {
      if (!isInsideRiver(x, z, r.river)) continue;

      // choose nearest slice by projection-to-polyline (cheap: nearest segment distance -> nearest vertex)
      // fallback: nearest point index by Euclidean distance to pts
      const pts = r.river.pts || [];
      let best = 1e18;
      let bestI = 0;
      for (let i = 0; i < pts.length; i++) {
        const dx = x - pts[i].x;
        const dz = z - pts[i].z;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) { best = d2; bestI = i; }
      }

      const surface = r.levels[bestI] ?? surfYWorld(x, z);
      const yFill = bedYWorld(x, z) + (r.river.depth ?? 0.9);
      return Math.min(surface, yFill);
    }

    return surfYWorld(x, z);
  }

  function isInWater(x, z, y, { surfacePad = 0.35 } = {}) {
    if (!isWater(x, z)) return false;
    return y <= (surfaceY(x, z) + surfacePad);
  }

  function update() {}

  return { group, isWater, isInWater, surfaceY, update, rebake };
}

// ============================================================
// Random generation helpers (seeded)
// NOTE: generate BEFORE carving terrain, and pass the same defs to:
// - setWaterCarveData(def)
// - createWaterSystem(def)
// ============================================================

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRandomLakes(seed = 12345, count = 3, radius = 800, {
  rMin = 10,
  rMax = 26,
  depthMin = 1.2,
  depthMax = 1.9,
  avoidCenterR = 40,
} = {}) {
  const rnd = mulberry32(seed);
  const lakes = [];

  for (let i = 0; i < count; i++) {
    let x = 0, z = 0;
    for (let tries = 0; tries < 50; tries++) {
      x = (rnd() - 0.5) * radius * 2;
      z = (rnd() - 0.5) * radius * 2;
      if (Math.hypot(x, z) > avoidCenterR) break;
    }

    const r = rMin + rnd() * (rMax - rMin);
    const depth = depthMin + rnd() * (depthMax - depthMin);

    lakes.push({ x, z, r, depth });
  }

  return lakes;
}

export function generateRandomRivers(seed = 54321, count = 4, radius = 900, {
  pointsMin = 10,
  pointsMax = 20,
  stepMin = 10,
  stepMax = 18,
  turnStrength = 0.65,
  widthMin = 5.5,
  widthMax = 9.0,
  depthMin = 0.85,
  depthMax = 1.25,
  avoidCenterR = 40,
} = {}) {
  const rnd = mulberry32(seed);
  const rivers = [];

  for (let i = 0; i < count; i++) {
    const pts = [];
    const len = pointsMin + Math.floor(rnd() * (pointsMax - pointsMin + 1));

    let x = 0, z = 0;
    for (let tries = 0; tries < 50; tries++) {
      x = (rnd() - 0.5) * radius * 2;
      z = (rnd() - 0.5) * radius * 2;
      if (Math.hypot(x, z) > avoidCenterR) break;
    }

    let angle = rnd() * Math.PI * 2;

    for (let j = 0; j < len; j++) {
      pts.push({ x, z });

      angle += (rnd() - 0.5) * turnStrength;
      const step = stepMin + rnd() * (stepMax - stepMin);

      x += Math.cos(angle) * step;
      z += Math.sin(angle) * step;
    }

    rivers.push({
      pts,
      w: widthMin + rnd() * (widthMax - widthMin),
      depth: depthMin + rnd() * (depthMax - depthMin),
    });
  }

  return rivers;
}
