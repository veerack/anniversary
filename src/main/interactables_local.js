// main/interactables_local.js — sitting + world interactables + book stand (split), unchanged behavior
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { pickSpots } from "../props/helpers.js";

let lockPlayerY = false;
let preSitPlayerY = 0;

let standGroundY = 0;     // ground at bench XZ (the Y we want after standing)
let standVisualDelta = 0; // playerVisual.y - player.position.y in normal standing

export function createSittingAndInteractablesSystem({
  THREE,
  scene,
  interactions,
  registerInteractable,
  starMgr,
  world,
  player,
  playerVisual,
  playerCtl,
  controls,
  avatar,
  sitPopups,
  dialogue,
  DIALOGUES,
  TUNING,

  getCutsceneActive,
  setCutsceneActive,
  getUiModalActive,
  setUiModalActive,

  getBookUsed,
  setBookUsed,

  bookOverlay,
  cutCam,

  getHeadWorld,
  getPlayerForward,
  getPlayerRight,

  rafPromise,
  waitSeconds,

  playLookAroundCloseup,
  showAnnouncement,
  startGodlyMusic,
  startDivineSequence,

  terrainHeight,
}) {
  // Sitting state
  let activeBench = null;

  // ✅ Y offset so avatar root aligns correctly with seat height
  let sitYOffset = 0;
  const SIT_LIFT = 0.48
  let preSitVisualY = 0;
  let standingUp = false;

  function sitOnBench(bench) {
    if (!bench) return;

    activeBench = bench;

    // capture the *current* standing relationship BEFORE we move to the bench
    preSitPlayerY = player.position.y;
    preSitVisualY = playerVisual.position.y;
    standVisualDelta = preSitVisualY - preSitPlayerY;

    avatar.stopAllFbx?.({ fade: 0.1, resume: false });
    playerCtl.setEnabled(false);

    // move to bench XZ
    player.position.x = bench.seatPos.x;
    player.position.z = bench.seatPos.z;
    player.rotation.y = bench.seatYaw;

    // compute bench-ground Y and set physics body on it
    standGroundY = terrainHeight(player.position.x, player.position.z);
    if (!Number.isFinite(standGroundY)) standGroundY = player.position.y;
    player.position.y = standGroundY;

    // lock visuals up to the seat height
    lockPlayerY = true;
    playerVisual.position.y = bench.seatPos.y + SIT_LIFT;

    avatar.startSitting?.();
    sitPopups.setEnabled(true);
  }

  async function standFromBench() {
    if (!activeBench) return;

    standingUp = true;

    // stop forcing seat snap updates during stand-up (but we will hold the Y manually)
    lockPlayerY = false;

    sitPopups.setEnabled(false);
    sitPopups.stopMusic?.();

    // request stand animation
    avatar.standUp?.();

    // keep controller disabled while standing up
    playerCtl.setEnabled(false);

    // HOLD visuals at seat height while SitToStand plays
    const seatY = activeBench.seatPos.y + SIT_LIFT;

    for (let i = 0; i < 240; i++) {
      await rafPromise();

      // keep the physics body on the bench ground at bench XZ
      player.position.x = activeBench.seatPos.x;
      player.position.z = activeBench.seatPos.z;
      player.position.y = standGroundY;

      // keep visuals fixed on seat during the animation
      playerVisual.position.y = seatY;

      // break when animation finished (sitState -> none)
      if (!avatar.isSitting?.()) break;
    }

    // NOW restore standing ground at bench XZ
    player.position.y = standGroundY;
    playerVisual.position.y = standGroundY + standVisualDelta;

    activeBench = null;

    playerCtl.setEnabled(true);
    playerCtl.snapToGroundNow?.();

    // do NOT cancelSittingImmediately here; it can kill the last frames / pop pose
    avatar.cancelSittingImmediately?.({ fade: 0.06, resume: true });
    standingUp = false;
  }

  function registerWorldInteractables() {
    const list = world.interactables || [];
    for (const it of list) {
      if (it._added) continue;
      it._added = true;

      registerInteractable({
        scene,
        interactions,
        id: it.id,
        obj: it.obj || null,
        anchorPos: it.anchorPos || null,
        radius: it.radius ?? 2.6,
        priority: it.priority ?? 0,
        enabled: () => !getCutsceneActive() && !getUiModalActive() && (it.enabled ? it.enabled() : true),

        getText: () => {
          if (it.type === "bench") return activeBench ? "Press E to stand" : "Press E to sit";
          return typeof it.getText === "function" ? it.getText(it) : it.text ?? "Press E";
        },

        onInteract: () => {
          starMgr.collect(it.id);

          if (it.type === "bench") {
            if (activeBench) standFromBench();
            else sitOnBench(it.bench);
            return;
          }

          if (it.type === "boba" || it.type === "flower" || it.type === "logs" || it.type === "wood_fire") {
            runDialogueMemory({ memoryId: it.id, type: it.type, targetObj: it.obj });
            return;
          }

          if (typeof it.onInteract === "function") it.onInteract(it);
        },
      });
    }
  }

  async function runDialogueMemory({ memoryId, type, targetObj }) {
    setCutsceneActive(true);
    playerCtl.setEnabled(false);
    controls.enabled = false;

    cutCam.save();

    const head = getHeadWorld();
    const fwd = getPlayerForward();
    const right = getPlayerRight();

    const frontPos = new THREE.Vector3().copy(head).addScaledVector(fwd, 1.35).add(new THREE.Vector3(0, 0.1, 0));
    const frontLook = head.clone().add(new THREE.Vector3(0, 0.05, 0));

    const sidePos = head.clone().addScaledVector(fwd, 1.25).addScaledVector(right, 0.85).add(new THREE.Vector3(0, 0.05, 0));
    const sideLook = head.clone();

    const cutCamRestorePos = controls.object.position.clone();
    const cutCamRestoreLook = controls.target.clone();

    if (type === "wood_fire" && targetObj) {
      targetObj.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(targetObj);
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      const dir = new THREE.Vector3(0.35, 0.25, 1).normalize();

      const firePos1 = c.clone().addScaledVector(dir, Math.max(2.0, size * 0.9));
      const firePos2 = c.clone().addScaledVector(dir, Math.max(1.2, size * 0.55));

      await new Promise((res) => cutCam.startShot({ pos: firePos1, lookAt: c, duration: 0.9 }, res));

      let elapsed = 0;
      const dolly = () => {
        const dt = 1 / 60;
        elapsed += dt;
        const k = Math.min(1, elapsed / 5.0);
        controls.object.position.lerpVectors(firePos1, firePos2, k);
        controls.object.lookAt(c);
        if (k < 1) requestAnimationFrame(dolly);
      };
      dolly();

      await new Promise((r) => setTimeout(r, 5000));
    }

    if (type === "flower") {
      await new Promise((res) => cutCam.startShot({ pos: sidePos, lookAt: sideLook, duration: 0.85 }, res));
      avatar.playFbx?.("Lifting");
      await new Promise((r) => setTimeout(r, 1800));
    }

    await new Promise((res) => cutCam.startShot({ pos: frontPos, lookAt: frontLook, duration: 0.85 }, res));

    if (type === "boba" || type === "logs" || type === "wood_fire") {
      avatar.playFbx?.("Talking");
    }

    const lines =
      type === "boba" ? DIALOGUES.boba :
        type === "logs" ? DIALOGUES.logs :
          type === "flower" ? DIALOGUES.flower :
            type === "wood_fire" ? DIALOGUES.wood_fire :
              ["..."];

    dialogue.start(lines, {
      onComplete: async () => {
        await new Promise((res) => cutCam.startShot({ pos: cutCamRestorePos, lookAt: cutCamRestoreLook, duration: 0.9 }, res));
        cutCam.restore();
        playerCtl.setEnabled(true);
        controls.enabled = true;
        setCutsceneActive(false);
        starMgr.collect(memoryId);
        avatar.stopAllFbx?.({ fade: 0.12, resume: true });
      },
    });
  }

  async function spawnBookStandInFront() {
    const loader = new GLTFLoader();
    const gltf = await new Promise((res, rej) =>
      loader.load("assets/models/BookStand.glb", res, undefined, rej)
    );

    const obj = gltf.scene;
    obj.name = "__BOOK_STAND__";
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });

    const yaw = player.rotation.y;
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).normalize();
    const px = 40;
    const pz = -7;
    const py = terrainHeight(px, pz);

    obj.position.set(px, py, pz);
    obj.rotation.y = yaw + Math.PI;
    obj.scale.setScalar(1.0);

    scene.add(obj);

    registerInteractable({
      scene,
      interactions,
      id: `setpiece:bookstand:${Date.now()}`,
      obj,
      radius: 4,
      priority: 0,
      enabled: () => !getCutsceneActive() && !getUiModalActive() && !getBookUsed(),
      getText: () => "Press E to read",
      onInteract: () => {
        setBookUsed(true);
        setUiModalActive(true);

        bookOverlay.open({
          onClosed: async () => {
            startGodlyMusic({ reset: true });

            setCutsceneActive(true);
            playerCtl.setEnabled(false);
            controls.enabled = false;

            const announceP = showAnnouncement({
              title: "A special NPC Spawned!",
              subtitle: "A divine power seems to be approaching... something is about to happen",
              duration: 10.0,
            });

            const lookP = playLookAroundCloseup({ holdSec: 10.0 });

            await Promise.all([announceP, lookP]);

            await startDivineSequence({ npcPos: null });
          },
        });
      },
    });
  }

  // Input: E key
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "e") return;

    if (activeBench) {
      standFromBench();
      return;
    }

    if (getUiModalActive()) return;
    if (getCutsceneActive()) return;

    interactions.interact();
  });

  function updateSittingSnap() {
    if (!activeBench) return;

    // during stand-up, standFromBench() is controlling the Y; don't touch visuals here
    if (standingUp) {
      player.position.x = activeBench.seatPos.x;
      player.position.z = activeBench.seatPos.z;
      player.position.y = standGroundY;
      player.rotation.y = activeBench.seatYaw;
      return;
    }

    player.position.x = activeBench.seatPos.x;
    player.position.z = activeBench.seatPos.z;
    player.position.y = standGroundY;
    player.rotation.y = activeBench.seatYaw;

    if (lockPlayerY) {
      playerVisual.position.y = activeBench.seatPos.y + SIT_LIFT;
    }
  }

  return {
    // expose pieces app.js expects
    registerWorldInteractables,
    spawnBookStandInFront,
    updateSittingSnap,

    // sitting state
    get activeBench() { return activeBench; },
    sitOnBench,
    standFromBench,

    // keep manualPopups accessible
    manualPopups: null, // will be attached by app.js after construction if desired
  };
}