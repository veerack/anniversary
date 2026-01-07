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

  let locoState = "Idle";           // "Idle" | "StartWalk" | "Walk" | "StopWalk" | "Run" | "Jump"
  let pendingAfterOneShot = null;   // e.g. "Walk" or "Idle"
  let lastMoving = false;
  let lastRunning = false;
  
  function playAction(name, fade = 0.14){
    const next = actions[name];
    if (!next) return;
  
    // If it's already the current action, do NOTHING.
    // (Do not reset/replay it, or it'll restart when you press movement keys.)
    if (currentAction === next) return;
  
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

    const [idleRaw, startRaw, walkRaw, stopRaw, runRaw, jumpRaw, sambaRaw, rumbaRaw, salsaRaw] = await Promise.all([
      loadFBX(anims.Idle),
      loadFBX(anims.StartWalk),
      loadFBX(anims.Walk),
      loadFBX(anims.StopWalk),
      loadFBX(anims.Run),
      loadFBX(anims.Jump),
      loadFBX(anims.Samba),
      loadFBX(anims.Rumba),
      loadFBX(anims.Salsa),
    ]);

    const idle  = remapClipToAvatarBones(stripRootTranslation(idleRaw),  avatarRoot, "Idle");
    const startWalk = remapClipToAvatarBones(stripRootTranslation(startRaw), avatarRoot, "StartWalk");
    const walk  = remapClipToAvatarBones(stripRootTranslation(walkRaw),  avatarRoot, "Walk");
    const stopWalk  = remapClipToAvatarBones(stripRootTranslation(stopRaw),  avatarRoot, "StopWalk");
    const run   = remapClipToAvatarBones(stripRootTranslation(runRaw),   avatarRoot, "Run");
    const jump  = remapClipToAvatarBones(stripRootTranslation(jumpRaw),  avatarRoot, "Jump");
    const samba = remapClipToAvatarBones(stripRootTranslation(sambaRaw), avatarRoot, "Samba");
    const rumba = remapClipToAvatarBones(stripRootTranslation(rumbaRaw), avatarRoot, "Rumba");
    const salsa = remapClipToAvatarBones(stripRootTranslation(salsaRaw), avatarRoot, "Salsa");

    actions.Samba = mixer.clipAction(samba);
    actions.Rumba = mixer.clipAction(rumba);
    actions.Salsa = mixer.clipAction(salsa);
    actions.StartWalk = mixer.clipAction(startWalk);
    actions.StopWalk  = mixer.clipAction(stopWalk);

    // one-shots
    for (const k of ["StartWalk","StopWalk","Jump","Samba","Rumba","Salsa"]) {
      actions[k].loop = THREE.LoopOnce;
      actions[k].clampWhenFinished = true;
    }

    actions.Idle = mixer.clipAction(idle);
    actions.Walk = mixer.clipAction(walk);
    actions.Jump = mixer.clipAction(jump);

    mixer.addEventListener("finished", (e) => {
      // jump bookkeeping (keep yours)
      if (e.action === actions.Jump) jumpAnimDone = true;
    
      // locomotion one-shots
      if (e.action === actions.StartWalk || e.action === actions.StopWalk) {
        if (pendingAfterOneShot) {
          const next = pendingAfterOneShot;
          pendingAfterOneShot = null;
          locoState = next;
          playAction(next, 0.12);
        } else {
          // safe fallback
          locoState = "Idle";
          playAction("Idle", 0.12);
        }
      }
    
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
    if (!danceActive) return; // only cancel if a dance is actually active
  
    const danceAction = actions[danceActive];
    danceActive = null;
  
    // Only fade out if we're currently playing that dance action
    if (danceAction && currentAction === danceAction) {
      currentAction.fadeOut(0.08);
      currentAction = null; // optional, but helps avoid stale refs
    }
  }

  function onJumpStart(){
    jumpAnimDone = false;
    playAction("Jump", 0.06);
  }

  function update(dt){
    if (mixer) mixer.update(dt);
  }

  function setLocomotion({ isMoving, isRunning, isJumping }) {
    if (!actions.Idle) return;
  
    // Jump always wins (no start/stop while jumping)
    if (isJumping) {
      locoState = "Jump";
      pendingAfterOneShot = null;
      playAction("Jump", 0.06);
      lastMoving = isMoving;
      lastRunning = isRunning;
      return;
    }
  
    // dances win too (your existing behavior)
    if (danceActive) {
      playAction(danceActive, 0.06);
      lastMoving = isMoving;
      lastRunning = isRunning;
      return;
    }
  
    const startedMoving = !lastMoving && isMoving;
    const stoppedMoving = lastMoving && !isMoving;
  
    // If we just started moving: StartWalk -> Walk (or Run)
    if (startedMoving) {
      locoState = "StartWalk";
      pendingAfterOneShot = isRunning ? "Run" : "Walk";
      playAction("StartWalk", 0.10);
      lastMoving = isMoving;
      lastRunning = isRunning;
      return;
    }
  
    // If we just stopped: StopWalk -> Idle
    if (stoppedMoving) {
      locoState = "StopWalk";
      pendingAfterOneShot = "Idle";
      playAction("StopWalk", 0.10);
      lastMoving = isMoving;
      lastRunning = isRunning;
      return;
    }
  
    // If currently in one-shot, do NOT override it every frame
    if (locoState === "StartWalk" || locoState === "StopWalk") {
      // but update what comes after if shift toggled during start
      if (locoState === "StartWalk") pendingAfterOneShot = isRunning ? "Run" : "Walk";
      lastMoving = isMoving;
      lastRunning = isRunning;
      return;
    }
  
    // normal loops
    if (isMoving && isRunning) {
      locoState = "Run";
      playAction("Run", 0.12);
    } else if (isMoving) {
      locoState = "Walk";
      playAction("Walk", 0.14);
    } else {
      locoState = "Idle";
      playAction("Idle", 0.18);
    }
  
    lastMoving = isMoving;
    lastRunning = isRunning;
  }

  function jumpFinished(){
    return jumpAnimDone;
  }

  return { init, update, setLocomotion, requestDance, cancelDance, onJumpStart, jumpFinished };
}
