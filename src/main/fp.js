// main/fp.js — first-person system (PointerLock + smoothing), unchanged behavior
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

export function createFirstPersonSystem({
  THREE,
  camera,
  rendererDom,
  controls,
  avatarApi,
  tuning,
  tmp, // { _tmpV3a, _tmpV3b, _tmpV3c }
}) {
  const fp = {
    enabled: false,
    yaw: 0,
    pitch: 0,
    yawT: 0,
    pitchT: 0,
    sensitivity: 0.00155,
    minPitch: -1.25,
    maxPitch: 1.25,
    rotSmooth: 28,
    posSmooth: 22,
    camPos: new THREE.Vector3(),
    initialized: false,
    deadzone: 0.0,
  };

  const plc = new PointerLockControls(camera, rendererDom);

  const _qHead = new THREE.Quaternion();
  const _eyeTarget = new THREE.Vector3();
  const _eyeSmoothed = new THREE.Vector3();
  let _eyeInit = false;

  function computeStableEyeTarget(out, player) {
    const head = avatarApi.getHeadWorldPosition?.(tmp._tmpV3a) ?? null;

    if (!head) {
      return out.copy(player.position).add(new THREE.Vector3(0, tuning.LOOK_HEIGHT + 0.15, 0));
    }

    const yawOnly = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), fp.yaw);
    const forward = tmp._tmpV3b.set(0, 0, -1).applyQuaternion(yawOnly).normalize();

    out.copy(head).addScaledVector(forward, 0.3).add(new THREE.Vector3(0, 0.06, 0));

    const rel = tmp._tmpV3c.copy(out).sub(head);
    const along = rel.dot(forward);
    if (along < 0.06) out.addScaledVector(forward, 0.06 - along);

    return out;
  }

  function toggleFirstPerson() {
    fp.enabled = !fp.enabled;

    avatarApi.setFirstPersonMode?.(fp.enabled);

    if (fp.enabled) {
      fp._oldNear = camera.near;
      camera.near = 0.03;
      camera.updateProjectionMatrix();

      const eul = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      fp.yaw = fp.yawT = eul.y;
      fp.pitch = fp.pitchT = eul.x;

      _eyeInit = false;
      controls.enabled = false;
      plc.lock();
    } else {
      camera.near = fp._oldNear ?? 0.1;
      camera.updateProjectionMatrix();

      _eyeInit = false;
      plc.unlock();
      controls.enabled = true;
    }
  }

  document.addEventListener("mousemove", (e) => {
    if (!fp.enabled || document.pointerLockElement !== rendererDom) return;

    const mx = Math.abs(e.movementX) < fp.deadzone ? 0 : e.movementX;
    const my = Math.abs(e.movementY) < fp.deadzone ? 0 : e.movementY;

    fp.yawT -= mx * fp.sensitivity;
    fp.pitchT -= my * fp.sensitivity;
    fp.pitchT = THREE.MathUtils.clamp(fp.pitchT, fp.minPitch, fp.maxPitch);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "F5") {
      e.preventDefault();
      toggleFirstPerson();
    }
  });

  plc.addEventListener("unlock", () => {
    if (fp.enabled) {
      fp.enabled = false;
      controls.enabled = true;
      avatarApi.setFirstPersonMode?.(false);
      fp.initialized = false;
      _eyeInit = false;
    }
  });

  function update(dt, { THREE, player }) {
    const rotA = 1 - Math.exp(-fp.rotSmooth * dt);
    fp.yaw = THREE.MathUtils.lerp(fp.yaw, fp.yawT, rotA);
    fp.pitch = THREE.MathUtils.lerp(fp.pitch, fp.pitchT, rotA);

    camera.rotation.set(fp.pitch, fp.yaw, 0, "YXZ");
    computeStableEyeTarget(_eyeTarget, player);

    const posA = 1 - Math.exp(-fp.posSmooth * dt);
    if (!_eyeInit) {
      _eyeSmoothed.copy(_eyeTarget);
      _eyeInit = true;
    } else {
      _eyeSmoothed.lerp(_eyeTarget, posA);
    }
    camera.position.copy(_eyeSmoothed);
  }

  function hardResetSmoothing() {
    _eyeInit = false;
    fp.initialized = false;
  }

  return { fp, plc, toggleFirstPerson, update, hardResetSmoothing };
}
