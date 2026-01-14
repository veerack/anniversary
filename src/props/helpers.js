import * as THREE from "three";

// ============================================================
// RNG / math
// ============================================================

function randPointInAnnulus(rMin, rMax) {
  const a = Math.random() * Math.PI * 2;
  // uniform by area
  const r = Math.sqrt(Math.random() * (rMax * rMax - rMin * rMin) + rMin * rMin);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

// super simple separation so props don't stack (optional but recommended)
export const _used = [];
export function pickSpots(rMin = 200, rMax = 250, minDist = 18, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const p = randPointInAnnulus(rMin, rMax);
    let ok = true;
    for (const u of _used) {
      const dx = p.x - u.x;
      const dz = p.z - u.z;
      if (dx * dx + dz * dz < minDist * minDist) { ok = false; break; }
    }
    if (ok) { _used.push(p); return p; }
  }
  // fallback: just return something
  const p = randPointInAnnulus(rMin, rMax);
  _used.push(p);
  return p;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashInt2(ix, iz) {
  let h = ix * 374761393 + iz * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export function randPointInDisk(rng, rMin, rMax) {
  const u = rng();
  const r = Math.sqrt(rMin * rMin + (rMax * rMax - rMin * rMin) * u);
  const a = rng() * Math.PI * 2;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

// ============================================================
// Bounds / normalize / pivot
// ============================================================
export function getVisibleWorldBox(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  let has = false;

  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.visible === false) return;
    tmp.setFromObject(o);
    if (!isFinite(tmp.min.x) || !isFinite(tmp.max.x)) return;
    if (!has) {
      box.copy(tmp);
      has = true;
    } else box.union(tmp);
  });

  return has ? box : new THREE.Box3().setFromObject(root);
}

export function normalizeVisibleToHeight(root, targetH) {
  const box = getVisibleWorldBox(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const h = size.y;
  if (!isFinite(h) || h <= 1e-6) return;
  root.scale.multiplyScalar(targetH / h);
}

export function rebaseToGroundXZ(root) {
  root.updateWorldMatrix(true, true);

  const box = getVisibleWorldBox(root);
  const centerW = new THREE.Vector3();
  box.getCenter(centerW);
  const targetW = new THREE.Vector3(centerW.x, box.min.y, centerW.z);

  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const targetL = targetW.clone().applyMatrix4(inv);

  const pivot = new THREE.Group();
  pivot.add(root);

  root.position.sub(new THREE.Vector3(targetL.x, targetL.y, targetL.z));
  return pivot;
}

// (optional) if you use it elsewhere
export function computeWalkableTopY(obj, maxHeightFromBase = 1.8) {
  obj.updateWorldMatrix(true, true);

  const overall = new THREE.Box3().setFromObject(obj);
  const baseY = overall.min.y;

  const tmp = new THREE.Box3();
  let best = -Infinity;

  obj.traverse((o) => {
    if (!o.isMesh) return;
    tmp.setFromObject(o);
    if (tmp.max.y <= baseY + maxHeightFromBase) best = Math.max(best, tmp.max.y);
  });

  return isFinite(best) ? best : overall.max.y;
}

// ============================================================
// Spacing
// ============================================================
export function overlapsDisks(disks, x, z, r, pad = 0.8) {
  for (const d of disks) {
    const dx = x - d.x, dz = z - d.z;
    const rr = r + d.r + pad;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}

export function reserveDisk(disks, x, z, r) {
  disks.push({ x, z, r });
}

// ============================================================
// Instancing
// ============================================================
export function extractMeshParts(protoScene) {
  const parts = [];
  protoScene.updateWorldMatrix(true, true);

  const rootInv = new THREE.Matrix4().copy(protoScene.matrixWorld).invert();
  const mLocal = new THREE.Matrix4();

  protoScene.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.material) return;

    o.updateWorldMatrix(true, false);
    mLocal.multiplyMatrices(rootInv, o.matrixWorld);

    const g = o.geometry.clone();
    g.applyMatrix4(mLocal);
    g.computeBoundingBox?.();
    g.computeBoundingSphere?.();

    parts.push({ geometry: g, material: o.material });
  });

  return parts;
}

export function makeInstancedGroup(parts, count) {
  return parts.map(({ geometry, material }) => {
    const m = new THREE.InstancedMesh(geometry, material, count);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  });
}