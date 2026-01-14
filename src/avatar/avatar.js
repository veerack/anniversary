// avatar/avatar.js
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { forceMeshVisible, stripRootTranslation, remapClipToAvatarBones, keepRelativeHipsTranslation } from "../extra/utils.js";

import { playAction, getHeadWorldPosition, getHeadWorldQuaternion, setFirstPersonMode } from "./utils.js";
import { loadFBX, findHeadNode, resumeLocomotionNow, loadFbxAction } from "./helpers.js";
import { createWingsAddon } from "./addon.js";

export function setupAvatar({ playerVisual, avatarUrl, anims, minTracksForRun, onDanceStart, onDanceEnd }) {
    const gltfLoader = new GLTFLoader();
    const fbxLoader = new FBXLoader();
    const _tmpHeadPos = new THREE.Vector3();

    let avatarRoot = null;
    let mixer = null;
    const actions = {};
    let currentAction = null;

    let jumpAnimDone = false;
    let danceActive = null;
    let lastLocomotion = { isMoving: false, isRunning: false, isJumping: false };
    let headNode = null;
    let hipsNode = null;
    let fpHidden = [];
    let sitState = "none";

    const fbxCache = new Map();

    // ✅ NEW: stable container that we can offset so feet touch y=0
    const avatarOffset = new THREE.Group();
    avatarOffset.name = "__AVATAR_OFFSET__";
    playerVisual.add(avatarOffset);

    function hardStopAction(a, fade = 0.08, { reset = true } = {}) {
        if (!a) return;
        try {
            a.enabled = true;
            a.setEffectiveWeight(1);
            a.fadeOut(fade);

            const ms = fade * 1000 + 30;
            setTimeout(() => {
            try {
                a.stop();
                if (reset) a.reset();   // ✅ only reset when we explicitly want it
                a.enabled = false;
                a.setEffectiveWeight(0);
            } catch {}
            }, ms);
        } catch {}
    }

    function cancelSittingImmediately({ fade = 0.08, resume = true } = {}) {
        hardStopAction(actions.StandToSit, fade);
        hardStopAction(actions.SitIdle, fade);
        hardStopAction(actions.SitToStand, fade);

        sitState = "none";

        if (resume) resumeNow(0.12);
    }

    function calibrateFeetToGround(root, offsetGroup) {
        // compute world bounds of the avatar (includes skinned meshes correctly enough for this use)
        root.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(root);

        // convert world min to offsetGroup local
        const minLocal = box.min.clone();
        offsetGroup.worldToLocal(minLocal);

        // shift offsetGroup so the lowest point is exactly at local y=0
        offsetGroup.position.y -= minLocal.y;

        // tiny epsilon to avoid z-fighting / sinking due to precision
        offsetGroup.position.y += 0.01;

        offsetGroup.updateWorldMatrix(true, true);
    }

    // ============================================================
    // Wings addon
    // ============================================================

    const wingsAddon = createWingsAddon({ gltfLoader });

    // ============================================================
    // FBX helper actions
    // ============================================================

    function stopAllFbx({ fade = 0.12, resume = true } = {}) {
        if (!mixer) return;

        const stopDelayMs = Math.max(0, fade) * 1000 + 30;

        for (const a of fbxCache.values()) {
            try {
                a.enabled = true;
                a.fadeOut(fade);
                a.setEffectiveWeight(1);
                setTimeout(() => {
                    try {
                        a.stop();
                        a.enabled = false;
                        a.setEffectiveWeight(0);
                    } catch { }
                }, stopDelayMs);
            } catch { }
        }

        if (resume) resumeLocomotionNow({ actions, state: { lastLocomotion, sitState, danceActive }, playAction }, fade);
    }

    function getFbxMixer() {
        return mixer;
    }

    function getFbxDurationSeconds(name) {
        const a = fbxCache.get(name);
        const d = a?._clip?.duration;
        return Number.isFinite(d) ? d : null;
    }

    async function playFbx(name, { fade = 0.15, loop = false } = {}) {
        if (!avatarRoot || !mixer) return null;

        stopAllFbx({ fade: Math.min(0.08, fade), resume: false });

        const action = await loadFbxAction({
            name,
            avatarRoot,
            mixer,
            fbxLoader,
            fbxCache,
        });

        action.enabled = true;
        action.setEffectiveWeight(1);
        action.reset();
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        action.clampWhenFinished = !loop;
        action.fadeIn(fade);
        action.play();

        if (currentAction) currentAction.setEffectiveWeight(0.25);

        return action;
    }

    function resumeNow(fade = 0.12) {
        resumeLocomotionNow(
            { actions, state: { lastLocomotion, sitState, danceActive }, playAction },
            fade
        );
    }

    // ============================================================
    // Sitting
    // ============================================================

    function startSitting() {
        // if anything sit-related is still active, nuke it clean
        if (sitState !== "none") cancelSittingImmediately({ fade: 0.06, resume: false });

        sitState = "entering";
        playAction(actions, { currentAction }, "StandToSit", 0.08);
    }

    function standUp() {
        if (sitState === "none" || sitState === "exiting") return;

        sitState = "exiting";
        playAction(actions, { currentAction }, "SitToStand", 0.08);
    }

    function isSitting() {
        return sitState !== "none";
    }

    // ============================================================
    // Core action machine wrappers
    // ============================================================

    function _playAction(name, fade = 0.14) {
        playAction(actions, { get currentAction() { return currentAction; }, set currentAction(v) { currentAction = v; } }, name, fade);
    }

    // ============================================================
    // Load + init
    // ============================================================

    async function init() {
        const gltf = await new Promise((resolve, reject) => {
            gltfLoader.load(avatarUrl, resolve, undefined, reject);
        });

        avatarRoot = gltf.scene;
        forceMeshVisible(avatarRoot);

        avatarRoot.position.set(0, 0, 0);
        avatarRoot.rotation.set(0, 0, 0);
        avatarRoot.scale.set(1, 1, 1);

        // ✅ IMPORTANT: add to avatarOffset, not playerVisual directly
        avatarOffset.add(avatarRoot);

        // ✅ IMPORTANT: calibrate once so feet are on y=0 of playerVisual
        calibrateFeetToGround(avatarRoot, avatarOffset);

        // ---- headNode search (unchanged) ----
        headNode =
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

        hipsNode =
            avatarRoot.getObjectByName("Hips") ||
            avatarRoot.getObjectByName("hips") ||
            avatarRoot.getObjectByName("mixamorigHips") ||
            avatarRoot.getObjectByName("mixamorig:Hips");

        if (!hipsNode) {
            avatarRoot.traverse((o) => {
                if (hipsNode) return;
                if (o.isBone && /hips/i.test(o.name || "")) hipsNode = o;
            });
        }

        mixer = new THREE.AnimationMixer(avatarRoot);

        const [
            idleRaw,
            walkRaw,
            runRaw,
            jumpRaw,
            sambaRaw,
            rumbaRaw,
            salsaRaw,
            sitIdleRaw,
            standToSitRaw,
            sitToStandRaw,
            swimRaw
        ] = await Promise.all([
            loadFBX(fbxLoader, anims.Idle),
            loadFBX(fbxLoader, anims.Walk),
            loadFBX(fbxLoader, anims.Run),
            loadFBX(fbxLoader, anims.Jump),
            loadFBX(fbxLoader, anims.Samba),
            loadFBX(fbxLoader, anims.Rumba),
            loadFBX(fbxLoader, anims.Salsa),
            loadFBX(fbxLoader, anims.SitIdle),
            loadFBX(fbxLoader, anims.StandToSit),
            loadFBX(fbxLoader, anims.SitToStand),
            loadFBX(fbxLoader, anims.Swim)
        ]);

        // Normal locomotion/dances: keep your old behavior (in-place)
        const idle = remapClipToAvatarBones(stripRootTranslation(idleRaw), avatarRoot, "Idle");
        const walk = remapClipToAvatarBones(stripRootTranslation(walkRaw), avatarRoot, "Walk");
        const run = remapClipToAvatarBones(stripRootTranslation(runRaw), avatarRoot, "Run");
        const jump = remapClipToAvatarBones(stripRootTranslation(jumpRaw), avatarRoot, "Jump");
        const samba = remapClipToAvatarBones(stripRootTranslation(sambaRaw), avatarRoot, "Samba");
        const rumba = remapClipToAvatarBones(stripRootTranslation(rumbaRaw), avatarRoot, "Rumba");
        const salsa = remapClipToAvatarBones(stripRootTranslation(salsaRaw), avatarRoot, "Salsa");
        const swim = remapClipToAvatarBones(stripRootTranslation(swimRaw), avatarRoot, "Swim");

        // Sit idle usually can stay in-place:
        const sitIdle = remapClipToAvatarBones(stripRootTranslation(sitIdleRaw), avatarRoot, "SitIdle");

        // Transitions: keep relative hips Y so the body can go down/up
        const standToSit = remapClipToAvatarBones(
            keepRelativeHipsTranslation(standToSitRaw, { yBias: 0.0 }),
            avatarRoot,
            "StandToSit"
        );

        const sitToStand = remapClipToAvatarBones(
            keepRelativeHipsTranslation(sitToStandRaw, { yBias: 0.0 }),
            avatarRoot,
            "SitToStand"
        );

        actions.Idle = mixer.clipAction(idle);
        actions.Walk = mixer.clipAction(walk);
        actions.Jump = mixer.clipAction(jump);

        actions.Samba = mixer.clipAction(samba);
        actions.Rumba = mixer.clipAction(rumba);
        actions.Salsa = mixer.clipAction(salsa);

        actions.SitIdle = mixer.clipAction(sitIdle);
        actions.StandToSit = mixer.clipAction(standToSit);
        actions.SitToStand = mixer.clipAction(sitToStand);

        actions.Swim = mixer.clipAction(swim);
        actions.Swim.loop = THREE.LoopRepeat;
        actions.Swim.repetitions = Infinity;

        actions.StandToSit.loop = THREE.LoopOnce;
        actions.StandToSit.clampWhenFinished = true;

        actions.SitToStand.loop = THREE.LoopOnce;
        actions.SitToStand.clampWhenFinished = true;

        actions.SitIdle.loop = THREE.LoopRepeat;
        actions.SitIdle.repetitions = Infinity;

        for (const k of ["Jump", "Samba", "Salsa"]) {
            actions[k].loop = THREE.LoopOnce;
            actions[k].clampWhenFinished = true;
        }

        actions.Rumba.loop = THREE.LoopRepeat;
        actions.Rumba.clampWhenFinished = false;
        actions.Rumba.repetitions = Infinity;

        if (((run.tracks?.length) || 0) < minTracksForRun) {
            actions.Run = mixer.clipAction(walk);
            actions.Run.setEffectiveTimeScale(1.35);
        } else {
            actions.Run = mixer.clipAction(run);
            actions.Run.setEffectiveTimeScale(1.08);
        }

        actions.Walk.setEffectiveTimeScale(1.0);
        actions.Idle.setEffectiveTimeScale(1.0);

        mixer.addEventListener("finished", (e) => {
            if (e.action === actions.Jump) jumpAnimDone = true;

            if (danceActive && e.action === actions[danceActive]) {
                const ended = danceActive;
                danceActive = null;
                onDanceEnd?.(ended);
                resumeNow(0.16);
            }

            if (e.action === actions.StandToSit) {
                sitState = "sitting";
                _playAction("SitIdle", 0.08);
            }

            if (e.action === actions.SitToStand) {
                sitState = "none";
                resumeNow(0.16);
            }
        });

        _playAction("Idle", 0.0);
    }

    // ============================================================
    // Public API
    // ============================================================

    function requestDance(name) {
        danceActive = name;
        onDanceStart?.(name);
        _playAction(name, 0.08);
    }

    function cancelDance() {
        if (!danceActive) return;
        onDanceEnd?.(danceActive);

        const danceAction = actions[danceActive];
        danceActive = null;

        if (danceAction && currentAction === danceAction) {
            currentAction.fadeOut(0.08);
            currentAction = null;
        }
        resumeNow(0.16);
    }

    function onJumpStart() {
        jumpAnimDone = false;
        _playAction("Jump", 0.06);
    }

    function update(dt) {
        if (mixer) mixer.update(dt);
        wingsAddon.update(dt);
    }

    function setLocomotion({ isMoving, isRunning, isJumping, isSwimming = false }) {
        if (!actions.Idle) return;

        lastLocomotion = { isMoving, isRunning, isJumping };

        if (sitState !== "none") {
            if (sitState === "sitting") _playAction("SitIdle", 0.08);
            return;
        }

        if (danceActive) _playAction(danceActive, 0.06);
        else if (isSwimming) _playAction("Swim", 0.12);
        else if (isJumping) _playAction("Jump", 0.05);
        else if (isMoving && isRunning) _playAction("Run", 0.12);
        else if (isMoving) _playAction("Walk", 0.14);
        else _playAction("Idle", 0.18);
    }

    function jumpFinished() {
        return jumpAnimDone;
    }

    return {
        init,
        update,
        setLocomotion,
        requestDance,
        cancelDance,
        onJumpStart,
        jumpFinished,

        getHeadWorldPosition: (out = _tmpHeadPos) => {
            if (!avatarRoot) return out.set(0, 1.6, 0);
            avatarRoot.updateWorldMatrix(true, true);
            if (headNode) {
                headNode.getWorldPosition(out);
                return out;
            }
            avatarRoot.getWorldPosition(out);
            out.y += 1.55;
            return out;
        },
        getHipsWorldPosition: (out = new THREE.Vector3()) => {
            if (!avatarRoot) return out.set(0, 1.0, 0);
            avatarRoot.updateWorldMatrix(true, true);
            if (hipsNode) {
                hipsNode.getWorldPosition(out);
                return out;
            }
            avatarRoot.getWorldPosition(out);
            out.y += 1.0;
            return out;
        },
        getHeadWorldQuaternion: (out) => getHeadWorldQuaternion({ avatarRoot, headNode }, out),

        setFirstPersonMode: (enabled) => setFirstPersonMode({ avatarRoot, fpHidden }, enabled),

        startSitting,
        standUp,
        isSitting,

        playFbx,
        stopAllFbx,

        getFbxMixer,
        getFbxDurationSeconds,

        attachWings: (opts) => wingsAddon.attachWings(avatarRoot, opts),
        setWingsFlying: (v) => wingsAddon.setWingsFlying(v),
        cancelSittingImmediately,
    };
}
