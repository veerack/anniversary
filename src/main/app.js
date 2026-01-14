// main/app.js — orchestrates the whole game loop (split from main.js)
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { AVATAR_URL, ANIMS, MEMORIES, TUNING, SKY, POPUPS } from "../extra/config.js";
import { DIALOGUES } from "../extra/config.js";

import { buildTerrain, terrainHeight } from "../terrain/terrain.js";
import { setWaterCarveData, terrainSurfaceHeightProcedural, terrainHeightProcedural } from "../terrain/helpers.js";
import { setupSkyAndSun } from "../extra/sky.js";
import { setupLighting } from "../extra/lighting.js";
import { setupClouds } from "../extra/clouds.js";
import { setupBirds } from "../extra/birds.js";

import { createGrassField } from "../grass/grass.js";
import { createWorldScatter } from "../props/props.js";

import { setupAudio, playSfx } from "../extra/audio.js";
import { setupAvatar } from "../avatar/avatar.js";
import { createPlayerController } from "../player/player.js";

import { createSitPopupSystem, createManualPopupBubbleSystem } from "../extra/popup_bubbles.js";
import { createInteractionSystem } from "../extra/interactions.js";
import { registerInteractable } from "../extra/interactables.js";
import { createStarManager } from "../extra/stars.js";
import { createCutsceneCamera } from "../extra/cutscene_camera.js";
import { createDialogueSystem } from "../extra/dialogue.js";

import { createCoordsHud, createBookOverlay, createGoldenToast } from "../extra/ui_overlays.js";
import { spawnSpecialNpc } from "../extra/special_npc.js";
import { createMemoriesMenuUI } from "../ui/memories_menu.js";
import { createWaterSystem, generateRandomLakes, generateRandomRivers } from "../water/water.js";

import {
    setWorldVisible,
    createTitleCard,
    playIntroMusic,
    startGodlyMusic,
    stopGodlyMusic,
    createGodlyCutsceneOverlay,
    createLoadingOverlay,
    showAnnouncement,
} from "./ui_local.js";

import { createFirstPersonSystem } from "./fp.js";

import {
    easeInOutCubic,
    waitSeconds,
    rafPromise,
    snapInitialCamera,
    smoothReturnToGameplayCamera,
    getPlayerForward,
    getPlayerRight,
    getHeadWorld,
    playFbxAndWait,
    showTitleNearEndOfStandUp,
    orbitCloseupAroundHead,
    hardSnapCameraToPlayer,
    playLookAroundCloseup,
} from "./cutscene_helpers.js";

import {
    ensureHeightAt,
    preStreamWorldAt,
    createFeatherSwirl,
    createBeacon,
    startDivineSequenceFactory,
} from "./divine_sequence.js";

import {
    createSittingAndInteractablesSystem,
} from "./interactables_local.js";

import {
    warmupTerrain,
    waitForTerrainReadyFactory,
    waitForPropsReadyFactory,
} from "./world_init.js";

import {
    getCutsceneActive,
    setCutsceneActive,
    getUiModalActive,
    setUiModalActive,
    getDivineLiftActive,
    setDivineLiftActive,
    getDivineLiftY,
    setDivineLiftY,
} from "./state.js";

// ============================================================
// App entry
// ============================================================

