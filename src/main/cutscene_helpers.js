// main/cutscene_helpers.js — cutscene + camera helpers, unchanged behavior

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function waitSeconds(sec) {
  return new Promise((res) => setTimeout(res, sec * 1000));
}

export function rafPromise() {
  return new Promise((res) => requestAnimationFrame(res));
}

export function snapInitialCamera({ THREE, camera, controls, player, playerVisual, tuning }) {
  const eye = new THREE.Vector3(0, 1.65, -4.2);
  const lookH = (playerVisual?.position?.y ?? 0) + tuning.LOOK_HEIGHT;

  camera.position.copy(player.position).add(eye);
  camera.lookAt(player.position.x, lookH, player.position.z + 2.5);

  if (controls) {
    controls.target.set(player.position.x, lookH, player.position.z);
    controls.update();
  }
}

export async function smoothReturnToGameplayCamera(
  { THREE, camera, controls, player, playerVisual, tuning, rafPromise, easeInOutCubic },
  duration = 0.65
) {
  const fromPos = camera.position.clone();
  const fromLook = controls.target.clone();

  const toTarget = new THREE.Vector3(
    player.position.x,
    playerVisual.position.y + tuning.LOOK_HEIGHT,
    player.position.z
  );

  const camOffset = fromPos.clone().sub(fromLook);
  const toPos = toTarget.clone().add(camOffset);

  let t = 0;
  while (t < duration) {
    await rafPromise();
    t += 1 / 60;
    const k = easeInOutCubic(Math.min(1, t / duration));

    camera.position.lerpVectors(fromPos, toPos, k);
    controls.target.lerpVectors(fromLook, toTarget, k);
    camera.lookAt(controls.target);
  }

  controls.update();
}

export function getPlayerForward({ THREE, player }, out) {
  out.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y).normalize();
  return out;
}

export function getPlayerRight({ THREE, player }, fwd, out) {
  getPlayerForward({ THREE, player }, fwd);
  out.copy(fwd).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(-1);
  return out;
}

export function getHeadWorld({ THREE, avatar, player, tuning }, out) {
  return (
    avatar.getHeadWorldPosition?.(out) ??
    out.copy(player.position).add(new THREE.Vector3(0, tuning.LOOK_HEIGHT, 0))
  );
}

export async function playFbxAndWait({ avatar }, name, { fade = 0.12, loop = false } = {}) {
  await avatar.playFbx?.(name, { fade, loop }).catch?.(() => {});
  if (loop) return;

  const mixer = avatar.getFbxMixer?.() ?? null;
  const dur = avatar.getFbxDurationSeconds?.(name) ?? 3.2;

  if (mixer?.addEventListener) {
    await new Promise((resolve) => {
      let done = false;
      const onFinish = () => {
        if (done) return;
        done = true;
        mixer.removeEventListener("finished", onFinish);
        resolve();
      };
      mixer.addEventListener("finished", onFinish);
      setTimeout(() => {
        if (done) return;
        done = true;
        mixer.removeEventListener("finished", onFinish);
        resolve();
      }, (dur + 0.25) * 1000);
    });
  } else {
    await waitSeconds(dur + 0.1);
  }
}

export async function showTitleNearEndOfStandUp(
  { getFbxDurationSeconds, waitSeconds, playIntroMusic, titleCard },
  { at = 0.8, minLeadSec = 0.6 } = {}
) {
  const dur = getFbxDurationSeconds("StandUp") ?? 3.2;
  let trigger = dur * at;
  trigger = Math.min(trigger, Math.max(0, dur - minLeadSec));

  await waitSeconds(trigger);

  playIntroMusic();
  titleCard.show({ duration: 3.2 }).catch?.(() => {});
}

export async function orbitCloseupAroundHead(
  { THREE, camera, controls, cutCam, avatar, tuning, rafPromise },
  {
    duration = 6.2,
    radius = 1.55,
    height = 0.28,
    yawTurns = 0.45,
    fov = 55,
  } = {}
) {
  cutCam.save();

  const oldFov = camera.fov;
  camera.fov = fov;
  camera.updateProjectionMatrix();

  const lookAt = new THREE.Vector3();
  const startYaw = controls.getAzimuthalAngle?.() ?? 0;
  const startAng = startYaw + 1.25;

  const head0 = (avatar.getHeadWorldPosition?.(new THREE.Vector3()) ?? new THREE.Vector3()).clone();
  lookAt.copy(head0).add(new THREE.Vector3(0, 0.1, 0));

  const startPos = head0.clone().add(new THREE.Vector3(
    Math.sin(startAng) * radius,
    height,
    Math.cos(startAng) * radius
  ));

  await new Promise((res) => cutCam.startShot({ pos: startPos, lookAt, duration: 0.55 }, res));

  const t0 = performance.now();
  while (true) {
    const t = (performance.now() - t0) / 1000;
    if (t >= duration) break;

    const h = avatar.getHeadWorldPosition?.(new THREE.Vector3()) ?? head0;
    lookAt.copy(h).add(new THREE.Vector3(0, 0.1, 0));

    const k = t / duration;
    const ang = startAng + k * (Math.PI * 2 * yawTurns);

    camera.position.set(
      h.x + Math.sin(ang) * radius,
      h.y + height,
      h.z + Math.cos(ang) * radius
    );

    controls.target.copy(lookAt);
    camera.lookAt(lookAt);

    await rafPromise();
  }

  camera.fov = oldFov;
  camera.updateProjectionMatrix();
}

export function hardSnapCameraToPlayer({ THREE, camera, controls, player, playerVisual, tuning, fpSys }) {
  const target = new THREE.Vector3(
    player.position.x,
    playerVisual.position.y + tuning.LOOK_HEIGHT,
    player.position.z
  );

  const camOffset = camera.position.clone().sub(controls.target);

  controls.target.copy(target);
  camera.position.copy(target).add(camOffset);

  controls.update();

  fpSys?.hardResetSmoothing?.();
}

export async function playLookAroundCloseup(
  { THREE, avatar, player, tuning, cutCam, waitSeconds, getHeadWorld, getPlayerForward, getPlayerRight },
  { holdSec = 10.0 } = {}
) {
  cutCam.save();

  const head = getHeadWorld();
  const fwd = getPlayerForward();
  const right = getPlayerRight();

  const camPos = head.clone()
    .addScaledVector(fwd, 0.85)
    .addScaledVector(right, 0.22)
    .add(new THREE.Vector3(0, 0.08, 0));

  const lookAt = head.clone().add(new THREE.Vector3(0, 0.05, 0));

  await new Promise((res) => cutCam.startShot({ pos: camPos, lookAt, duration: 0.65 }, res));

  await avatar.playFbx?.("LookAround", { fade: 0.12, loop: true }).catch?.(() => {});
  await waitSeconds(holdSec);

  avatar.stopAllFbx?.({ fade: 0.12, resume: true });
  cutCam.restore();
}
