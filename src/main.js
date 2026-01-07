import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { AVATAR_URL, ANIMS, MEMORIES, TUNING, SKY } from "./config.js";
import { buildTerrain } from "./terrain.js";
import { setupSkyAndSun } from "./sky.js";
import { setupLighting } from "./lighting.js";
import { setupClouds } from "./clouds.js";
import { setupBirds } from "./birds.js";
import { createGrassField } from "./grass.js";
import { addPillars, createWorldScatter } from "./props.js";
import { setupMemoryPanelUI, setupMemories } from "./memories.js";
import { setupAudio } from "./audio.js";
import { setupAvatar } from "./avatar.js";
import { createPlayerController } from "./player.js";

const app = document.getElementById("app");
const interactHintEl = document.getElementById("interactHint");
const stamBar = document.getElementById("stamBar");

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbad8ff);
scene.fog = new THREE.Fog(0xbad8ff, 95, 280);

// Renderer
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

// Camera + controls
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);
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

// Sky + sun (+ world anchored rays)
const sky = setupSkyAndSun({ scene, skyConfig: SKY });

// Lighting (needs sunDir + sunTex)
setupLighting(scene, { sunDir: sky.sunDir, sunTex: sky.sunTex });

// Clouds + birds
const clouds = setupClouds(scene, 14);
const birds = setupBirds(scene, 22);

// Grass blades
const grassField = createGrassField({
  count: 120000,
  radius: TUNING.MAP_RADIUS - 2,
  bladeH: 0.42,
  bladeW: 0.045
});
scene.add(grassField.mesh);

// Props / World
const world = createWorldScatter(scene, { mapRadius: TUNING.MAP_RADIUS });

addPillars(scene, world.colliders);   // ✅ pass the array
world.scatterScene();                // ✅ keep this

// Player container
const player = new THREE.Group();
player.position.set(0, 0, 8);
scene.add(player);

const playerVisual = new THREE.Group();
player.add(playerVisual);

// UI + memories
const panelUI = setupMemoryPanelUI();
const memoriesSys = setupMemories(scene, MEMORIES, {
  onOpenMemory: (mem) => panelUI.open(mem),
});
document.getElementById("closeBtn").onclick = () => {
  panelUI.close();
  memoriesSys.clearActive();
};

// Audio
const audio = setupAudio();

// Avatar
const avatar = setupAvatar({
  playerVisual,
  avatarUrl: AVATAR_URL,
  anims: ANIMS,
  minTracksForRun: TUNING.MIN_TRACKS_FOR_RUN
});
avatar.init().catch(e => console.error("Avatar init failed:", e));

// Player controller (movement + camera)
const playerCtl = createPlayerController({
  player,
  playerVisual,
  controls,
  tuning: TUNING,
  staminaEl: stamBar,
  playFootstep: audio.playFootstep,
  setWindStrength: audio.setWindStrength,
  onJumpStart: () => avatar.onJumpStart(),
  onCancelDance: () => avatar.cancelDance(),
  avatarApi: avatar,

  colliders: world.colliders,   // ✅ THIS is the “world thing”
});

controls.target.copy(player.position).add(new THREE.Vector3(0, TUNING.LOOK_HEIGHT, 0));
controls.update();

// Loop
const clock = new THREE.Clock();

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  const t = clock.elapsedTime;

  const st = playerCtl.updatePlayer(dt);
  playerCtl.updateCamera(dt);

  clouds.update(dt);
  birds.update(t);

  sky.update(camera, t);

  grassField.update(t, player.position, st.isMoving);

  memoriesSys.update(t);
  memoriesSys.checkTriggers(player.position, { interactHintEl });

  avatar.update(dt);

  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
