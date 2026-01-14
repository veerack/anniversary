// player/player.js — main player controller (split from old player.js, unchanged behavior)

import * as THREE from "three";
import { clampToMap, resolveCollisionsXZ } from "./utils.js";
import { createGroundSampler } from "./helpers.js";
import { createFlightAddon } from "./addon.js";

export function createPlayerController({
  player,
  playerVisual,
  controls,
  tuning,
  staminaEl,
  playFootstep,
  setWindStrength,
  onJumpStart,
  onCancelDance,
  avatarApi,
  colliders = [],
  getAzimuthAngle = null,
  benches = [],
  onRequestStand,
  walkables = [],

  // ✅ flight hook
  onFlightToggle = null,
  isInWater = null,
}) {
  const keys = new Set();
  let jumpRequested = false;

  const FOOT_OFFSET = 0;

  const { sampleGroundY } = createGroundSampler({ walkables });

  let visualGroundY = sampleGroundY(player.position.x, player.position.z);
  playerVisual.position.y = visualGroundY + FOOT_OFFSET;

  let isJumping = false;
  let yVel = 0;
  let stepTimer = 0;
  let stamina = 1.0;

  const tmpMove = new THREE.Vector3();
  const dirF = new THREE.Vector3();
  const dirR = new THREE.Vector3();
  const mvNorm = new THREE.Vector3();
  const PLAYER_RADIUS = 0.55;

  let enabled = true;
  let groundedInit = false;

  // ============================================================
  // Flight (moved into addon, same behavior)
  // ============================================================

  const stepTimerRef = { value: 0 }; // keep identical semantics while allowing addon to zero it

  const flight = createFlightAddon({
    onFlightToggle,

    getIsJumping: () => isJumping,
    setIsJumping: (v) => { isJumping = !!v; },

    getYVel: () => yVel,
    setYVel: (v) => { yVel = v; },

    getPlayerVisualY: () => playerVisual.position.y,
    setPlayerVisualY: (v) => { playerVisual.position.y = v; },
  });

  // ============================================================
  // Controller enable/disable
  // ============================================================

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) {
      jumpRequested = false;
      keys.delete("w");
      keys.delete("a");
      keys.delete("s");
      keys.delete("d");
      keys.delete("shift");
    }
  }

  function startJump() {
    if (isJumping) return;
    isJumping = true;
    yVel = tuning.JUMP_VEL;
    onJumpStart?.();
  }

  // ============================================================
  // Input (kept in main so behavior is identical: listeners attach on controller creation)
  // ============================================================

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);

    if (k === "1") avatarApi?.requestDance?.("Samba");
    if (k === "2") avatarApi?.requestDance?.("Rumba");
    if (k === "3") avatarApi?.requestDance?.("Salsa");

    if (k === " " || k === "spacebar") {
      const now = performance.now() * 0.001;

      const handled = flight.onSpaceDownToggleOrJump({
        nowSeconds: now,
        setJumpRequested: (v) => { jumpRequested = !!v; },
      });

      if (handled) return;

      // not toggling flight:
      // - if flying: space is ascend (handled in update)
      // - else: request jump
      if (!flight.isFlying()) jumpRequested = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
  });

  let wasMoving = false;

  function snapToGroundNow() {
    const y = sampleGroundY(player.position.x, player.position.z);
    visualGroundY = y;
    playerVisual.position.y = visualGroundY + FOOT_OFFSET;

    // reset jump/vertical state
    isJumping = false;
    yVel = 0;

    // if you have flight:
    flight.syncFlyToCurrentY();
  }

  function updatePlayer(dt) {
    // keep stepTimerRef synced (addon may overwrite)
    stepTimerRef.value = stepTimer;

    if (!groundedInit) {
      groundedInit = true;
      visualGroundY = sampleGroundY(player.position.x, player.position.z);
      playerVisual.position.y = visualGroundY + FOOT_OFFSET;
      flight.syncFlyToCurrentY();
    }

    if (!enabled) {
      const tryingMove =
        keys.has("w") || keys.has("a") || keys.has("s") || keys.has("d") || keys.has(" ") || keys.has("spacebar");

      if (tryingMove) onRequestStand?.();

      const targetGround = sampleGroundY(player.position.x, player.position.z);
      visualGroundY = THREE.MathUtils.lerp(visualGroundY, targetGround, 1 - Math.pow(0.0001, dt));
      playerVisual.position.y = visualGroundY + FOOT_OFFSET;

      avatarApi?.setLocomotion?.({ isMoving: false, isRunning: false, isJumping: false, isSwimming: false });

      if (staminaEl) staminaEl.style.width = `100%`;
      setWindStrength?.(0.45);

      jumpRequested = false;
      return { isMoving: false, isRunning: false, isJumping: false, isSwimming: false };
    }

    // ----------------------------------------------------------
    // Movement intent
    // ----------------------------------------------------------

    const isRunning = keys.has("shift");
    const baseSpeed = isRunning ? tuning.RUN_SPEED : tuning.WALK_SPEED;

    let forward = 0, right = 0;
    if (keys.has("w")) forward -= 1;
    if (keys.has("s")) forward += 1;
    if (keys.has("d")) right += 1;
    if (keys.has("a")) right -= 1;

    const az = getAzimuthAngle ? getAzimuthAngle() : controls.getAzimuthalAngle();
    dirF.set(Math.sin(az), 0, Math.cos(az));
    dirR.set(Math.sin(az + Math.PI / 2), 0, Math.cos(az + Math.PI / 2));

    tmpMove.set(0, 0, 0);
    tmpMove.addScaledVector(dirF, forward);
    tmpMove.addScaledVector(dirR, right);

    const isMoving = tmpMove.lengthSq() > 0;

    if (!wasMoving && isMoving) onCancelDance?.();
    wasMoving = isMoving;

    // rotate toward movement
    if (isMoving) {
      mvNorm.copy(tmpMove).normalize();
      const targetYaw = Math.atan2(mvNorm.x, mvNorm.z);
      let d = targetYaw - player.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      player.rotation.y += d * Math.min(1, dt * 10);
    }

    // ----------------------------------------------------------
    // XZ translation
    // ----------------------------------------------------------

    if (isMoving) {
      const control = isJumping ? tuning.AIR_CONTROL : 1.0;
      mvNorm.copy(tmpMove).normalize().multiplyScalar(baseSpeed * control * dt);

      const nextPosX = player.position.x + mvNorm.x;
      const nextPosZ = player.position.z + mvNorm.z;

      const nextPos = tmpMove.set(nextPosX, 0, nextPosZ);
      clampToMap(nextPos, tuning.MAP_RADIUS);

      // collide in XZ using current Y (grounded or flight)
      const yForCols = playerVisual.position.y;
      resolveCollisionsXZ(nextPos, yForCols, colliders, PLAYER_RADIUS);

      player.position.x = nextPos.x;
      player.position.z = nextPos.z;
    }

    // ----------------------------------------------------------
    // Vertical: flight OR ground/jump
    // ----------------------------------------------------------

    if (flight.isFlying()) {
      const res = flight.flightUpdate(dt, {
        THREE,
        keys,
        isMoving,
        isRunning,
        sampleGroundY: () => sampleGroundY(player.position.x, player.position.z),
        FOOT_OFFSET,
        stamina,
        setStamina: (v) => { stamina = v; },
        staminaEl,
        setWindStrength,
        stepTimerRef,
        avatarApi,
      });

      // sync stepTimer back (addon sets stepTimerRef.value)
      stepTimer = stepTimerRef.value;

      // ignore jump requests while flying
      jumpRequested = false;

      return { isMoving, isRunning, isJumping: false, isSwimming: false };
    }

    // ground sampling
    const targetGround = sampleGroundY(player.position.x, player.position.z);
    visualGroundY = THREE.MathUtils.lerp(visualGroundY, targetGround, 1 - Math.pow(0.0001, dt));

    // jump edge
    if (jumpRequested) {
      jumpRequested = false;
      if (!isJumping) startJump();
    }

    // vertical physics (jump)
    if (isJumping) {
      yVel += tuning.GRAVITY * dt;
      playerVisual.position.y += yVel * dt;

      const landingY = visualGroundY + FOOT_OFFSET;
      if (playerVisual.position.y <= landingY) {
        playerVisual.position.y = landingY;
        yVel = 0;

        if (avatarApi?.jumpFinished?.() ?? true) isJumping = false;
      }
    } else {
      playerVisual.position.y = visualGroundY + FOOT_OFFSET;
    }

    const y = playerVisual.position.y;
    const swimming = isInWater ? !!isInWater(player.position.x, player.position.z, y) : false;

    avatarApi.setLocomotion?.({
      isMoving,
      isRunning: swimming ? false : isRunning,
      isJumping: swimming ? false : isJumping,
      isSwimming: swimming,
    });

    // footsteps
    if (!isJumping && isMoving) {
      const interval = isRunning ? tuning.STEP_INTERVAL_RUN : tuning.STEP_INTERVAL_WALK;
      stepTimer -= dt;
      if (stepTimer <= 0) {
        stepTimer = interval;
        playFootstep?.(isRunning ? 1.0 : 0.7);
      }
    } else {
      stepTimer = Math.min(stepTimer, 0.08);
    }

    // stamina
    if (isRunning && isMoving) stamina = Math.max(0, stamina - dt * 0.18);
    else stamina = Math.min(1, stamina + dt * 0.10);
    if (staminaEl) staminaEl.style.width = `${(stamina * 100).toFixed(1)}%`;

    // wind
    const windBase = 0.45 + 0.35 * Math.sin(performance.now() * 0.00015);
    const windMove = isMoving ? 0.35 : 0.0;
    setWindStrength?.(THREE.MathUtils.clamp(windBase + windMove, 0, 1));

    return { isMoving, isRunning, isJumping, isSwimming: swimming };
  }

  function updateCamera(dt) {
    const target = tmpMove.set(
      player.position.x,
      playerVisual.position.y + tuning.LOOK_HEIGHT,
      player.position.z
    );
    controls.target.lerp(target, 1 - Math.pow(0.001, dt));
    controls.update();
  }

  function isMovingNow() {
    return keys.has("w") || keys.has("a") || keys.has("s") || keys.has("d");
  }

  return {
    updatePlayer,
    updateCamera,
    isMovingNow,
    setEnabled,

    // ✅ exposed
    setFlightUnlocked: (v) => flight.setFlightUnlocked(v),
    snapToGroundNow,
  };
}