export function startApp() {
    // ============================================================
    // Temp vectors (avoid allocations)
    // ============================================================

    const _tmpV3a = new THREE.Vector3();
    const _tmpV3b = new THREE.Vector3();
    const _tmpV3c = new THREE.Vector3();

    const _fwd = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _look = new THREE.Vector3();
    const _pos = new THREE.Vector3();

    // ============================================================
    // DOM
    // ============================================================

    const app = document.getElementById("app");
    const interactHintEl = document.getElementById("interactHint");
    const interactHintTextEl = document.getElementById("interactHintText");
    const stamBar = document.getElementById("stamBar");

    const memCounterEl = document.getElementById("memCounter");
    const memCounterTextEl = document.getElementById("memCounterText");

    // ============================================================
    // Core systems (interaction, scene, renderer, camera)
    // ============================================================

    const interactions = createInteractionSystem({ interactHintEl, interactHintTextEl });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbad8ff);
    scene.fog = new THREE.Fog(0xbad8ff, 95, 280);

    // Stars
    const starMgr = createStarManager({
        scene,
        uiTextEl: memCounterTextEl,
        uiPulseEl: memCounterEl,
        total: 10,
        margin: 0.55,
        scale: 2,
        sfx: {
            collect: "assets/sfx/star_collect.mp3",
            whoosh: "assets/sfx/star_whoosh.mp3",
        },
        playSfx,
    });

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene.environment = null;
    app.appendChild(renderer.domElement);

    // Camera + orbit controls
    const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 4, 6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 2.6;
    controls.maxDistance = 7.0;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.rotateSpeed = 0.6;

    // ============================================================
    // Player container
    // ============================================================

    const player = new THREE.Group();
    player.visible = false;
    scene.add(player);

    const playerVisual = new THREE.Group();
    player.add(playerVisual);

    // ============================================================
    // World build
    // ============================================================

    const worldSeed = 1337;

    const WATER_DEF = {
        shore: 2.0,
        lakeDepth: 1.3,
        riverDepth: 0.8,
        lakes: generateRandomLakes(worldSeed, 4, 900),
        rivers: generateRandomRivers(worldSeed ^ 0x9e3779b9, 5, 1100),
    };

    setWaterCarveData(WATER_DEF);


    // Terrain
    const terrain = buildTerrain({ scene, size: TUNING.TERRAIN_SIZE, seg: TUNING.TERRAIN_SEG });
    warmupTerrain(renderer, terrain);
    renderer.compile(scene, camera);
    renderer.render(scene, camera);

    const SPAWN_POS = new THREE.Vector3(0, 0, 0);
    SPAWN_POS.y = terrainHeight(SPAWN_POS.x, SPAWN_POS.z);

    const WATER_LEVEL = SPAWN_POS.y - 1.4;

    player.position.set(SPAWN_POS.x, 0, SPAWN_POS.z);
    playerVisual.position.y = SPAWN_POS.y;

    // Sky + sun
    const sky = setupSkyAndSun({ scene, skyConfig: SKY });

    // Lighting
    const { sunLight, updateLightingFollow } = setupLighting(scene, {
        sunDir: sky.sunDir,
        sunTex: sky.sunTex,
    });

    // Clouds + birds
    const clouds = setupClouds(scene, { sunDir: sky.sunDir, area: 5200, height: 180 });
    const birds = setupBirds(scene, 22);

    const WATER_FILL = 0.35; // 0.25–0.5 recommended

    const water = createWaterSystem(scene, {
        sampleSurfaceHeight: terrainSurfaceHeightProcedural,
        sampleBedHeight: terrainHeight,
        lakes: WATER_DEF.lakes,
        rivers: WATER_DEF.rivers,
        yBias: 0.02,
        ySink: 0.03,
    });

    let lastWaterCix = 1e9;
    let lastWaterCiz = 1e9;

    {
        const p = WATER_DEF.rivers[0].pts[2];
        console.log("river test xz", p.x, p.z);
        console.log("terrainHeight (cached)", terrainHeight(p.x, p.z));
        console.log("terrainHeightProcedural (carved)", terrainHeightProcedural(p.x, p.z));
        console.log("surface pre-carve", terrainSurfaceHeightProcedural(p.x, p.z));
    }

    // Grass
    const grassField = createGrassField({
        count: 300000,
        radius: TUNING.MAP_RADIUS - 2,
        bladeH: 0.22,
        bladeW: 0.035,
        clumpScale: 0.055,
        clumpThreshold: 0.18,
        chunkSize: 40,
        loadRadius: 3,
        isBlocked: (x, z) => water.isWater(x, z),
    });
    scene.add(grassField.group);

    // World / props
    const world = createWorldScatter(scene, { mapRadius: TUNING.MAP_RADIUS });

    // UI overlays
    const coordsHud = createCoordsHud();
    const bookOverlay = createBookOverlay({ imgUrl: "assets/imgs/BookPage.png" });
    createGoldenToast(); // kept, same as before (value not used elsewhere)

    // Loading overlay
    const loading = createLoadingOverlay();

    // Ready-wait helpers
    const waitForTerrainReady = waitForTerrainReadyFactory({ terrain, player, loading });
    const waitForPropsReady = waitForPropsReadyFactory({ world, player, loading });

    // ============================================================
    // Systems: popups, UI, audio, avatar, player controller, cutscenes
    // ============================================================

    const sitPopups = createSitPopupSystem({
        scene,
        config: POPUPS,
        getAnchorObject: () => playerVisual,
    });

    const manualPopups = createManualPopupBubbleSystem({
        scene,
        getAnchorWorldPosition: () =>
            avatar.getHeadWorldPosition?.(new THREE.Vector3())
            ?? player.position.clone().add(new THREE.Vector3(0, TUNING.LOOK_HEIGHT, 0)),

        // small + stable near face
        offset: new THREE.Vector3(0, 0.18, 0),

        style: { maxLineWidthPx: 260 },
        audioVolume: 0.6,
    });

    const audio = setupAudio();

    const avatar = setupAvatar({
        playerVisual,
        avatarUrl: AVATAR_URL,
        anims: ANIMS,
        minTracksForRun: TUNING.MIN_TRACKS_FOR_RUN,
        onDanceStart: (name) => {
            audio.playDance?.(name, () => avatar.cancelDance?.());
        },
        onDanceEnd: () => audio.stopDance?.(),
    });
    avatar.init().catch((e) => console.error("Avatar init failed:", e));

    const playerCtl = createPlayerController({
        player,
        playerVisual,
        controls,
        tuning: TUNING,
        staminaEl: stamBar,
        playFootstep: audio.playFootstep,
        setWindStrength: audio.setWindStrength,
        onJumpStart: () => avatar.onJumpStart(),
        onCancelDance: () => avatar.cancelDance(),
        avatarApi: avatar,
        colliders: world.colliders,
        getAzimuthAngle: () => (fpSys.fp.enabled ? fpSys.fp.yaw : controls.getAzimuthalAngle()),
        benches: world.benches,
        walkables: world.walkables,
        onRequestStand: () => {
            if (sitSys.activeBench) sitSys.standFromBench();
        },
        isInWater: (x, z, y) => water.isInWater(x, z, y, { surfacePad: 0.35 }),
    });

    controls.target.copy(player.position).add(new THREE.Vector3(0, TUNING.LOOK_HEIGHT, 0));
    controls.update();

    const cutCam = createCutsceneCamera({ camera, controls });
    const dialogue = createDialogueSystem({ avatarApi: avatar });

    // ============================================================
    // Global state flags
    // ============================================================

    // Special NPC data
    let specialNpc = null;
    let specialNpcCoords = null;
    let specialNpcPromise = null;

    let bookUsed = false;

    // Title card
    const titleCard = createTitleCard();

    // ============================================================
    // First-person system (F5)
    // ============================================================

    const fpSys = createFirstPersonSystem({
        THREE,
        camera,
        rendererDom: renderer.domElement,
        controls,
        avatarApi: avatar,
        tuning: TUNING,
        tmp: { _tmpV3a, _tmpV3b, _tmpV3c },
    });

    // ============================================================
    // Divine sequence factory (needs access to state + systems)
    // ============================================================

    let activeBeacon = null;

    const startDivineSequence = startDivineSequenceFactory({
        THREE,
        scene,
        renderer,
        camera,
        controls,
        player,
        playerVisual,
        terrain,
        world,
        grassField,
        sky,
        clouds,
        birds,

        avatar,
        playerCtl,

        // flags
        getCutsceneActive,
        setCutsceneActive,
        getDivineLiftActive,
        setDivineLiftActive,
        getDivineLiftY,
        setDivineLiftY,

        // npc
        ensureSpecialNpcSpawned: async () => {
            if (specialNpc) return specialNpc;
            if (!specialNpcPromise) {
                specialNpcPromise = (async () => {
                    specialNpc = await spawnSpecialNpc({
                        scene,
                        mapRadius: TUNING.MAP_RADIUS,
                        npcUrl: "https://models.readyplayer.me/69616661e2b2692fdde7d964.glb",
                        altarUrl: "assets/models/altar.glb",
                        injuredAnim: "InjuredIdle.fbx",
                        scale: 1.0,
                        sampleHeight: (x, z) => ensureHeightAt({ terrain, terrainHeight }, x, z),
                    });

                    specialNpcCoords = specialNpc?.spawnPos ? specialNpc.spawnPos.clone() : null;
                    console.log("[SpecialNPC] coords:", specialNpcCoords);
                    return specialNpc;
                })();
            }
            return specialNpcPromise;
        },
        getSpecialNpcCoords: () => specialNpcCoords,

        // helpers
        createGodlyCutsceneOverlay,
        createFeatherSwirl: (opts) => createFeatherSwirl(THREE, scene, opts),
        createBeacon: (pos) => createBeacon(THREE, scene, pos),

        ensureHeightAt: (x, z, opts) => ensureHeightAt({ terrain, terrainHeight }, x, z, opts),
        preStreamWorldAt: (x, z, opts) =>
            preStreamWorldAt({
                THREE,
                renderer,
                scene,
                camera,
                terrain,
                world,
                grassField,
                playerPos: player.position,
            }, x, z, opts),

        setWorldVisible: (v) => setWorldVisible(renderer, v),

        hardSnapCameraToPlayer: () => hardSnapCameraToPlayer({
            THREE,
            camera,
            controls,
            player,
            playerVisual,
            tuning: TUNING,
            fpSys,
        }),

        startGodlyMusic,
        stopGodlyMusic,

        // beacon state
        getActiveBeacon: () => activeBeacon,
        setActiveBeacon: (b) => { activeBeacon = b; },

        // shared helpers
        easeInOutCubic,
        rafPromise,
        waitSeconds,
    });

    // ============================================================
    // Sitting + interactables + input "E"
    // ============================================================

    const sitSys = createSittingAndInteractablesSystem({
        THREE,
        scene,
        interactions,
        registerInteractable,
        starMgr,
        world,
        player,
        playerVisual,
        playerCtl,
        controls,
        avatar,
        sitPopups,
        dialogue,
        DIALOGUES,
        TUNING,

        // state flags accessors
        getCutsceneActive,
        setCutsceneActive,
        getUiModalActive,
        setUiModalActive,

        // book state
        getBookUsed: () => bookUsed,
        setBookUsed: (v) => { bookUsed = v; },

        // book overlay
        bookOverlay,

        // cutscene cam
        cutCam,

        // local helpers
        getHeadWorld: () => getHeadWorld({ THREE, avatar, player, tuning: TUNING }, _look),
        getPlayerForward: () => getPlayerForward({ THREE, player }, _fwd),
        getPlayerRight: () => getPlayerRight({ THREE, player }, _fwd, _right),

        rafPromise,
        waitSeconds,

        playLookAroundCloseup: (opts) =>
            playLookAroundCloseup({
                THREE,
                avatar,
                player,
                tuning: TUNING,
                cutCam,
                waitSeconds,
                getHeadWorld: () => getHeadWorld({ THREE, avatar, player, tuning: TUNING }, _look),
                getPlayerForward: () => getPlayerForward({ THREE, player }, _fwd),
                getPlayerRight: () => getPlayerRight({ THREE, player }, _fwd, _right),
            }, opts),

        showAnnouncement,
        startGodlyMusic,

        // divine
        startDivineSequence,

        // terrain sampling
        terrainHeight,
    });

    // ============================================================
    // Intro sequence
    // ============================================================

    async function runIntroSpawnSequence() {
        setCutsceneActive(true);
        playerCtl.setEnabled(false);
        playerCtl.snapToGroundNow();
        controls.enabled = false;

        // ✅ signal for "Title.png finished fading out"
        let resolveTitleFadeDone;
        const titleFadeDone = new Promise((r) => (resolveTitleFadeDone = r));

        const camP = orbitCloseupAroundHead({
            THREE,
            camera,
            controls,
            cutCam,
            avatar,
            tuning: TUNING,
            rafPromise,
        }, {
            duration: 6.2,
            radius: 1.55,
            height: 0.28,
            yawTurns: 0.45,
        });

        const standP = playFbxAndWait({ avatar }, "StandUp", { fade: 0.12, loop: false });

        manualPopups.show("Huh?...", { lifetimeSec: 2.6, fadeOutSec: 0.35 });
        await waitSeconds(2.8);

        manualPopups.show("Where am i? What happened?", { lifetimeSec: 3.8, fadeOutSec: 0.45 });

        // ✅ make showTitleNearEndOfStandUp return a promise that resolves when the title fully faded out
        const titleP = showTitleNearEndOfStandUp({
            getFbxDurationSeconds: (n) => avatar.getFbxDurationSeconds?.(n) ?? null,
            waitSeconds,
            playIntroMusic,
            titleCard,
        }, { at: 0.80, minLeadSec: 1.2 });

        // resolve our gate when title is done
        Promise.resolve(titleP).then(() => resolveTitleFadeDone());

        await Promise.all([standP, camP, titleP]);

        avatar.stopAllFbx?.({ fade: 0.18, resume: true });
        avatar.setLocomotion?.({ isMoving: false, isRunning: false, isJumping: false });

        await rafPromise();

        await smoothReturnToGameplayCamera({
            THREE,
            camera,
            controls,
            player,
            playerVisual,
            tuning: TUNING,
            rafPromise,
            easeInOutCubic,
        }, 0.65);

        cutCam.restore?.();

        setCutsceneActive(false);
        playerCtl.setEnabled(true);
        controls.enabled = true;

        // ✅ create the UI (hint appears after titleFadeDone)
        const memUI = createMemoriesMenuUI({
            THREE,
            parentEl: document.body,
            titleFadeDonePromise: titleFadeDone,
        });

        memUI.setItems(world.memoryItems);
    }

    // ============================================================
    // Init world
    // ============================================================

    async function initWorld() {
        loading.setPct(1);

        await waitForTerrainReady();

        await world.scatterScene();
        await world.warmup(player.position, { buildBudget: 9999, despawnBudget: 9999, maxFrames: 240 });
        loading.setPct(70);

        await waitForPropsReady();
        loading.setPct(90);

        await starMgr.load();
        loading.setPct(95);

        for (const it of world.starTargets || []) {
            await starMgr.addStar({ id: it.id, target: it.obj });
        }

        player.visible = true;
        snapInitialCamera({ THREE, camera, controls, player, playerVisual, tuning: TUNING });

        renderer.compile(scene, camera);

        updateLightingFollow(player.position);
        renderer.render(scene, camera);

        renderer.domElement.style.visibility = "visible";
        interactHintEl.style.visibility = "visible";

        loading.setPct(100);
        loading.hide();

        await runIntroSpawnSequence();

        // spawn BookStand
        await sitSys.spawnBookStandInFront();
    }

    initWorld().catch(console.error);

    // ============================================================
    // Animation loop
    // ============================================================

    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);

        const dt = Math.min(clock.getDelta(), 0.033);
        const t = clock.elapsedTime;

        const st = sitSys.activeBench ? { isMoving: false } : playerCtl.updatePlayer(dt);

        sitSys.registerWorldInteractables();

        // sitting snap
        sitSys.updateSittingSnap();

        // cinematic vertical override
        if (getDivineLiftActive()) {
            playerVisual.position.y = getDivineLiftY();
        }

        // camera
        if (fpSys.fp.enabled) {
            fpSys.update(dt, { THREE, player, avatar, tuning: TUNING });
        } else {
            if (!getCutsceneActive()) playerCtl.updateCamera(dt);
        }

        // world updates
        clouds.update(dt);
        birds.update(dt, player.position, camera);
        sky.update(camera, t);
        clouds.setSunDir?.(sky.sunDir);
        grassField.update(t, player.position, st.isMoving);
        water.update(player.position);

        _tmpV3a.set(player.position.x, playerVisual.position.y, player.position.z);
        interactions.update(_tmpV3a);

        sitPopups.update(dt);
        manualPopups.update(dt);

        avatar.update?.(dt);
        starMgr.update(dt);
        cutCam.update(dt);
        dialogue.update(dt);

        terrain.update(player.position, dt);
        water.rebake();
        world.update(player.position);

        const beacon = activeBeacon;
        if (beacon) beacon.update(t, camera);

        specialNpc?.update?.(dt);

        coordsHud.set(player.position.x, playerVisual.position.y, player.position.z);

        _tmpV3a.set(player.position.x, playerVisual.position.y, player.position.z);
        updateLightingFollow(_tmpV3a);

        renderer.render(scene, camera);
    }

    animate();

    // ============================================================
    // Resize
    // ============================================================

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}