import * as THREE from "three";

export const AVATAR_URL = "https://models.readyplayer.me/695c48e31c1817592c4ec48b.glb";

export const ANIMS = {
  Idle: "assets/anim/Idle.fbx",
  Walk: "assets/anim/Walk.fbx",
  Run:  "assets/anim/Run.fbx",
  Jump: "assets/anim/Jump.fbx",
  Samba:"assets/anim/Samba.fbx",
  Rumba:"assets/anim/Rumba.fbx",
  Salsa:"assets/anim/Salsa.fbx",
};

export const MEMORIES = [
  { id:"first-meet", title:"How we met", text:"Write a short story here.", pos:new THREE.Vector3(-6,0,-4) },
  { id:"first-date", title:"First date", text:"Where did you go? One detail you remember.", pos:new THREE.Vector3(6,0,-2) },
  { id:"moment", title:"The moment I knew", text:"One moment that made it clear she’s your person.", pos:new THREE.Vector3(-2,0,7) },
  { id:"future", title:"What’s next", text:"Something you’re excited to do together this year.", pos:new THREE.Vector3(7,0,7) },
];

// movement/tuning
export const TUNING = {
  WALK_SPEED: 2.6,
  RUN_SPEED: 8.0,
  AIR_CONTROL: 0.65,
  GRAVITY: -18.0,
  JUMP_VEL: 6.4,
  LOOK_HEIGHT: 1.45,
  MIN_TRACKS_FOR_RUN: 40,
  STEP_INTERVAL_WALK: 0.42,
  STEP_INTERVAL_RUN: 0.28,
  MAP_RADIUS: 95,
  TERRAIN_SIZE: 220,
  TERRAIN_SEG: 220,
};

// sky/sun
export const SKY = {
  SUN_DIR: new THREE.Vector3(0.45, 1.0, 0.25).normalize(),
  SKY_RADIUS: 500,
  SUN_RADIUS: 460,
};
