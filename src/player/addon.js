// player/addon.js — flight logic (kept identical, just moved)

export function createFlightAddon({
  onFlightToggle = null,

  // access to controller state (no behavior change)
  getIsJumping,
  setIsJumping,
  getYVel,
  setYVel,
  getPlayerVisualY,
  setPlayerVisualY,
}) {
  let flightUnlocked = false;
  let flying = false;

  let flyY = getPlayerVisualY();
  let flyVelY = 0;

  const DOUBLE_TAP_WINDOW = 0.28;
  let lastSpaceDown = -999;
  let tapCount = 0;

  function setFlightUnlocked(v) {
    flightUnlocked = !!v;
    if (!flightUnlocked) {
      if (flying) setFlying(false);
    }
  }

  function setFlying(v) {
    const next = !!v;
    if (flying === next) return;

    flying = next;

    if (flying) {
      setIsJumping(false);
      setYVel(0);
      flyY = getPlayerVisualY();
      flyVelY = 0;
    } else {
      // snap back toward ground smoothly next frames
      flyVelY = 0;
    }

    onFlightToggle?.(flying);
  }

  function onSpaceDownToggleOrJump({ nowSeconds, setJumpRequested }) {
    // double-tap toggles flight (only after unlocked)
    if (flightUnlocked) {
      if (nowSeconds - lastSpaceDown <= DOUBLE_TAP_WINDOW) tapCount++;
      else tapCount = 1;

      lastSpaceDown = nowSeconds;

      if (tapCount >= 2) {
        tapCount = 0;
        setJumpRequested(false);
        setFlying(!flying);
        return true; // handled
      }
    }
    return false; // not handled (normal jump/ascend)
  }

  function flightUpdate(dt, {
    THREE,
    keys,
    isMoving,
    isRunning,
    sampleGroundY,
    FOOT_OFFSET,
    stamina,
    setStamina,
    staminaEl,
    setWindStrength,
    stepTimerRef,
    avatarApi,
  }) {
    // simple flight model:
    // - space ascend
    // - ctrl descend
    // - otherwise hover damping
    const ascend = keys.has(" ") || keys.has("spacebar");
    const descend = keys.has("control") || keys.has("ctrl");

    const V_UP = 8.0;
    const V_DN = 7.0;
    const HOVER_DAMP = 6.5;

    if (ascend) flyVelY = THREE.MathUtils.lerp(flyVelY, V_UP, 1 - Math.pow(0.001, dt));
    else if (descend) flyVelY = THREE.MathUtils.lerp(flyVelY, -V_DN, 1 - Math.pow(0.001, dt));
    else flyVelY = THREE.MathUtils.lerp(flyVelY, 0, 1 - Math.pow(0.001, dt * HOVER_DAMP));

    flyY += flyVelY * dt;

    // prevent going too low under terrain
    const ground = sampleGroundY() + FOOT_OFFSET;
    flyY = Math.max(ground + 0.6, flyY);

    setPlayerVisualY(flyY);

    // locomotion while flying (no jump)
    avatarApi?.setLocomotion?.({ isMoving, isRunning, isJumping: false });

    // stamina: optional (keep normal)
    if (isRunning && isMoving) setStamina(Math.max(0, stamina - dt * 0.18));
    else setStamina(Math.min(1, stamina + dt * 0.10));
    if (staminaEl) staminaEl.style.width = `${(Math.max(0, Math.min(1, stamina)) * 100).toFixed(1)}%`;

    setWindStrength?.(THREE.MathUtils.clamp(0.7 + (isMoving ? 0.25 : 0), 0, 1));

    // footsteps disabled in flight
    stepTimerRef.value = 0;

    return { flyY };
  }

  function syncFlyToCurrentY() {
    flyY = getPlayerVisualY();
    flyVelY = 0;
  }

  function isFlying() { return flying; }

  return {
    setFlightUnlocked,
    setFlying,
    isFlying,
    onSpaceDownToggleOrJump,
    flightUpdate,
    syncFlyToCurrentY,
  };
}
