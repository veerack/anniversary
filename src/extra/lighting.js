// lighting.js
import * as THREE from "three";
import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";

export function setupLighting(scene, { sunDir, sunTex }) {
  const sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
  sunLight.castShadow = true;

  // Shadow quality
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.bias = -0.00005;
  sunLight.shadow.normalBias = 0.01;

  // Shadow camera (ORTHO)
  const SHADOW_BOX = 60;
  const cam = sunLight.shadow.camera;
  cam.near = 1;
  cam.far = 250;
  cam.left = -SHADOW_BOX;
  cam.right = SHADOW_BOX;
  cam.top = SHADOW_BOX;
  cam.bottom = -SHADOW_BOX;

  // IMPORTANT: shadow updates
  sunLight.shadow.autoUpdate = true;

  // Target that we will move with the player
  const sunTarget = new THREE.Object3D();
  sunTarget.name = "__SUN_TARGET__";
  scene.add(sunTarget);
  sunLight.target = sunTarget;

  // Lensflare
  const lensflare = new Lensflare();
  lensflare.addElement(new LensflareElement(sunTex, 420, 0.0));
  lensflare.addElement(new LensflareElement(sunTex, 140, 0.35));
  lensflare.addElement(new LensflareElement(sunTex, 90, 0.55));
  sunLight.add(lensflare);

  scene.add(sunLight);

  // Fill / hemi / ambient
  const fill = new THREE.DirectionalLight(0xffffff, 1.0);
  fill.position.set(-80, 60, -60);
  fill.castShadow = false;
  scene.add(fill);

  const hemi = new THREE.HemisphereLight(0xd9f0ff, 0x2b3a2b, 1.0);
  scene.add(hemi);

  scene.add(new THREE.AmbientLight(0xffffff, 0.28));

  // ------------------------------------------------------------------
  // FOLLOW LOGIC (call every frame with player position)
  // ------------------------------------------------------------------

  const _tmp = new THREE.Vector3();
  const _lightPos = new THREE.Vector3();

  // Normalized sun direction (world-space)
  const _sunDir = sunDir.clone().normalize();

  // Distance of the directional light from the target (doesn't affect lighting,
  // but affects shadow camera stability if you later do texel snapping)
  const LIGHT_DIST = 120;

  // Optional: stabilize shadow shimmer by snapping shadow camera to texels
  // (works best if you keep SHADOW_BOX constant)
  const _m = new THREE.Matrix4();
  const _invM = new THREE.Matrix4();
  const _lightSpace = new THREE.Vector3();

  function snapShadowToTexels() {
    // Texel world size in the ortho box
    const texelSize = (SHADOW_BOX * 2) / sunLight.shadow.mapSize.x;

    // Build light view matrix from light -> target
    _m.lookAt(sunLight.position, sunTarget.position, new THREE.Vector3(0, 1, 0));
    _invM.copy(_m).invert();

    // Target in light space
    _lightSpace.copy(sunTarget.position).applyMatrix4(_m);

    // Snap X/Y in light space (Z is depth)
    _lightSpace.x = Math.round(_lightSpace.x / texelSize) * texelSize;
    _lightSpace.y = Math.round(_lightSpace.y / texelSize) * texelSize;

    // Convert back to world, shift light+target by the delta
    const snappedWorld = _lightSpace.applyMatrix4(_invM);
    const dx = snappedWorld.x - sunTarget.position.x;
    const dz = snappedWorld.z - sunTarget.position.z;

    sunTarget.position.x += dx;
    sunTarget.position.z += dz;
    sunLight.position.x += dx;
    sunLight.position.z += dz;
  }

  function updateLightingFollow(playerPos) {
    if (!playerPos) return;

    // 1) center shadows on player
    sunTarget.position.set(playerPos.x, playerPos.y ?? 0, playerPos.z);

    // 2) place directional light along sun direction
    _lightPos.copy(_sunDir).multiplyScalar(LIGHT_DIST).add(sunTarget.position);
    sunLight.position.copy(_lightPos);

    // 3) update matrices / camera
    sunTarget.updateMatrixWorld();
    sunLight.target.updateMatrixWorld();
    cam.updateProjectionMatrix();

    // Optional: reduce shimmer (comment out if you don’t want it)
    snapShadowToTexels();
  }

  return { sunLight, updateLightingFollow };
}
