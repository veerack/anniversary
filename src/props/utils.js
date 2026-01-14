import * as THREE from "three";

// ============================================================
// GLB prep / cleanup
// ============================================================
export function hideBakedGroundPlanes(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;

    const name = (o.name || "").toLowerCase();
    const looksLikeGroundByName =
      name.includes("ground") || name.includes("terrain") || name.includes("plane") || name.includes("grass");

    const geom = o.geometry;
    if (!geom) return;

    geom.computeBoundingBox?.();
    const bb = geom.boundingBox;
    if (!bb) return;

    const sizeX = bb.max.x - bb.min.x;
    const sizeY = bb.max.y - bb.min.y;
    const sizeZ = bb.max.z - bb.min.z;

    const veryFlat = sizeY < 0.02 * Math.max(sizeX, sizeZ);
    const veryLarge = Math.max(sizeX, sizeZ) > 20;

    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const greenish = mats.some((m) => {
      const c = m?.color;
      if (!c) return false;
      return c.g > c.r * 1.2 && c.g > c.b * 1.2;
    });

    if (looksLikeGroundByName || (veryFlat && veryLarge && greenish)) {
      o.visible = false;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
}

export function prepModel(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = true;
    if (o.material && "envMapIntensity" in o.material) o.material.envMapIntensity = 0.0;
    if (o.material) o.material.needsUpdate = true;
  });
  return root;
}

// ============================================================
// Colliders
// ============================================================
export function computeProtoCollider(proto, { inflate = 0.0, yPad = 0.2, maxR = 220 } = {}) {
  proto.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(proto);
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return null;

  const size = new THREE.Vector3();
  box.getSize(size);

  const r0 = 0.5 * Math.max(size.x, size.z) + inflate;
  if (!isFinite(r0) || r0 <= 0 || r0 > maxR) return null;

  return {
    r0,
    yMin0: box.min.y - yPad,
    yMax0: box.max.y + yPad,
  };
}

export function colliderFromTemplate(tpl, yWorld, scale, x, z) {
  if (!tpl) return null;
  const s = scale;
  return {
    x,
    z,
    r: tpl.r0 * s,
    yMin: yWorld + tpl.yMin0 * s,
    yMax: yWorld + tpl.yMax0 * s,
  };
}

export function makeColliderFromObject(obj, { inflate = 0.0, yPad = 0.2, maxR = 220 } = {}) {
  obj.updateWorldMatrix?.(true, true);

  const box = new THREE.Box3().setFromObject(obj);
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return null;

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const r = 0.5 * Math.max(size.x, size.z) + inflate;
  if (!isFinite(r) || r <= 0 || r > maxR) return null;

  return {
    x: center.x,
    z: center.z,
    r,
    yMin: box.min.y - yPad,
    yMax: box.max.y + yPad,
  };
}
