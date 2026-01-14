// avatar/utils.js
import * as THREE from "three";

export function playAction(actions, state, name, fade = 0.14) {
  const next = actions[name];
  if (!next) return;
  if (state.currentAction === next) return;

  if (state.currentAction) state.currentAction.fadeOut(fade);
  state.currentAction = next;
  state.currentAction.enabled = true;
  state.currentAction.setEffectiveWeight(1);
  state.currentAction.reset().fadeIn(fade).play();
}

export function getHeadWorldQuaternion({ avatarRoot, headNode }, out = new THREE.Quaternion()) {
  if (!avatarRoot || !headNode) return out.identity();
  avatarRoot.updateWorldMatrix(true, true);
  headNode.getWorldQuaternion(out);
  return out;
}

export function getHeadWorldPosition({ avatarRoot, headNode, tmpHeadPos }, out = tmpHeadPos) {
  if (!avatarRoot) return out.set(0, 1.6, 0);

  avatarRoot.updateWorldMatrix(true, true);

  if (headNode) {
    headNode.getWorldPosition(out);
    return out;
  }

  avatarRoot.getWorldPosition(out);
  out.y += 1.55;
  return out;
}

export function setFirstPersonMode({ avatarRoot, fpHidden }, enabled) {
  if (!avatarRoot) return;

  if (!enabled) {
    for (const o of fpHidden) o.visible = true;
    fpHidden.length = 0;
    return;
  }

  fpHidden.length = 0;

  avatarRoot.traverse((o) => {
    if (!o.isMesh) return;

    const n = (o.name || "").toLowerCase();
    const mn = (o.material?.name || "").toLowerCase();

    const isRPMHeadPart =
      n.includes("wolf3d_head") ||
      n.includes("wolf3d_teeth") ||
      n.includes("wolf3d_beard") ||
      n.includes("wolf3d_hair") ||
      n.includes("wolf3d_eyebrows") ||
      n.includes("wolf3d_eyes") ||
      n.includes("eye") ||
      n.includes("teeth") ||
      n.includes("tongue");

    const isRPMHeadMat =
      mn.includes("wolf3d_head") ||
      mn.includes("wolf3d_teeth") ||
      mn.includes("wolf3d_hair") ||
      mn.includes("wolf3d_beard") ||
      mn.includes("wolf3d_eyes");

    if (isRPMHeadPart || isRPMHeadMat) {
      if (o.visible !== false) fpHidden.push(o);
      o.visible = false;
    }
  });
}
