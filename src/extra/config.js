import * as THREE from "three";

export const AVATAR_URL = "https://models.readyplayer.me/696086f2e2b2692fdddd2fa3.glb";

export const DIALOGUES = {
  boba: [
    "Hey… you found the boba spot.",
    "I swear it tastes better here than anywhere else.",
    "Take a sip and look around for a second…",
    "Okay. Ready? Press Enter."
  ],

  flower: [
    "These flowers are so pretty up close…",
    "Let me pick one carefully.",
    "I’m keeping this memory.",
    "Press Enter."
  ],

  logs: [
    "These logs were here the first time we walked around.",
    "Funny how something simple can feel important.",
    "Let’s keep going.",
    "Press Enter."
  ],

  wood_fire: [
    "Just sit with the sound for a second.",
    "The world feels quieter here.",
    "Okay… now look at me.",
    "Press Enter."
  ],
};

export const ANIMS = {
  Idle: "assets/anim/Idle.fbx",
  Walk: "assets/anim/Walk.fbx",
  Run:  "assets/anim/Run.fbx",
  Jump: "assets/anim/Jump.fbx",
  Samba: "assets/anim/Samba2.fbx",
  Rumba: "assets/anim/Rumba.fbx",
  Salsa: "assets/anim/Salsa.fbx",
  SitIdle: "assets/anim/SittingIdle.fbx",
  StandToSit:  "assets/anim/StandToSit.fbx",
  SitToStand:  "assets/anim/SitToStand.fbx",
  Swim: "assets/anim/Swimming.fbx",
};

export const POPUPS = {
  phrases: [
    "I'm hungry.",
    "This bench is comfy.",
    "Who thought i would find someone in Italy...",
    "I could play some music... yeah why not.",
    "To think that the first time we met i was sitting on a bench... wow, a year passed already.",
    "Thinking about you 💛",
  ],
  intervalSec: 20,
  lifetimeSec: 7,
  fadeOutSec: 1.2,
  maxLineWidthPx: 260,

  audioMap: {
    "I could play some music... yeah why not.": "assets/mp3s/blue.mp3",
  },
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
  MAP_RADIUS: 1e9,
  TERRAIN_SIZE: 220,
  TERRAIN_SEG: 220,
};

// sky/sun
export const SKY = {
  SUN_DIR: new THREE.Vector3(0.45, 1.0, 0.25).normalize(),
  SKY_RADIUS: 500,
  SUN_RADIUS: 460,
};
