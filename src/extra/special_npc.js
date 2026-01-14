// special_npc.js
// FIX: clone skinned RPM properly using SkeletonUtils.clone()
// FIX: disable frustum culling on skinned meshes + recompute bounds
// (altar stays as normal clone)

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

import { stripRootTranslation, remapClipToAvatarBones, forceMeshVisible } from "./utils.js";

// ------------------------------------------------------------
// Shared loaders + caches
// ------------------------------------------------------------
const _gltfLoader = new GLTFLoader();
const _fbxLoader = new FBXLoader();

const _protoCache = new Map();      // url -> gltf.scene
const _altarCache = new Map();      // url -> gltf.scene
const _fbxClipCache = new Map();    // path -> AnimationClip

// ------------------------------------------------------------
// Temp vectors
// ------------------------------------------------------------
const _up = new THREE.Vector3(0, 1, 0);
const _v3a = new THREE.Vector3();
const _v3b = new THREE.Vector3();

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function isFiniteNumber(x) { return typeof x === "number" && Number.isFinite(x); }

function randomPointInDisk(R, minR = 0) {
  const a = Math.random() * Math.PI * 2;
  const u = Math.random();
  const r = Math.sqrt(u * (R * R - minR * minR) + minR * minR);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

async function loadProtoGLB(url) {
  if (_protoCache.has(url)) return _protoCache.get(url);
  const gltf = await new Promise((res, rej) => _gltfLoader.load(url, res, undefined, rej));
  _protoCache.set(url, gltf.scene);
  return gltf.scene;
}

async function loadAltarGLB(url) {
  if (_altarCache.has(url)) return _altarCache.get(url);
  const gltf = await new Promise((res, rej) => _gltfLoader.load(url, res, undefined, rej));
  _altarCache.set(url, gltf.scene);
  return gltf.scene;
}

async function loadFbxClip(fullPath) {
  if (_fbxClipCache.has(fullPath)) return _fbxClipCache.get(fullPath);
  const fbx = await new Promise((res, rej) => _fbxLoader.load(fullPath, res, undefined, rej));
  const clip = fbx.animations?.[0] || null;
  _fbxClipCache.set(fullPath, clip);
  return clip;
}

function setShadows(root, cast = true, receive = true) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = cast;
    o.receiveShadow = receive;
  });
}

