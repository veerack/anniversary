import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { placeOnTerrain, terrainHeight } from "./terrain.js";

export function addPillars(scene) {
  const propMat = new THREE.MeshStandardMaterial({
    color: 0x1a2250,
    roughness: 0.75,
    metalness: 0.05,
    envMapIntensity: 0.0
  });

  function pillar(x, z) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 3.2, 18), propMat);
    p.position.set(x, 1.6, z);
    p.castShadow = true;
    p.receiveShadow = true;
    scene.add(p);
  }

  pillar(-10, 10); pillar(10, -10); pillar(0, 0);
}

// --- helper: consistent no-IBL look + shadows ---
function prepModel(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.material && "envMapIntensity" in o.material) o.material.envMapIntensity = 0.0;
    if (o.material) o.material.needsUpdate = true;
  });
  return root;
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
    t.scale.setScalar(s * 1.0);
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
    return mountainPrototype;
  }

  function addMountainRing({
    count = 18,
    ringOffset = 55,     // how far beyond playable map
    yOffset = -2.0,      // sink slightly
    scale = 6.0,         // base scale (you may need to tweak!)
    scaleJitter = 0.25,
    yawJitter = 0.12
  } = {}) {
    if (!mountainPrototype) return;

    const R = mapRadius + ringOffset;

    const grp = new THREE.Group();
    grp.name = "MountainRing";
    scene.add(grp);

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const ang = t * Math.PI * 2;

      const x = Math.cos(ang) * R;
      const z = Math.sin(ang) * R;

      const m = mountainPrototype.clone(true);

      // place on terrain at ring point
      placeOnTerrain(m, x, z, yOffset);

      // face center so it forms a wall
      m.lookAt(0, m.position.y, 0);
      m.rotation.y += (Math.random() * 2 - 1) * yawJitter;

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

    // --- Mountains first (so "world boundary" exists immediately) ---
    addMountainRing({
      count: 18,
      ringOffset: 55,
      yOffset: -2.0,
      scale: 6.0
    });

    // --- Trees ---
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 22;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      addTreeV3(x, z, 0.85 + Math.random() * 0.6);
    }

    // --- Rocks (GLB clones instead of procedural) ---
    for (let i = 0; i < 55; i++) {
      const x = (Math.random() - 0.5) * 90;
      const z = (Math.random() - 0.5) * 90;
      if (Math.hypot(x, z) < 16) continue;

      const s = 0.7 + Math.random() * 0.9;   // tweak as needed
      addRocksGLB(x, z, s, 0.0);
    }

    // --- Props ---
    await addGLB({ url: "assets/models/Car.glb", x: 18, z: -14, rot: 1.2, scale: 1.0, yOffset: 0.0 });
    await addGLB({ url: "assets/models/Bench.glb", x: -14, z: -8, rot: -0.4, scale: 1.0, yOffset: 0.0 });

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
