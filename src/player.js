import * as THREE from "three";
import { terrainHeight } from "./terrain.js";

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
}){
  const keys = new Set();
  let jumpRequested = false;

  const FOOT_OFFSET = 0;
  let visualGroundY = terrainHeight(player.position.x, player.position.z);
  playerVisual.position.y = visualGroundY + FOOT_OFFSET;

  let isJumping = false;
  let yVel = 0;
  let stepTimer = 0;
  let stamina = 1.0;

  const tmpVec = new THREE.Vector3();

  const PLAYER_RADIUS = 0.55;
  
  function resolveCollisionsXZ(pos, y, colliders, playerRadius = 0.55) {
    if (!colliders?.length) return;
  
    // Iterate a few times so multiple overlaps resolve smoothly
    for (let iter = 0; iter < 4; iter++) {
      let pushed = false;
  
      for (const c of colliders) {
        // optional y-range filter
        if (y < c.yMin || y > c.yMax) continue;
  
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const d2 = dx * dx + dz * dz;
  
        const minD = c.r + playerRadius;
        if (d2 >= minD * minD) continue;
  
        const d = Math.sqrt(d2) || 0.0001;
        const nx = dx / d;
        const nz = dz / d;
  
        const penetration = (minD - d);
  
        // ✅ clamp per-contact push so you never “launch”
        const push = Math.min(penetration, 0.35);
  
        pos.x += nx * push;
        pos.z += nz * push;
  
        pushed = true;
      }
  
      if (!pushed) break;
    }
  }
  
  function clampToMap(pos) {
    const d = Math.hypot(pos.x, pos.z);
    if (d > tuning.MAP_RADIUS) {
      const s = tuning.MAP_RADIUS / d;
      pos.x *= s;
      pos.z *= s;
    }
  }

  function startJump() {
    if (isJumping) return;
    isJumping = true;
    yVel = tuning.JUMP_VEL;
    onJumpStart?.();
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);

    if (k === "1") avatarApi?.requestDance("Samba");
    if (k === "2") avatarApi?.requestDance("Rumba");
    if (k === "3") avatarApi?.requestDance("Salsa");

    if (k === " " || k === "spacebar") jumpRequested = true;
  });

  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  function updatePlayer(dt){
    if (jumpRequested && !isJumping) { jumpRequested = false; startJump(); }
    else if (jumpRequested) { jumpRequested = false; }

    const isRunning = keys.has("shift");
    const speed = isRunning ? tuning.RUN_SPEED : tuning.WALK_SPEED;

    let forward = 0, right = 0;
    if (keys.has("w")) forward -= 1;
    if (keys.has("s")) forward += 1;
    if (keys.has("d")) right += 1;
    if (keys.has("a")) right -= 1;

    const az = controls.getAzimuthalAngle();
    const dirF = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
    const dirR = new THREE.Vector3(Math.sin(az + Math.PI/2), 0, Math.cos(az + Math.PI/2));

    tmpVec.set(0,0,0);
    tmpVec.addScaledVector(dirF, forward);
    tmpVec.addScaledVector(dirR, right);

    const isMoving = tmpVec.lengthSq() > 0;

    if (isMoving) {
      const mv = tmpVec.clone().normalize();
      const targetYaw = Math.atan2(mv.x, mv.z);
      let d = targetYaw - player.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      player.rotation.y += d * Math.min(1, dt * 10);
    }

    if (isMoving) {
      const control = isJumping ? tuning.AIR_CONTROL : 1.0;
      tmpVec.normalize().multiplyScalar(speed * control * dt);
    
      // propose new position
      const nextPos = player.position.clone().add(tmpVec);
    
      // keep in map
      clampToMap(nextPos);
    
      // collide in XZ using *nextPos* and the injected colliders
      resolveCollisionsXZ(nextPos, playerVisual.position.y, colliders, PLAYER_RADIUS);
    
      // commit
      player.position.copy(nextPos);
    }

    if (isMoving) {
      onCancelDance?.();
    }

    const targetGround = terrainHeight(player.position.x, player.position.z);
    visualGroundY = THREE.MathUtils.lerp(visualGroundY, targetGround, 1 - Math.pow(0.0001, dt));

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

    // locomotion anim
    if (!isJumping) {
      avatarApi?.setLocomotion?.({ isMoving, isRunning, isJumping:false });
    }

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

    if (avatarApi?.jumpFinished?.() ?? true) {
      isJumping = false;
    
      const movingNow = isMovingNow();
      const runningNow = keys.has("shift");
    
      avatarApi?.setLocomotion?.({
        isMoving: movingNow,
        isRunning: runningNow,
        isJumping: false
      });
    }
    
    // stamina
    if (isRunning && isMoving) stamina = Math.max(0, stamina - dt*0.18);
    else stamina = Math.min(1, stamina + dt*0.10);
    if (staminaEl) staminaEl.style.width = `${(stamina*100).toFixed(1)}%`;

    // wind audio
    const moving = isMoving;
    const windBase = 0.45 + 0.35 * Math.sin(performance.now() * 0.00015);
    const windMove = moving ? 0.35 : 0.0;
    setWindStrength?.(THREE.MathUtils.clamp(windBase + windMove, 0, 1));

    return { isMoving, isRunning, isJumping };
  }

  function updateCamera(dt){
    const target = player.position.clone();
    target.y = playerVisual.position.y + tuning.LOOK_HEIGHT;
    controls.target.lerp(target, 1 - Math.pow(0.001, dt));
    controls.update();
  }

  function isMovingNow(){
    return keys.has("w") || keys.has("a") || keys.has("s") || keys.has("d");
  }

  return { updatePlayer, updateCamera, isMovingNow };
}
