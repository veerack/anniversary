import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { placeOnTerrain, terrainHeight } from "./terrain.js";

console.log("🔥 props.js LOADED", new Date().toISOString());

// --- helper: hide baked "green ground / plane" inside some GLBs ---
function hideBakedGroundPlanes(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;

    const name = (o.name || "").toLowerCase();
    const looksLikeGroundByName =
      name.includes("ground") ||
      name.includes("terrain") ||
      name.includes("plane") ||
      name.includes("grass");

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

// --- helper: consistent no-IBL look + shadows ---
function prepModel(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    if (o.material && "envMapIntensity" in o.material) o.material.envMapIntensity = 0.0;
    if (o.material) o.material.needsUpdate = true;
  });
  return root;
}

/**
 * Build a simple "cylinder-ish" collider from an object's world bounds.
 * We store a circle on XZ + y range, good enough for walking collisions.
 */
function makeColliderFromObject(obj, { inflate = 0.0, yPad = 0.2 } = {}) {
  const box = new THREE.Box3().setFromObject(obj);
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return null;

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  // XZ circle radius from bounds
  const r = 0.5 * Math.max(size.x, size.z) + inflate;

  return {
    x: center.x,
    z: center.z,
    r,
    yMin: box.min.y - yPad,
    yMax: box.max.y + yPad,
    // optional debug
    // box
  };
}

export function addPillars(scene, colliders) {
  const propMat = new THREE.MeshStandardMaterial({
    color: 0x1a2250,
    roughness: 0.75,
    metalness: 0.05,
    envMapIntensity: 0.0,
  });

  function pillar(x, z) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 3.2, 18), propMat);
    p.position.set(x, 1.6, z);
    p.castShadow = true;
    p.receiveShadow = true;
    scene.add(p);

    // collider
    const col = makeColliderFromObject(p, { inflate: 0.35 });
    if (col && colliders) colliders.push(col);

    return p;
  }

  pillar(-10, 10);
  pillar(10, -10);
  pillar(0, 0);
}

