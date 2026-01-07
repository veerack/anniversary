import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { forceMeshVisible, stripRootTranslation, remapClipToAvatarBones } from "./utils.js";

export function setupAvatar({ playerVisual, avatarUrl, anims, minTracksForRun }) {
  const gltfLoader = new GLTFLoader();
  const fbxLoader = new FBXLoader();

  let avatarRoot = null;
  let mixer = null;
  const actions = {};
  let currentAction = null;

  let jumpAnimDone = false;
  let danceActive = null;

  function playAction(name, fade = 0.14){
    const next = actions[name];
    if (!next) return;
  
    // If it's already the current action but not actually running (ended/stopped),
    // restart it instead of returning (prevents T-pose).
    if (currentAction === next) {
      if (!next.isRunning()) {
        next.reset().fadeIn(0.06).play();
      }
      return;
    }
  
    if (currentAction) currentAction.fadeOut(fade);
  
    currentAction = next;
    currentAction.reset().fadeIn(fade).play();
  }

  function loadFBX(url){
    return new Promise((resolve, reject) => {
      fbxLoader.load(url, (fbx) => {
        const clip = fbx.animations && fbx.animations[0];
        if (!clip) return reject(new Error("No animation in " + url));
        resolve(clip);
      }, undefined, reject);
    });
  }

  async function init(){
    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(avatarUrl, resolve, undefined, reject);
    });

    avatarRoot = gltf.scene;
    forceMeshVisible(avatarRoot);

    avatarRoot.position.set(0,0,0);
    avatarRoot.rotation.set(0,0,0);
    avatarRoot.scale.set(1,1,1);
    playerVisual.add(avatarRoot);

    mixer = new THREE.AnimationMixer(avatarRoot);

    const [idleRaw, walkRaw, runRaw, jumpRaw, sambaRaw, rumbaRaw, salsaRaw] = await Promise.all([
      loadFBX(anims.Idle),
      loadFBX(anims.Walk),
      loadFBX(anims.Run),
      loadFBX(anims.Jump),
      loadFBX(anims.Samba),
      loadFBX(anims.Rumba),
      loadFBX(anims.Salsa),
    ]);

    const idle  = remapClipToAvatarBones(stripRootTranslation(idleRaw),  avatarRoot, "Idle");
    const walk  = remapClipToAvatarBones(stripRootTranslation(walkRaw),  avatarRoot, "Walk");
    const run   = remapClipToAvatarBones(stripRootTranslation(runRaw),   avatarRoot, "Run");
    const jump  = remapClipToAvatarBones(stripRootTranslation(jumpRaw),  avatarRoot, "Jump");
    const samba = remapClipToAvatarBones(stripRootTranslation(sambaRaw), avatarRoot, "Samba");
    const rumba = remapClipToAvatarBones(stripRootTranslation(rumbaRaw), avatarRoot, "Rumba");
    const salsa = remapClipToAvatarBones(stripRootTranslation(salsaRaw), avatarRoot, "Salsa");

    actions.Samba = mixer.clipAction(samba);
    actions.Rumba = mixer.clipAction(rumba);
    actions.Salsa = mixer.clipAction(salsa);

    for (const k of ["Samba","Rumba","Salsa"]) {
      actions[k].loop = THREE.LoopOnce;
      actions[k].clampWhenFinished = true;
    }

    actions.Idle = mixer.clipAction(idle);
    actions.Walk = mixer.clipAction(walk);
    actions.Jump = mixer.clipAction(jump);

    mixer.addEventListener("finished", (e) => {
      if (e.action === actions.Jump) jumpAnimDone = true;
      if (danceActive && e.action === actions[danceActive]) danceActive = null;
    });

    if ((run.tracks?.length || 0) < minTracksForRun) {
      actions.Run = mixer.clipAction(walk);
      actions.Run.setEffectiveTimeScale(1.35);
    } else {
      actions.Run = mixer.clipAction(run);
      actions.Run.setEffectiveTimeScale(1.08);
    }

    actions.Walk.setEffectiveTimeScale(1.0);
    actions.Idle.setEffectiveTimeScale(1.0);

    actions.Jump.loop = THREE.LoopOnce;
    actions.Jump.clampWhenFinished = true;

    playAction("Idle", 0.0);
  }

  function requestDance(name){
    danceActive = name;
    playAction(name, 0.08);
  }

  function cancelDance(){
    danceActive = null;
    if (currentAction) currentAction.fadeOut(0.08);
  }

  function onJumpStart(){
    jumpAnimDone = false;
    playAction("Jump", 0.06);
  }

  function update(dt){
    if (mixer) mixer.update(dt);
  }

  function setLocomotion({ isMoving, isRunning, isJumping }){
    if (!actions.Idle) return;
    if (danceActive) playAction(danceActive, 0.06);
    else if (isJumping) playAction("Jump", 0.05);
    else if (isMoving && isRunning) playAction("Run", 0.12);
    else if (isMoving) playAction("Walk", 0.14);
    else playAction("Idle", 0.18);
  }

  function jumpFinished(){
    return jumpAnimDone;
  }

  return { init, update, setLocomotion, requestDance, cancelDance, onJumpStart, jumpFinished };
}
