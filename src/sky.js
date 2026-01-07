import * as THREE from "three";

export function makeShaderSky({ sunDir }) {
  // paste your makeShaderSky() unchanged
}

export function makeSunTexture(size=256){
  // paste your makeSunTexture() unchanged
}

export function makeSunraysMaterial(){
  // paste your makeSunraysMaterial() unchanged
}

export function setupSkyAndSun({ scene, skyConfig }) {
  const sunDir = skyConfig.SUN_DIR.clone().normalize();
  const sunWorldPos = sunDir.clone().multiplyScalar(skyConfig.SUN_RADIUS);

  const shaderSky = makeShaderSky({ sunDir });
  scene.add(shaderSky.skyMesh);

  const sunTex = makeSunTexture(256);

  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sunTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      opacity: 0.95
    })
  );
  sunSprite.scale.set(38, 38, 1);
  sunSprite.renderOrder = 9999;
  sunSprite.position.copy(sunWorldPos);
  scene.add(sunSprite);

  const sunRays = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    makeSunraysMaterial()
  );
  sunRays.renderOrder = 9998;
  scene.add(sunRays);

  function updateSunBillboards(camera, time) {
    // rays: anchored, billboard + scale
    sunRays.position.copy(sunWorldPos);
    sunRays.lookAt(camera.position);
    const d = camera.position.distanceTo(sunWorldPos);
    const s = (d * 0.35) / 90;
    sunRays.scale.set(s, s, s);
    sunRays.material.uniforms.uTime.value = time;

    // sun disc: anchored + billboard + optional scale
    sunSprite.position.copy(sunWorldPos);
    sunSprite.lookAt(camera.position);
    const sunScale = (d * 0.12) / 38;
    sunSprite.scale.setScalar(38 * sunScale);
  }

  return { sunDir, sunWorldPos, sunTex, shaderSky, sunSprite, sunRays, updateSunBillboards };
}
