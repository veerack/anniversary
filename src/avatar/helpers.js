// avatar/helpers.js
import * as THREE from "three";
import { stripRootTranslation, remapClipToAvatarBones, keepRelativeHipsTranslation } from "../extra/utils.js";

export function loadFBX(fbxLoader, url) {
    if (!url || typeof url !== "string") throw new Error("[avatar] loadFBX invalid url: " + String(url));
    return new Promise((resolve, reject) => {
        fbxLoader.load(
            url,
            (fbx) => {
                const clip = fbx.animations && fbx.animations[0];
                if (!clip) return reject(new Error("No animation in " + url));
                resolve(clip);
            },
            undefined,
            reject
        );
    });
}

export function findHeadNode(avatarRoot) {
    let headNode =
        avatarRoot.getObjectByName("Head") ||
        avatarRoot.getObjectByName("head") ||
        avatarRoot.getObjectByName("mixamorigHead") ||
        avatarRoot.getObjectByName("mixamorig:Head");

    if (!headNode) {
        avatarRoot.traverse((o) => {
            if (headNode) return;
            if (o.isBone && /head/i.test(o.name || "")) headNode = o;
        });
    }

    if (!headNode) {
        let best = null;
        let bestY = -Infinity;
        const v = new THREE.Vector3();

        avatarRoot.updateWorldMatrix(true, true);
        avatarRoot.traverse((o) => {
            if (!o.isBone) return;
            o.getWorldPosition(v);
            if (v.y > bestY) {
                bestY = v.y;
                best = o;
            }
        });

        headNode = best;
    }

    return headNode || null;
}

export function resumeLocomotionNow({ actions, state, playAction }, fade = 0.12) {
    const { isMoving, isRunning, isJumping } = state.lastLocomotion;

    if (state.sitState !== "none") {
        if (state.sitState === "sitting") playAction(actions, state, "SitIdle", fade);
        return;
    }

    if (state.danceActive) playAction(actions, state, state.danceActive, fade);
    else if (isJumping) playAction(actions, state, "Jump", fade);
    else if (isMoving && isRunning) playAction(actions, state, "Run", fade);
    else if (isMoving) playAction(actions, state, "Walk", fade);
    else playAction(actions, state, "Idle", fade);
}

function autoScaleYForMixamo(rawClip) {
  // crude but works: if hips Y delta looks like "50..120", it's centimeters
  let hips = null;
  for (const t of rawClip.tracks) {
    if (!t.name.toLowerCase().endsWith(".position")) continue;
    if (t.name.toLowerCase().includes("hips")) { hips = t; break; }
  }
  if (!hips) return 1.0;

  const v = hips.values;
  const y0 = v.length >= 2 ? v[1] : 0;
  let maxAbs = 0;
  for (let i = 1; i < v.length; i += 3) {
    const dy = Math.abs(v[i] - y0);
    if (dy > maxAbs) maxAbs = dy;
  }

  // if dy > ~5 units, in your world that’s meters => too big => treat as cm
  return maxAbs > 5 ? 0.01 : 1.0;
}

export async function loadFbxAction({
    name,
    avatarRoot,
    mixer,
    fbxLoader,
    fbxCache,
}) {
    if (fbxCache.has(name)) return fbxCache.get(name);
    if (!avatarRoot || !mixer) throw new Error(`[avatar] loadFbxAction(${name}) called before init()`);

    const url = `assets/anim/${name}.fbx`;
    const fbx = await new Promise((res, rej) => fbxLoader.load(url, res, undefined, rej));
    const clip = fbx.animations?.[0];
    if (!clip) throw new Error(`FBX ${name} has no animation`);

    const rawClip = fbx.animations?.[0];

    // for this specific FBX:
    const prepped =
    name === "StandUp"
        ? keepRelativeHipsTranslation(rawClip, { scaleY: 0.012, clampY: 3.0, yBias: 0.0 })
        : stripRootTranslation(rawClip);

    const remapped = remapClipToAvatarBones(prepped, avatarRoot, name);

    const action = mixer.clipAction(remapped);
    action.clampWhenFinished = true;
    action.loop = THREE.LoopOnce;
    action.repetitions = 1;

    fbxCache.set(name, action);
    return action;
}
