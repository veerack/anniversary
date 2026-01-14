// interactables.js (GENERIC HELPER)
import * as THREE from "three";

/**
 * Generic registration helper:
 * - If you pass `obj`, it uses that.
 * - If you pass `anchorPos`, it creates an Object3D at that position.
 * Returns an unregister function (from interactions.add).
 */
export function registerInteractable({
  scene,
  interactions,
  id,
  obj = null,
  anchorPos = null,
  radius = 2.6,
  priority = 0,
  enabled,
  getText,
  onInteract,
}) {
  if (!interactions) throw new Error("registerInteractable: interactions is required");
  if (!scene) throw new Error("registerInteractable: scene is required");
  if (!id) throw new Error("registerInteractable: id is required");
  if (typeof getText !== "function") throw new Error("registerInteractable: getText() is required");
  if (typeof onInteract !== "function") throw new Error("registerInteractable: onInteract() is required");

  const targetObj =
    obj ??
    (() => {
      if (!anchorPos) throw new Error("registerInteractable: provide obj or anchorPos");
      const a = new THREE.Object3D();
      a.position.copy(anchorPos);
      scene.add(a);
      return a;
    })();

  return interactions.add({
    id,
    obj: targetObj,
    radius,
    priority,
    enabled,
    getText,
    onInteract,
  });
}
