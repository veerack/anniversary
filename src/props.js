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
    o.frustumCulled = false; // helps with big ring props
    if (o.material && "envMapIntensity" in o.material) o.material.envMapIntensity = 0.0;
    if (o.material) o.material.needsUpdate = true;
  });
  return root;
}

export function addPillars(scene) {
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
  }

  pillar(-10, 10);
  pillar(10, -10);
  pillar(0, 0);
}

export function createWorldScatter(scene, { mapRadius = 95 } = {}) {
  const gltfLoader = new GLTFLoader();

  async function addGLB({ url, x, z, rot = 0, scale = 1, yOffset = 0 }) {
    const gltf = await new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));
    const obj = prepModel(gltf.scene);

    placeOnTerrain(obj, x, z, yOffset);
    obj.rotation.y = rot;
    obj.scale.setScalar(scale);
    scene.add(obj);
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
    if (!treePrototype) return;
    const t = treePrototype.clone(true);
    placeOnTerrain(t, x, z, 0);
    t.rotation.y = Math.random() * Math.PI * 2;
    t.scale.setScalar(s);
    scene.add(t);
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
    if (!rocksPrototype) return;
    const r = rocksPrototype.clone(true);
    placeOnTerrain(r, x, z, yOffset);
    r.rotation.y = Math.random() * Math.PI * 2;
    r.scale.setScalar(s);
    scene.add(r);
  }

  // ===== Mountain.glb ring (load once, clone in a circle) =====
  const MOUNTAIN_URL = "assets/models/Mountain.glb";
  let mountainPrototype = null;

  async function preloadMountain() {
    if (mountainPrototype) return mountainPrototype;

    const gltf = await new Promise((res, rej) => gltfLoader.load(MOUNTAIN_URL, res, undefined, rej));
    mountainPrototype = prepModel(gltf.scene);

    // IMPORTANT: remove the baked green ground/plane inside the model
    hideBakedGroundPlanes(mountainPrototype);

    // helpful info in console
    let meshCount = 0;
    mountainPrototype.traverse((o) => { if (o.isMesh) meshCount++; });
    console.log("[mountain] loaded", MOUNTAIN_URL, "meshCount =", meshCount);

    return mountainPrototype;
  }

  function spawnMountainRing({
    count = 14,
    ringOffset = 18,    // ✅ much closer (was 55)
    yOffset = -2.2,     // ✅ sink base into terrain
    scale = 0.35,       // ✅ MUCH smaller (was 6.0)
    scaleJitter = 0.25,
    yawJitter = 0.25,
    radiusJitter = 6.0,
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
        (Math.random() * Math.PI * 2) * 0.02; // tiny extra variety

      const s = scale * (1 + (Math.random() * 2 - 1) * scaleJitter);
      m.scale.setScalar(s);

      grp.add(m);
    }

    return grp;
  }

  async function scatterScene() {
    await preloadTreeV3();
    await preloadRocks();
    await preloadMountain();

    // --- Mountains first (world boundary) ---
    // Ring 1 (closest, dense)
    spawnMountainRing({
      count: 44,
      ringOffset: 42,
      yOffset: -3.2,
      scale: 0.55,
      scaleJitter: 0.35,
      yawJitter: 0.35,
      radiusJitter: 10.0,
    });
    
    // Ring 2 (a bit farther, fills gaps)
    spawnMountainRing({
      count: 56,
      ringOffset: 62,
      yOffset: -6.0,
      scale: 0.75,
      scaleJitter: 0.40,
      yawJitter: 0.45,
      radiusJitter: 14.0,
    });
    
    // Ring 3 (far silhouette layer)
    spawnMountainRing({
      count: 64,
      ringOffset: 86,
      yOffset: -10.0,
      scale: 1.05,
      scaleJitter: 0.45,
      yawJitter: 0.55,
      radiusJitter: 18.0,
    });

    // --- Trees ---
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 22;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      addTreeV3(x, z, 0.85 + Math.random() * 0.6);
    }

    // --- Rocks (GLB clones) ---
    for (let i = 0; i < 55; i++) {
      const x = (Math.random() - 0.5) * 90;
      const z = (Math.random() - 0.5) * 90;
      if (Math.hypot(x, z) < 16) continue;

      const s = 0.7 + Math.random() * 0.9;
      addRocksGLB(x, z, s, 0.0);
    }

    // --- Props ---
    await addGLB({ url: "assets/models/Car.glb", x: 18, z: -14, rot: 1.2, scale: 1.5, yOffset: 0.0 });
    await addGLB({ url: "assets/models/Bench.glb", x: -14, z: -8, rot: -0.4, scale: 0.2, yOffset: 0.0 });

    // --- Path ---
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

  return { scatterScene };
}
