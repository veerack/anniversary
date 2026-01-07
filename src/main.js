import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { MEMORIES, TUNING, SKY } from "./config.js";
import { buildTerrain } from "./terrain.js";
import { setupSkyAndSun } from "./sky.js";

// later you’ll add:
// import { setupLighting } from "./lighting.js";
// import { setupClouds } from "./clouds.js";
// import { setupBirds } from "./birds.js";
// import { createGrassField } from "./grass.js";
// import { setupMemoriesUI } from "./memories.js";
// import { setupAvatar } from "./avatar.js";
// import { setupAudio } from "./audio.js";
// import { createPlayerController } from "./player.js";

const app = document.getElementById("app");
const interactHint = document.getElementById("interactHint");
const stamBar = document.getElementById("stamBar");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbad8ff);
scene.fog = new THREE.Fog(0xbad8ff, 75, 280);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;
scene.environment = null;
app.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 420);
camera.position.set(0, 4, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.enableZoom = true;
controls.zoomSpeed = 0.9;
controls.minDistance = 2.6;
controls.maxDistance = 7.0;
controls.minPolarAngle = 0.15;
controls.maxPolarAngle = Math.PI * 0.48;
controls.rotateSpeed = 0.6;

// Terrain
buildTerrain({ scene, size: TUNING.TERRAIN_SIZE, seg: TUNING.TERRAIN_SEG });

// Sky + sun (includes world-anchored rays)
const sky = setupSkyAndSun({ scene, skyConfig: SKY });

// TODO: move your lights into lighting.js and call setupLighting({scene, sunDir: sky.sunDir, sunTex: sky.sunTex})

const clock = new THREE.Clock();

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  const t = clock.elapsedTime;

  // TODO: updatePlayer(dt), updateCamera(dt), clouds, birds, grass, etc.

  // sun billboards (world anchored)
  sky.updateSunBillboards(camera, t);

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
