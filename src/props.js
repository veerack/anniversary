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

  function pillar(x,z){
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6,0.8,3.2,18), propMat);
    p.position.set(x,1.6,z);
    p.castShadow = true;
    p.receiveShadow = true;
    scene.add(p);
  }

  pillar(-10,10); pillar(10,-10); pillar(0,0);
}

function addRock(scene, x, z, s = 1) {
  const g = new THREE.IcosahedronGeometry(0.9 * s, 1);
  const m = new THREE.MeshStandardMaterial({ color: 0x4a4f58, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.0 });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `
        float n = sin(vViewPosition.x*2.7)*sin(vViewPosition.y*3.1)*sin(vViewPosition.z*2.3);
        n = n*0.5 + 0.5;
        vec3 tint = mix(vec3(0.90,0.92,0.98), vec3(0.55,0.60,0.68), n);
        gl_FragColor.rgb *= tint;
        #include <dithering_fragment>
      `
    );
  };
  m.needsUpdate = true;

  const rock = new THREE.Mesh(g, m);
  rock.castShadow = true;
  rock.receiveShadow = true;
  placeOnTerrain(rock, x, z, 0.1);
  rock.rotation.y = Math.random() * Math.PI * 2;
  scene.add(rock);
}

export function createWorldScatter(scene, { mapRadius = 95 } = {}) {
  const gltfLoader = new GLTFLoader();

  async function addGLB({ url, x, z, rot=0, scale=1, yOffset=0 }) {
    const gltf = await new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));
    const obj = gltf.scene;

    obj.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material && "envMapIntensity" in o.material) o.material.envMapIntensity = 0.0;
      if (o.material) o.material.needsUpdate = true;
    });

    placeOnTerrain(obj, x, z, yOffset);
    obj.rotation.y = rot;
    obj.scale.setScalar(scale);
    scene.add(obj);
    return obj;
  }

  const TREE_URL = "assets/models/tree_v3.glb";
  let treePrototype = null;

  async function preloadTreeV3() {
    if (treePrototype) return treePrototype;
    const gltf = await new Promise((res, rej) => gltfLoader.load(TREE_URL, res, undefined, rej));
    treePrototype = gltf.scene;

    treePrototype.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material && "envMapIntensity" in o.material) o.material.envMapIntensity = 0.0;
      if (o.material) o.material.needsUpdate = true;
    });

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

  async function scatterScene() {
    await preloadTreeV3();

    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 22;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      addTreeV3(x, z, 0.85 + Math.random() * 0.6);
    }

    for (let i = 0; i < 45; i++) {
      const x = (Math.random() - 0.5) * 90;
      const z = (Math.random() - 0.5) * 90;
      if (Math.hypot(x, z) < 16) continue;
      addRock(scene, x, z, 0.6 + Math.random() * 1.3);
    }

    await addGLB({ url:"assets/models/Car.glb",   x: 18,  z:-14, rot: 1.2,  scale: 1.0, yOffset: 0.0 });
    await addGLB({ url:"assets/models/Bench.glb", x:-14, z: -8, rot:-0.4,  scale: 1.0, yOffset: 0.0 });

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
