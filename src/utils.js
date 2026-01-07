import * as THREE from "three";

export function fract(x){ return x - Math.floor(x); }

export function hash2(x, z) {
  return fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453123);
}

export function normalizeKey(name) {
  return String(name || "")
    .replace(/^Armature\|/i, "")
    .replace(/^mixamorig/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

export function buildBoneKeyToNameMap(root) {
  const map = new Map();
  root.traverse((o) => {
    if (!o.isBone) return;
    const key = normalizeKey(o.name);
    if (key && !map.has(key)) map.set(key, o.name);
  });
  return map;
}

export function stripRootTranslation(clip) {
  const tracks = clip.tracks.filter((t) => !t.name.toLowerCase().endsWith(".position"));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export function remapClipToAvatarBones(clip, avatarRoot, debugLabel) {
  const boneMap = buildBoneKeyToNameMap(avatarRoot);
  const outTracks = [];

  for (const tr of clip.tracks) {
    const parts = tr.name.split(".");
    if (parts.length < 2) continue;

    const srcNode = parts[0];
    const prop = parts.slice(1).join(".");
    const key = normalizeKey(srcNode);
    const dstBoneName = boneMap.get(key);
    if (!dstBoneName) continue;

    const dstTrackName = `${dstBoneName}.${prop}`;
    const times = tr.times.slice();
    const values = tr.values.slice();

    if (tr.ValueTypeName === "quaternion") {
      outTracks.push(new THREE.QuaternionKeyframeTrack(dstTrackName, times, values));
    } else if (tr.ValueTypeName === "vector") {
      outTracks.push(new THREE.VectorKeyframeTrack(dstTrackName, times, values));
    }
  }

  return new THREE.AnimationClip(clip.name || debugLabel, clip.duration, outTracks);
}

export function forceMeshVisible(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.visible = true;
    o.castShadow = true;
    o.receiveShadow = true;

    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      m.depthWrite = true;
      m.depthTest = true;
      m.needsUpdate = true;
      if ("envMapIntensity" in m) m.envMapIntensity = 0.0;
    }
  });
}
