import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { forceMeshVisible, stripRootTranslation, remapClipToAvatarBones } from "../extra/utils.js";

export const NPC_URL = "https://models.readyplayer.me/69616661e2b2692fdde7d964.glb";

export async function loadClipFBX(fbxLoader, name) {
  const url = `assets/anim/${name}.fbx`;
  const fbx = await new Promise((res, rej) => fbxLoader.load(url, res, undefined, rej));
  const clip = fbx.animations?.[0];
  if (!clip) throw new Error(`[NPC] FBX ${name} has no animation`);
  return clip;
}

export function prepSkinned(root) {
  forceMeshVisible?.(root);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.material && "envMapIntensity" in o.material) o.material.envMapIntensity = 0.0;
    if (o.material) o.material.needsUpdate = true;
  });
}

export function makeNpcInstance({ npcProto, clips }) {
  const root = SkeletonUtils.clone(npcProto);
  prepSkinned(root);

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};

  for (const k of Object.keys(clips)) {
    const c = clips[k];
    if (!c) continue;
    actions[k] = mixer.clipAction(c);
    actions[k].clampWhenFinished = true;
  }

  let current = null;

  function play(name, { fade = 0.15, loop = true, timeScale = 1.0 } = {}) {
    const a = actions[name];
    if (!a) return null;

    if (current && current !== a) current.fadeOut(fade);

    a.reset();
    a.setEffectiveTimeScale(timeScale);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.fadeIn(fade);
    a.play();

    current = a;
    return a;
  }

  function playOnce(name, { fade = 0.12, timeScale = 1.0 } = {}) {
    const a = play(name, { fade, loop: false, timeScale });
    if (!a) return Promise.resolve(false);

    return new Promise((resolve) => {
      const onFinished = (e) => {
        if (e.action !== a) return;
        mixer.removeEventListener("finished", onFinished);
        resolve(true);
      };
      mixer.addEventListener("finished", onFinished);
    });
  }

  return { root, mixer, play, playOnce };
}

// optional: one-call bundle creation
export async function buildNpcBundle({ gltfLoader, fbxLoader }) {
  const npcGltf = await new Promise((res, rej) => gltfLoader.load(NPC_URL, res, undefined, rej));
  const npcProto = npcGltf.scene;
  prepSkinned(npcProto);

  const rawIdle = await loadClipFBX(fbxLoader, "InjuredIdle");
  const rawTalk = await loadClipFBX(fbxLoader, "Talking");
  const rawFall = await loadClipFBX(fbxLoader, "FallingDown");
  const rawMoan = await loadClipFBX(fbxLoader, "LayingMoaning");

  const clips = {
    InjuredIdle: remapClipToAvatarBones(stripRootTranslation(rawIdle), npcProto, "NPC_InjuredIdle"),
    Talking: remapClipToAvatarBones(stripRootTranslation(rawTalk), npcProto, "NPC_Talking"),
    FallingDown: remapClipToAvatarBones(stripRootTranslation(rawFall), npcProto, "NPC_FallingDown"),
    LayingMoaning: remapClipToAvatarBones(stripRootTranslation(rawMoan), npcProto, "NPC_LayingMoaning"),
  };

  return { npcProto, clips };
}