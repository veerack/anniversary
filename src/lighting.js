import * as THREE from "three";
import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";

export function setupLighting(scene, { sunDir, sunTex }) {
  const sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
  sunLight.position.copy(sunDir).multiplyScalar(120);
  sunLight.castShadow = true;

  sunLight.shadow.mapSize.set(2048, 2048);
  const SHADOW_BOX = 60;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far  = 250;
  sunLight.shadow.camera.left   = -SHADOW_BOX;
  sunLight.shadow.camera.right  =  SHADOW_BOX;
  sunLight.shadow.camera.top    =  SHADOW_BOX;
  sunLight.shadow.camera.bottom = -SHADOW_BOX;
  sunLight.shadow.bias = -0.00005;
  sunLight.shadow.normalBias = 0.01;

  const sunTarget = new THREE.Object3D();
  sunTarget.position.set(0,0,0);
  scene.add(sunTarget);
  sunLight.target = sunTarget;
  sunLight.target.updateMatrixWorld();

  // Lensflare
  const lensflare = new Lensflare();
  lensflare.addElement(new LensflareElement(sunTex, 420, 0.0));
  lensflare.addElement(new LensflareElement(sunTex, 140, 0.35));
  lensflare.addElement(new LensflareElement(sunTex, 90, 0.55));
  sunLight.add(lensflare);

  scene.add(sunLight);

  const fill = new THREE.DirectionalLight(0xffffff, 1.0);
  fill.position.set(-80, 60, -60);
  fill.castShadow = false;
  scene.add(fill);

  const hemi = new THREE.HemisphereLight(0xd9f0ff, 0x2b3a2b, 1.0);
  scene.add(hemi);

  scene.add(new THREE.AmbientLight(0xffffff, 0.28));

  return { sunLight };
}