export function createWorldScatter(scene, { mapRadius = 95 } = {}) {
  const gltfLoader = new GLTFLoader();

  // public collider list
  const colliders = [];

  async function addGLB({ url, x, z, rot = 0, scale = 1, yOffset = 0, colliderInflate = 0.2 }) {
    const gltf = await new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));
    const obj = prepModel(gltf.scene);

    placeOnTerrain(obj, x, z, yOffset);
    obj.rotation.y = rot;
    obj.scale.setScalar(scale);
    scene.add(obj);

    // collider for whole object
    const col = makeColliderFromObject(obj, { inflate: colliderInflate });
    if (col) colliders.push(col);

    return obj;
  }

  // ===== Trees (load once, clone many) =====
  const TREE_URL = "assets/models/tree_v3.glb";
  let treePrototype = null;

  async function preloadTreeV3() {
    if (treePrototype) return treePrototype;
    const gltf = await new Promise((res, rej) => gltfLoader.load(TREE_URL, res, undefined, rej));
    treePrototype = prepModel(gltf.scene);
    return treePrototype;
  }

  function addTreeV3(x, z, s = 1) {
    if (!treePrototype) return null;
    const t = treePrototype.clone(true);
    placeOnTerrain(t, x, z, 0);
    t.rotation.y = Math.random() * Math.PI * 2;
    t.scale.setScalar(s);
    scene.add(t);

    const col = makeColliderFromObject(t, { inflate: 0.35 });
    if (col) colliders.push(col);

    return t;
  }

  // ===== Rocks.glb (load once, clone many) =====
  const ROCKS_URL = "assets/models/Rocks.glb";
  let rocksPrototype = null;

  async function preloadRocks() {
    if (rocksPrototype) return rocksPrototype;
    const gltf = await new Promise((res, rej) => gltfLoader.load(ROCKS_URL, res, undefined, rej));
    rocksPrototype = prepModel(gltf.scene);
    return rocksPrototype;
  }

  function addRocksGLB(x, z, s = 1, yOffset = 0.0) {
    if (!rocksPrototype) return null;
    const r = rocksPrototype.clone(true);
    placeOnTerrain(r, x, z, yOffset);
    r.rotation.y = Math.random() * Math.PI * 2;
    r.scale.setScalar(s);
    scene.add(r);

    const col = makeColliderFromObject(r, { inflate: 0.25 });
    if (col) colliders.push(col);

    return r;
  }

  // ===== Mountain.glb ring (load once, clone in a circle) =====
  const MOUNTAIN_URL = "assets/models/Mountain.glb";
  let mountainPrototype = null;

  async function preloadMountain() {
    if (mountainPrototype) return mountainPrototype;

    const gltf = await new Promise((res, rej) => gltfLoader.load(MOUNTAIN_URL, res, undefined, rej));
    mountainPrototype = prepModel(gltf.scene);
    hideBakedGroundPlanes(mountainPrototype);

    let meshCount = 0;
    mountainPrototype.traverse((o) => { if (o.isMesh) meshCount++; });
    console.log("[mountain] loaded", MOUNTAIN_URL, "meshCount =", meshCount);

    return mountainPrototype;
  }

  function spawnMountainRing({
    count = 14,
    ringOffset = 18,
    yOffset = -2.2,
    scale = 0.35,
    scaleJitter = 0.25,
    yawJitter = 0.25,
    radiusJitter = 6.0,
    colliderInflate = 2.0, // mountains are huge, make collision forgiving
  } = {}) {
    if (!mountainPrototype) return null;

    const R = mapRadius + ringOffset;

    const grp = new THREE.Group();
    grp.name = "MountainRing";
    scene.add(grp);

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const ang = t * Math.PI * 2;

      const rr = R + (Math.random() * 2 - 1) * radiusJitter;
      const x = Math.cos(ang) * rr;
      const z = Math.sin(ang) * rr;

      const m = mountainPrototype.clone(true);

      placeOnTerrain(m, x, z, yOffset);

      m.rotation.y =
        (-ang + Math.PI) +
        (Math.random() * 2 - 1) * yawJitter +
        (Math.random() * Math.PI * 2) * 0.02;

      const s = scale * (1 + (Math.random() * 2 - 1) * scaleJitter);
      m.scale.setScalar(s);

      grp.add(m);

      // collider for each mountain chunk
      const col = makeColliderFromObject(m, { inflate: colliderInflate, yPad: 5.0 });
      if (col) colliders.push(col);
    }

    return grp;
  }

  async function scatterScene() {
    await preloadTreeV3();
    await preloadRocks();
    await preloadMountain();

    // --- Mountains (2-layer ring) ---
    spawnMountainRing({
      count: 34,
      ringOffset: 70,
      yOffset: -7.5,
      scale: 0.70,
      scaleJitter: 0.35,
      yawJitter: 0.45,
      radiusJitter: 16.0,
      colliderInflate: 2.5,
    });

    spawnMountainRing({
      count: 44,
      ringOffset: 105,
      yOffset: -12.0,
      scale: 1.05,
      scaleJitter: 0.45,
      yawJitter: 0.55,
      radiusJitter: 22.0,
      colliderInflate: 3.5,
    });

    // --- Trees ---
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 22;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      addTreeV3(x, z, 0.85 + Math.random() * 0.6);
    }

    // --- Rocks ---
    for (let i = 0; i < 55; i++) {
      const x = (Math.random() - 0.5) * 90;
      const z = (Math.random() - 0.5) * 90;
      if (Math.hypot(x, z) < 16) continue;

      const s = 0.7 + Math.random() * 0.9;
      addRocksGLB(x, z, s, 0.0);
    }

    // --- Props ---
    await addGLB({
      url: "assets/models/Car.glb",
      x: 18, z: -14,
      rot: 1.2,
      scale: 1.5,
      yOffset: 0.0,
      colliderInflate: 0.6,
    });

    await addGLB({
      url: "assets/models/Bench.glb",
      x: -14, z: -8,
      rot: -0.4,
      scale: 0.2,
      yOffset: 0.0,
      colliderInflate: 0.4,
    });

    // --- Path (no collider; it’s ground) ---
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x3a3a2f, roughness: 1, metalness: 0 });
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const x = THREE.MathUtils.lerp(-18, 22, t);
      const z = Math.sin(t * Math.PI * 2) * 8;
      const y = terrainHeight(x, z) + 0.02;

      const p = new THREE.Mesh(new THREE.CircleGeometry(2.2, 18), pathMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, y, z);
      p.receiveShadow = true;
      scene.add(p);
    }
  }

  return { scatterScene, colliders };
}
