import * as THREE from "three";
import { hash2 } from "./utils.js";

export function terrainHeight(x, z) {
  const h1 = Math.sin(x * 0.06) * 1.2 + Math.cos(z * 0.05) * 1.1;
  const h2 = Math.sin((x + z) * 0.035) * 1.6;
  const n  = (hash2(x * 0.35, z * 0.35) - 0.5) * 0.35;
  let h = (h1 + h2) * 0.8 + n;

  const d = Math.hypot(x, z);
  const flat = THREE.MathUtils.smoothstep(d, 0, 18);
  h *= (1.0 - flat * 0.75);

  return h;
}

export function placeOnTerrain(obj, x, z, yOffset = 0) {
  obj.position.set(x, terrainHeight(x, z) + yOffset, z);
}

export function makeGrassMaps() {
  // (paste your existing makeGrassMaps() here unchanged)
  // return { map, normalMap, roughnessMap };
}

export function buildTerrain({ scene, size, seg }) {
  const { map, normalMap, roughnessMap } = makeGrassMaps();
  map.repeat.set(14,14);
  normalMap.repeat.set(14,14);
  roughnessMap.repeat.set(14,14);

  const terrainGeo = new THREE.PlaneGeometry(size, size, seg, seg);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  for (let i=0; i<posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, terrainHeight(x, z));
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map, normalMap, roughnessMap,
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.0
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `
        float h = vViewPosition.y;
        vec3 tint = mix(vec3(1.0), vec3(0.92, 1.03, 0.92), smoothstep(-2.0, 2.0, h));
        gl_FragColor.rgb *= tint;
        #include <dithering_fragment>
      `
    );
  };

  const ground = new THREE.Mesh(terrainGeo, terrainMat);
  ground.receiveShadow = true;
  scene.add(ground);

  return { ground };
}