// ✅ Props.js-style pivot rebasing: offset MODEL INSIDE a wrapper group.
function wrapPivotAtBottom(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);

  if (!isFinite(box.min.y) || !isFinite(box.max.y)) {
    const pivot = new THREE.Group();
    pivot.add(root);
    return { pivot, bottomOffset: 0 };
  }

  const bottomOffset = -box.min.y;

  const pivot = new THREE.Group();
  pivot.add(root);

  // IMPORTANT: set, not +=, so it never accumulates if called twice
  root.position.y = bottomOffset;

  pivot.updateWorldMatrix(true, true);
  return { pivot, bottomOffset };
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
export async function spawnSpecialNpc({
  scene,
  mapRadius = 95,
  npcUrl,
  animFolder = "assets/anim",
  altarUrl = "assets/models/altar.glb",
  injuredAnim = "InjuredIdle.fbx",
  scale = 1.0,

  sampleHeight = async () => 0,

  maxAbsCoord = 100_000,
  minSpawnRadius = 120,
  maxSpawnRadius = 100_000,

  altarBehind = 1.7,
  altarLeft = 0.7,
} = {}) {
  if (!scene) throw new Error("[spawnSpecialNpc] scene is required");
  if (!npcUrl) throw new Error("[spawnSpecialNpc] npcUrl is required");

  // ----------------------------------------------------------
  // Pick location
  // ----------------------------------------------------------
  const R = Math.min(maxSpawnRadius, maxAbsCoord, Math.max(50, mapRadius));
  const minR = Math.min(Math.max(0, minSpawnRadius), R * 0.95);

  let { x, z } = randomPointInDisk(R, minR);
  x = clamp(x, -maxAbsCoord, maxAbsCoord);
  z = clamp(z, -maxAbsCoord, maxAbsCoord);

  let y = await sampleHeight(x, z);
  if (!isFiniteNumber(y)) y = 0;

  const yaw = Math.random() * Math.PI * 2;

  // ----------------------------------------------------------
  // NPC load + CLONE (FIXED) + pivot-rebase
  // ----------------------------------------------------------
  const npcProto = await loadProtoGLB(npcUrl);

  // ✅ FIX: Proper skinned clone (prevents “one body part at 0,0,0”)
  const npcModel = SkeletonUtils.clone(npcProto);
  npcModel.name = "__SPECIAL_NPC_MODEL__";

  forceMeshVisible?.(npcModel);
  setShadows(npcModel, true, true);

  npcModel.scale.setScalar(scale);
  npcModel.position.set(0, 0, 0);
  npcModel.rotation.set(0, 0, 0);

  // ✅ make skinned meshes robust to bad bounds/culling
  npcModel.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.frustumCulled = false;
      o.geometry?.computeBoundingBox?.();
      o.geometry?.computeBoundingSphere?.();
    }
  });

  const { pivot: npcRoot } = wrapPivotAtBottom(npcModel);
  npcRoot.name = "__SPECIAL_NPC__";

  npcRoot.position.set(x, y, z);
  npcRoot.rotation.set(0, yaw, 0);
  scene.add(npcRoot);

  // ----------------------------------------------------------
  // Animation mixer (bind to MODEL, not pivot)
  // ----------------------------------------------------------
  const mixer = new THREE.AnimationMixer(npcModel);

  const injuredName = injuredAnim.endsWith(".fbx") ? injuredAnim : `${injuredAnim}.fbx`;
  const injuredPath = `${animFolder}/${injuredName}`;
  const injuredClipRaw = await loadFbxClip(injuredPath);

  if (injuredClipRaw) {
    const injuredClip = remapClipToAvatarBones(
      stripRootTranslation(injuredClipRaw),
      npcModel,
      "NPC_InjuredIdle"
    );

    const act = mixer.clipAction(injuredClip);
    act.reset();
    act.setLoop(THREE.LoopRepeat, Infinity);
    act.clampWhenFinished = false;
    act.fadeIn(0.12);
    act.play();
  } else {
    console.warn("[spawnSpecialNpc] Injured FBX has no clip:", injuredPath);
  }

  // ----------------------------------------------------------
  // ALTAR load + clone + pivot-rebase (unchanged)
  // ----------------------------------------------------------
  const altarProto = await loadAltarGLB(altarUrl);
  const altarModel = altarProto.clone(true);
  altarModel.name = "__SPECIAL_ALTAR_MODEL__";
  setShadows(altarModel, true, true);
  altarModel.scale.setScalar(1.0);

  altarModel.position.set(0, 0, 0);
  altarModel.rotation.set(0, 0, 0);
  const { pivot: altar } = wrapPivotAtBottom(altarModel);
  altar.name = "__SPECIAL_ALTAR__";

  const fwd = _v3a.set(0, 0, 1).applyAxisAngle(_up, yaw).normalize();
  const right = _v3b.copy(_up).cross(fwd).normalize();

  let ax = x + (-fwd.x * altarBehind) + (-right.x * altarLeft);
  let az = z + (-fwd.z * altarBehind) + (-right.z * altarLeft);
  ax = clamp(ax, -maxAbsCoord, maxAbsCoord);
  az = clamp(az, -maxAbsCoord, maxAbsCoord);

  let ay = await sampleHeight(ax, az);
  if (!isFiniteNumber(ay)) ay = y;

  altar.position.set(ax, ay, az);
  altar.rotation.set(0, yaw + Math.PI * 0.15, 0);
  scene.add(altar);

  return {
    root: npcRoot,
    model: npcModel,
    altar,
    mixer,
    spawnPos: new THREE.Vector3(x, y, z),
    update(dt) {
      mixer.update(Math.min(dt || 0, 0.033));
    },
  };
}
