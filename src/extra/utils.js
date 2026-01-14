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

export function keepHipsYOnlyTranslation(clip, {
  hipsNames = ["Hips", "mixamorigHips", "mixamorig:Hips", "hips"],
  yBias = 0.0,
} = {}) {
  const out = clip.clone();

  // find the hips track (position)
  const idx = out.tracks.findIndex((t) => {
    const n = (t.name || "");
    if (!n.endsWith(".position")) return false;
    return hipsNames.some((hn) => n.includes(hn));
  });

  if (idx === -1) return out;

  const t = out.tracks[idx];
  const v = t.values.slice(); // Float32Array -> copy

  // preserve relative Y, but force X/Z to 0
  const y0 = v[1]; // first keyframe Y
  for (let i = 0; i < v.length; i += 3) {
    v[i + 0] = 0;                          // X
    v[i + 2] = 0;                          // Z
    v[i + 1] = (v[i + 1] - y0) + yBias;    // relative Y only
  }

  // replace track with edited values
  out.tracks[idx] = new THREE.VectorKeyframeTrack(t.name, t.times, v);

  return out;
}

export function keepRelativeHipsTranslation(clip, {
  hipsNameHints = ["Hips", "mixamorigHips", "mixamorig:Hips"],
  keepY = true,
  zeroXZ = true,

  // ✅ NEW: unit fix (Mixamo often ~cm)
  scaleY = 0.01,

  // ✅ NEW: safety clamp in meters
  clampY = 3.0,

  yBias = 0.0,
} = {}) {
  const lowerHints = hipsNameHints.map((s) => s.toLowerCase());
  let hipsTrack = null;

  for (const t of clip.tracks) {
    if (!t.name.toLowerCase().endsWith(".position")) continue;
    const nodeName = t.name.slice(0, t.name.length - ".position".length);
    const nL = nodeName.toLowerCase();
    if (lowerHints.includes(nL) || nL.includes("hips")) {
      hipsTrack = t;
      break;
    }
  }

  if (!hipsTrack) return clip;

  const newTracks = [];
  for (const t of clip.tracks) {
    if (!t.name.toLowerCase().endsWith(".position")) newTracks.push(t);
  }

  const ht = hipsTrack.clone();
  const v = ht.values;

  const x0 = v.length >= 3 ? v[0] : 0;
  const y0 = v.length >= 3 ? v[1] : 0;
  const z0 = v.length >= 3 ? v[2] : 0;

  for (let i = 0; i < v.length; i += 3) {
    const x = v[i + 0];
    const y = v[i + 1];
    const z = v[i + 2];

    v[i + 0] = zeroXZ ? 0 : (x - x0);
    v[i + 2] = zeroXZ ? 0 : (z - z0);

    if (keepY) {
      let yy = (y - y0) * scaleY + yBias;     // ✅ scale down
      if (Number.isFinite(clampY)) {          // ✅ clamp
        yy = THREE.MathUtils.clamp(yy, -clampY, clampY);
      }
      v[i + 1] = yy;
    } else {
      v[i + 1] = 0;
    }
  }

  newTracks.push(ht);
  return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
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
