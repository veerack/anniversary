// cutscene_camera.js
import * as THREE from "three";

const _v3a = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _v3c = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();

function easeInOut(t) {
  return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
}

// Build a quaternion that looks from pos → target, with up=(0,1,0)
function lookQuat(pos, target) {
  _m4.lookAt(pos, target, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromRotationMatrix(_m4);
}

export function createCutsceneCamera({ camera, controls } = {}) {
  let active = false;

  let fromPos = new THREE.Vector3();
  let toPos = new THREE.Vector3();
  let fromQ = new THREE.Quaternion();
  let toQ = new THREE.Quaternion();

  let t = 0;
  let dur = 1;
  let onDone = null;

  let saved = null;

  function save() {
    saved = {
      camPos: camera.position.clone(),
      camQ: camera.quaternion.clone(),
      target: controls?.target?.clone?.() ?? null,
      enabled: controls?.enabled ?? true,
    };
  }

  function restore() {
    if (!saved) return;
    camera.position.copy(saved.camPos);
    camera.quaternion.copy(saved.camQ);
    if (controls?.target && saved.target) controls.target.copy(saved.target);
    if (controls) controls.enabled = saved.enabled;
    saved = null;
  }

  function startShot({ pos, lookAt, duration = 1.0, disableControls = true }, cb) {
    active = true;
    t = 0;
    dur = Math.max(0.001, duration);
    onDone = cb || null;

    fromPos.copy(camera.position);
    fromQ.copy(camera.quaternion);

    toPos.copy(pos);
    toQ.copy(lookQuat(pos, lookAt));

    if (disableControls && controls) controls.enabled = false;
  }

  function update(dt) {
    if (!active) return;
    t += dt;
    const u = Math.min(1, t / dur);
    const k = easeInOut(u);

    camera.position.lerpVectors(fromPos, toPos, k);

    _q1.copy(fromQ);
    _q2.copy(toQ);
    camera.quaternion.slerpQuaternions(_q1, _q2, k);

    if (u >= 1) {
      active = false;
      const cb = onDone; onDone = null;
      cb?.();
    }
  }

  return {
    save,
    restore,
    startShot,
    update,
    isActive: () => active,
  };
}
