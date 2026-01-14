// avatar/addon.js — wings system
import * as THREE from "three";

export function createWingsAddon({ gltfLoader }) {
  let wings = {
    ready: false,
    root: null,
    mixer: null,
    action: null,
    clip: null,
    attached: false,
    flying: false,
  };

  function findBackBone(root) {
    const preferred = [
      "Spine2", "spine2", "mixamorigSpine2", "mixamorig:Spine2",
      "UpperChest", "upperchest", "mixamorigUpperChest", "mixamorig:UpperChest",
      "Chest", "chest", "mixamorigChest", "mixamorig:Chest",
      "Spine1", "spine1", "mixamorigSpine1", "mixamorig:Spine1",
    ];

    for (const n of preferred) {
      const o = root.getObjectByName(n);
      if (o && (o.isBone || o.type === "Bone")) return o;
    }

    let best = null;
    root.traverse((o) => {
      if (best) return;
      if (!o.isBone) return;
      const name = (o.name || "").toLowerCase();
      if (name.includes("spine2") || name.includes("upperchest") || name.includes("chest")) best = o;
    });
    if (best) return best;

    root.traverse((o) => {
      if (best) return;
      if (!o.isBone) return;
      const name = (o.name || "").toLowerCase();
      if (name.includes("spine")) best = o;
    });
    return best || null;
  }

  async function attachWings(avatarRoot, {
    url = "assets/models/wings.glb",
    scale = 1.0,
    offset = new THREE.Vector3(0, 0.2, -0.14),
    yaw = 0,
  } = {}) {
    if (!avatarRoot) return null;
    if (wings.attached && wings.root) return wings.root;

    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(url, resolve, undefined, reject);
    });

    const wRoot = gltf.scene;
    wRoot.name = "__WINGS__";

    wRoot.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material && "envMapIntensity" in o.material) o.material.envMapIntensity = 0.0;
      if (o.material) o.material.needsUpdate = true;
    });

    wRoot.scale.setScalar(scale);
    wRoot.position.copy(offset);
    wRoot.rotation.y = yaw;

    const backBone = findBackBone(avatarRoot);
    if (!backBone) {
      console.warn("[wings] Back bone not found; attaching to avatarRoot");
      avatarRoot.add(wRoot);
    } else {
      backBone.add(wRoot);
    }

    const clips = gltf.animations || [];
    const clip = clips.length ? clips[0] : null;

    let wMixer = null;
    let wAction = null;

    if (clip) {
      wMixer = new THREE.AnimationMixer(wRoot);
      wAction = wMixer.clipAction(clip);
      wAction.loop = THREE.LoopRepeat;
      wAction.repetitions = Infinity;
      wAction.enabled = true;
      wAction.clampWhenFinished = false;
      wAction.paused = true;
      wAction.play();
    }

    wings = {
      ready: true,
      root: wRoot,
      mixer: wMixer,
      action: wAction,
      clip,
      attached: true,
      flying: false,
    };

    return wRoot;
  }

  function setWingsFlying(v) {
    if (!wings.attached || !wings.ready) return;
    const flying = !!v;
    wings.flying = flying;

    if (wings.action) {
      wings.action.paused = !flying;
      wings.action.setEffectiveTimeScale(flying ? 1.35 : 0.0);
    }
  }

  function update(dt) {
    if (wings.mixer && wings.flying) wings.mixer.update(dt);
  }

  return {
    attachWings,
    setWingsFlying,
    update,
  };
}
