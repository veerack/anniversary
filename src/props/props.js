// props/props.js — Infinite chunk-based scatter + setpieces + interactables + NPC quest
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

import { placeOnTerrain, terrainHeight } from "../terrain/terrain.js";

import {
    lerp,
    mulberry32,
    hashInt2,
    randPointInDisk,
    overlapsDisks,
    reserveDisk,
    extractMeshParts,
    makeInstancedGroup,
    normalizeVisibleToHeight,
    rebaseToGroundXZ,
    pickSpots,
    _used
} from "./helpers.js";

import {
    prepModel,
    hideBakedGroundPlanes,
    computeProtoCollider,
    colliderFromTemplate,
    makeColliderFromObject,
} from "./utils.js";

import { buildNpcBundle, makeNpcInstance, NPC_URL } from "./addon.js";

console.log("🔥 props/props.js LOADED", new Date().toISOString());

export function createWorldScatter(
    scene,
    { mapRadius = 95, chunkSize = 80, streamRadius = 2 } = {}
) {
    const gltfLoader = new GLTFLoader();
    const fbxLoader = new FBXLoader();

    // Exposed
    const benches = [];
    const colliders = [];
    const starTargets = [];
    const interactables = [];
    const walkables = [];
    const memoryItems = [];

    // Runtime tick hooks
    const runtime = [];

    // Prototypes cache
    const protoCache = new Map();
    async function loadPrototype(url) {
        if (protoCache.has(url)) return protoCache.get(url);
        const gltf = await new Promise((res, rej) =>
            gltfLoader.load(url, res, undefined, rej)
        );
        const proto = prepModel(gltf.scene);
        protoCache.set(url, proto);
        return proto;
    }

    // Roots
    const setpieceRoot = new THREE.Group();
    setpieceRoot.name = "__SETPIECES__";
    scene.add(setpieceRoot);

    const streamRoot = new THREE.Group();
    streamRoot.name = "__STREAM_SCATTER__";
    scene.add(streamRoot);

    // Streaming state
    const activeChunks = new Map();
    const setpieceColliders = [];

    let _lastCix = 1e9,
        _lastCiz = 1e9;
    let _dirtyColliders = true;

    const _building = new Set();
    const _buildJobs = [];
    const _despawnQueue = [];

    const _wantChunks = new Set();
    const _readyChunks = new Set();

    const _ray = new THREE.Raycaster();
    const _rayOrigin = new THREE.Vector3();
    const _rayDirDown = new THREE.Vector3(0, -1, 0);

    function computeBenchSeatY(benchObj, fallbackX, fallbackZ) {
        benchObj.updateWorldMatrix(true, true);

        // collect bench meshes for raycast
        const meshes = [];
        benchObj.traverse((o) => {
            if (o.isMesh && o.geometry) meshes.push(o);
        });

        const box = new THREE.Box3().setFromObject(benchObj);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // start ray from above the bench, shoot down onto bench meshes
        _rayOrigin.set(center.x, box.max.y + Math.max(0.5, size.y) + 1.0, center.z);
        _ray.set(_rayOrigin, _rayDirDown);

        const hits = _ray.intersectObjects(meshes, true);
        if (hits && hits.length) {
            // small lift so hips don't clip
            return hits[0].point.y + 0.06;
        }

        // fallback if raycast fails
        const ground = terrainHeight(fallbackX, fallbackZ);
        return Number.isFinite(ground) ? ground + 0.45 : center.y;
    }

    function key(ix, iz) {
        return `${ix},${iz}`;
    }

    function queueDespawn(k) {
        if (!_despawnQueue.includes(k)) _despawnQueue.push(k);
    }

    function processDespawnQueue(budgetChildren = 80) {
        let budget = budgetChildren;

        while (budget > 0 && _despawnQueue.length) {
            const k = _despawnQueue[0];
            const c = activeChunks.get(k);
            if (!c) {
                _despawnQueue.shift();
                continue;
            }

            while (budget > 0 && c.group.children.length) {
                const child = c.group.children.pop();
                child.removeFromParent();
                budget--;
            }

            if (c.group.children.length === 0) {
                c.group.removeFromParent();
                activeChunks.delete(k);

                _building.delete(k);
                for (let i = _buildJobs.length - 1; i >= 0; i--) {
                    if (_buildJobs[i].k === k) _buildJobs.splice(i, 1);
                }

                _despawnQueue.shift();
                _dirtyColliders = true;
            }
        }
    }

    // ============================================================
    // Streaming prototypes
    // ============================================================
    const TREE_URLS = [
        "assets/models/tree_v1.glb",
        "assets/models/tree_v2.glb",
        "assets/models/tree_v3.glb",
    ];
    const ROCKS_URL = "assets/models/Rocks.glb";
    const MOUNTAIN_URL = "assets/models/Mountain.glb";

    const treeProtos = [];
    let rocksProto = null;
    let mountainProto = null;

    let treeParts = [[], [], []];
    let rocksParts = [];

    let treeColTpl = [null, null, null];
    let rocksColTpl = null;
    let mountainColTpl = null;

    async function preloadStreamingProtos() {
        if (!treeProtos.length) {
            const gltfs = await Promise.all(
                TREE_URLS.map(
                    (u) =>
                        new Promise((res, rej) => gltfLoader.load(u, res, undefined, rej))
                )
            );
            for (const g of gltfs) treeProtos.push(prepModel(g.scene));
        }
        if (!rocksProto) {
            const g = await new Promise((res, rej) =>
                gltfLoader.load(ROCKS_URL, res, undefined, rej)
            );
            rocksProto = prepModel(g.scene);
        }
        if (!mountainProto) {
            const g = await new Promise((res, rej) =>
                gltfLoader.load(MOUNTAIN_URL, res, undefined, rej)
            );
            mountainProto = prepModel(g.scene);
            hideBakedGroundPlanes(mountainProto);
        }

        treeParts = treeProtos.map(extractMeshParts);
        rocksParts = rocksProto ? extractMeshParts(rocksProto) : [];

        treeColTpl = treeProtos.map((p) =>
            computeProtoCollider(p, { inflate: 0.15, yPad: 0.35, maxR: 3.0 })
        );
        rocksColTpl = rocksProto
            ? computeProtoCollider(rocksProto, {
                inflate: 0.25,
                yPad: 0.2,
                maxR: 7.0,
            })
            : null;
        mountainColTpl = mountainProto
            ? computeProtoCollider(mountainProto, {
                inflate: 2.8,
                yPad: 6.0,
                maxR: 120,
            })
            : null;
    }

    // ============================================================
    // Chunk builder (same logic as before)
    // ============================================================
    const _dummy = new THREE.Object3D();

    function startChunkBuild(ix, iz) {
        const k = key(ix, iz);
        if (activeChunks.has(k) || _building.has(k)) return;

        _building.add(k);
        _readyChunks.delete(k);

        const rng = mulberry32(hashInt2(ix, iz));

        const x0 = ix * chunkSize,
            z0 = iz * chunkSize;
        const x1 = x0 + chunkSize,
            z1 = z0 + chunkSize;

        const treeCount = 10 + Math.floor(rng() * 14);
        const rockCount = 4 + Math.floor(rng() * 8);

        const dOrigin = Math.hypot((ix + 0.5) * chunkSize, (iz + 0.5) * chunkSize);
        const wantMountain = dOrigin > mapRadius * 0.9 && rng() < 0.18;

        const disks = [];
        const items = [];

        function pickSpot(estR, pad, tries = 30) {
            for (let t = 0; t < tries; t++) {
                const x = lerp(x0, x1, rng());
                const z = lerp(z0, z1, rng());
                if (Math.hypot(x, z) < 20) continue;
                if (overlapsDisks(disks, x, z, estR, pad)) continue;
                reserveDisk(disks, x, z, estR);
                return { x, z };
            }
            return null;
        }

        if (wantMountain && mountainProto) {
            const s = 0.55 + rng() * 0.75;
            const estR = 22 * s;
            const spot = pickSpot(estR, 2.0, 40);
            if (spot)
                items.push({
                    kind: "mountain",
                    x: spot.x,
                    z: spot.z,
                    yOffset: -6.5 - rng() * 6.0,
                    rot: rng() * Math.PI * 2,
                    scale: s,
                });
        }

        for (let i = 0; i < treeCount; i++) {
            const s = 0.85 + rng() * 0.75;
            const estR = 0.9 * s;
            const spot = pickSpot(estR, 0.9, 30);
            if (!spot) continue;
            items.push({
                kind: "tree",
                treePick: rng(),
                x: spot.x,
                z: spot.z,
                yOffset: 0.0,
                rot: rng() * Math.PI * 2,
                scale: s,
            });
        }

        for (let i = 0; i < rockCount; i++) {
            if (!rocksProto) break;
            const s = 0.7 + rng() * 0.9;
            const estR = 2.0 * s;
            const spot = pickSpot(estR, 0.9, 30);
            if (!spot) continue;
            items.push({
                kind: "rocks",
                x: spot.x,
                z: spot.z,
                yOffset: 0.0,
                rot: rng() * Math.PI * 2,
                scale: s,
            });
        }

        let tCount = [0, 0, 0];
        let rCount = 0;
        for (const it of items) {
            if (it.kind === "tree") {
                const idx = it.treePick < 0.33 ? 0 : it.treePick < 0.66 ? 1 : 2;
                tCount[idx]++;
            } else if (it.kind === "rocks") rCount++;
        }

        const group = new THREE.Group();
        group.name = `ChunkScatter_${ix}_${iz}`;
        streamRoot.add(group);

        const colliderList = [];
        activeChunks.set(k, { group, colliderList });

        const instTrees = [
            tCount[0] ? makeInstancedGroup(treeParts[0], tCount[0]) : [],
            tCount[1] ? makeInstancedGroup(treeParts[1], tCount[1]) : [],
            tCount[2] ? makeInstancedGroup(treeParts[2], tCount[2]) : [],
        ];
        const instRocks = rCount ? makeInstancedGroup(rocksParts, rCount) : [];

        for (const arr of instTrees) for (const m of arr) group.add(m);
        for (const m of instRocks) group.add(m);

        _buildJobs.push({
            k,
            ix,
            iz,
            group,
            colliderList,
            items,
            i: 0,
            ti: [0, 0, 0],
            ri: 0,
            instTrees,
            instRocks,
        });
        _dirtyColliders = true;
    }

    function tickBuildJobsMs(msBudget = 1.0) {
        const t0 = performance.now();

        while (_buildJobs.length && performance.now() - t0 < msBudget) {
            const job = _buildJobs[0];

            if (job.i >= job.items.length) {
                _buildJobs.shift();
                _building.delete(job.k);
                _readyChunks.add(job.k);

                _dirtyColliders = true;
                for (const arr of job.instTrees)
                    for (const m of arr) m.instanceMatrix.needsUpdate = true;
                for (const m of job.instRocks) m.instanceMatrix.needsUpdate = true;
                continue;
            }

            const it = job.items[job.i++];

            if (it.kind === "mountain" && mountainProto) {
                const m = mountainProto.clone(true);
                const y = terrainHeight(it.x, it.z) + it.yOffset;
                m.position.set(it.x, y, it.z);
                m.rotation.y = it.rot;
                m.scale.setScalar(it.scale);
                job.group.add(m);

                const col = colliderFromTemplate(
                    mountainColTpl,
                    y,
                    it.scale,
                    it.x,
                    it.z
                );
                if (col) job.colliderList.push(col);
                continue;
            }

            if (it.kind === "tree") {
                const idx = it.treePick < 0.33 ? 0 : it.treePick < 0.66 ? 1 : 2;
                const id = job.ti[idx]++;

                const y = terrainHeight(it.x, it.z) + it.yOffset;

                _dummy.position.set(it.x, y, it.z);
                _dummy.rotation.set(0, it.rot, 0);
                _dummy.scale.setScalar(it.scale);
                _dummy.updateMatrix();

                const parts = job.instTrees[idx];
                for (const mesh of parts) mesh.setMatrixAt(id, _dummy.matrix);

                const col = colliderFromTemplate(
                    treeColTpl[idx],
                    y,
                    it.scale,
                    it.x,
                    it.z
                );
                if (col) job.colliderList.push(col);
                continue;
            }

            if (it.kind === "rocks") {
                const id = job.ri++;

                const y = terrainHeight(it.x, it.z) + it.yOffset;

                _dummy.position.set(it.x, y, it.z);
                _dummy.rotation.set(0, it.rot, 0);
                _dummy.scale.setScalar(it.scale);
                _dummy.updateMatrix();

                for (const mesh of job.instRocks) mesh.setMatrixAt(id, _dummy.matrix);

                const col = colliderFromTemplate(rocksColTpl, y, it.scale, it.x, it.z);
                if (col) job.colliderList.push(col);
                continue;
            }
        }
    }

    function addMemoryItem({ id, name, obj }) {
        if (!obj) return;
        obj.updateWorldMatrix(true, true);
        const p = obj.getWorldPosition(new THREE.Vector3());
        memoryItems.push({
            id,
            name,
            obj,
            pos: { x: p.x, y: p.y, z: p.z },
        });
    }
    
    // ============================================================
    // Setpieces helper
    // ============================================================
    async function addGLB({
        url,
        x,
        z,
        rot = 0,
        scale = 1,
        normalizeHeight = null,
        yOffset = 0,
        colliderInflate = 0.2,
        colliderMaxR = 40,
        addTo = setpieceRoot,
        colliderSink = setpieceColliders,
    }) {
        const proto = await loadPrototype(url);
        const model = proto.clone(true);

        model.scale.setScalar(scale);
        if (normalizeHeight) normalizeVisibleToHeight(model, normalizeHeight);

        const obj = rebaseToGroundXZ(model);
        obj.rotation.y = rot;
        placeOnTerrain(obj, x, z, yOffset);
        addTo.add(obj);

        if (colliderMaxR > 0) {
            const col = makeColliderFromObject(obj, {
                inflate: colliderInflate,
                maxR: colliderMaxR,
            });
            if (col) colliderSink.push(col);
        }

        return obj;
    }

    function raf() {
        return new Promise((r) => requestAnimationFrame(r));
    }

    function getProgress() {
        const total = _wantChunks.size || 1;
        let ready = 0;
        for (const k of _wantChunks) if (_readyChunks.has(k)) ready++;
        return ready / total;
    }

    function isReady() {
        for (const k of _wantChunks) if (!_readyChunks.has(k)) return false;
        return true;
    }

    async function warmup(
        playerPos,
        { maxFrames = 240, buildBudget = 9999, despawnBudget = 9999 } = {}
    ) {
        _lastCix = 1e9;
        _lastCiz = 1e9;

        update(playerPos);

        for (let f = 0; f < maxFrames; f++) {
            tickBuildJobsMs(buildBudget);
            processDespawnQueue(despawnBudget);

            if (_dirtyColliders) {
                colliders.length = 0;
                for (const c of setpieceColliders) colliders.push(c);
                for (const c of activeChunks.values())
                    for (const col of c.colliderList) colliders.push(col);
                _dirtyColliders = false;
            }

            if (
                _buildJobs.length === 0 &&
                _despawnQueue.length === 0 &&
                _building.size === 0
            )
                break;
            await raf();
        }
    }

    function update(playerPos) {
        const px = playerPos?.x ?? 0;
        const pz = playerPos?.z ?? 0;

        const cix = Math.floor(px / chunkSize);
        const ciz = Math.floor(pz / chunkSize);

        if (cix !== _lastCix || ciz !== _lastCiz) {
            _lastCix = cix;
            _lastCiz = ciz;

            _wantChunks.clear();

            for (let dz = -streamRadius; dz <= streamRadius; dz++) {
                for (let dx = -streamRadius; dx <= streamRadius; dx++) {
                    const ix = cix + dx;
                    const iz = ciz + dz;
                    const k = key(ix, iz);
                    _wantChunks.add(k);
                    startChunkBuild(ix, iz);
                }
            }

            for (const k of activeChunks.keys()) {
                if (!_wantChunks.has(k)) queueDespawn(k);
            }
        }

        tickBuildJobsMs(1.0);
        processDespawnQueue(90);

        if (_dirtyColliders) {
            colliders.length = 0;
            for (const c of setpieceColliders) colliders.push(c);
            for (const c of activeChunks.values())
                for (const col of c.colliderList) colliders.push(col);
            _dirtyColliders = false;
        }
    }

    function tick(dt) {
        for (let i = 0; i < runtime.length; i++) runtime[i](dt);
    }

    // ============================================================
    // Build setpieces + preload assets
    // ============================================================
    let npcBundle = null;

    async function scatterScene() {
        await preloadStreamingProtos();

        const oldSet = scene.getObjectByName("__SETPIECES__");
        if (oldSet) oldSet.removeFromParent();
        const oldStream = scene.getObjectByName("__STREAM_SCATTER__");
        if (oldStream) oldStream.removeFromParent();

        scene.add(setpieceRoot);
        scene.add(streamRoot);

        benches.length = 0;
        interactables.length = 0;
        starTargets.length = 0;
        setpieceColliders.length = 0;
        colliders.length = 0;
        runtime.length = 0;
        walkables.length = 0; // ✅ add this

        activeChunks.clear();
        _buildJobs.length = 0;
        _despawnQueue.length = 0;
        _building.clear();
        _dirtyColliders = true;
        _used.length = 0; // reset per scatterScene call

        // --- Car ---
        {
        const p = pickSpots(200, 250, 28);
        await addGLB({
            url: "assets/models/Car.glb",
            x: p.x,
            z: p.z,
            rot: Math.random() * Math.PI * 2,
            scale: 0.5,
            yOffset: 0.0,
            colliderInflate: 0.6,
            colliderMaxR: 10,
        });
        }

        // --- Spawn platform ---
        const spawnPad = await addGLB({
            url: "assets/models/spawn.glb",
            x: 0,
            z: 0,
            rot: Math.random() * Math.PI * 2,
            scale: 1.0,
            yOffset: -0.7,
            colliderMaxR: 0,
            colliderInflate: 0.0,
        });

        const cx = 0, cz = 0;
        const ringR = 4.2;
        const postR = 0.35;
        const yMin = terrainHeight(cx, cz) - 1;
        const yMax = yMin + 3.0;

        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            setpieceColliders.push({
            x: cx + Math.cos(a) * ringR,
            z: cz + Math.sin(a) * ringR,
            r: postR,
            yMin,
            yMax,
            });
        }

        if (spawnPad) {
            spawnPad.userData.walkable = true;
            const meshes = [];
            spawnPad.traverse((o) => { if (o.isMesh) meshes.push(o); });
            walkables.push({ obj: spawnPad, meshes });
        }

        {
            const p = pickSpots(200, 250, 26);
            const benchObj = await addGLB({
                url: "assets/models/Bench.glb",
                x: -14,
                z: -8,
                rot: Math.random() * Math.PI * 2,
                scale: 0.21,
                yOffset: -0.6,
                colliderInflate: 0.25,
                colliderMaxR: 10,
            });

            if (benchObj) {
                benchObj.updateWorldMatrix(true, true);

                const box = new THREE.Box3().setFromObject(benchObj);
                const center = new THREE.Vector3();
                box.getCenter(center);

                // bench forward
                const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(benchObj.quaternion).normalize();

                // seat position: use bench center XZ, but seat Y from bench geometry (raycast)
                const seat = center.clone();
                seat.y = computeBenchSeatY(benchObj, seat.x, seat.z);

                // face direction
                const faceYaw = Math.atan2(forward.x, forward.z) + Math.PI - 1.7;

                const benchData = { obj: benchObj, seatPos: seat, seatYaw: faceYaw };
                benches.push(benchData);

                const benchId = `bench:${benches.length - 1}`;
                starTargets.push({ id: benchId, obj: benchObj });

                interactables.push({
                    id: benchId,
                    type: "bench",
                    bench: benchData,
                    anchorPos: seat.clone(),
                    radius: 2.6,
                    priority: 1,
                });
                addMemoryItem({
                    id: benchId,
                    name: "THE Bench",
                    obj: benchObj,
                });
            }
        }

        // --- Boba ---
        {
            const p = pickSpots(200, 250, 22);
            const boba = await addGLB({ 
                url:"assets/models/boba.glb", 
                x:p.x, z:p.z, 
                rot:Math.random()*Math.PI*2, 
                scale:1, 
                normalizeHeight:1.2, 
                colliderInflate:0.2, 
                colliderMaxR:5 
            });

            if (boba) {
                interactables.push({
                    id: "mem:boba_01",
                    type: "boba",
                    obj: boba,
                    radius: 3.0,
                    priority: 3,
                    getText: () => "Press E to talk",
                });
                starTargets.push({ id: "mem:boba_01", obj: boba });
                addMemoryItem({
                    id: "mem:boba_01",
                    name: "Boba Stand",
                    obj: boba,
                });
            }
        }

        // --- Wood fire ---
        {
            const p = pickSpots(200, 250, 24);
            const fire = await addGLB({
                url: "assets/models/wood_fire.glb",
                x: p.x,
                z: p.z,
                rot: 0,
                scale: 1.2,
                yOffset: 0.0,
                colliderInflate: 0.2,
                colliderMaxR: 6,
            });

            if (fire) {
                interactables.push({
                    id: "mem:wood_fire_01",
                    type: "wood_fire",
                    obj: fire,
                    radius: 3.2,
                    priority: 4,
                    getText: () => "Press E to watch",
                });
                starTargets.push({ id: "mem:wood_fire_01", obj: fire });
                addMemoryItem({
                    id: "mem:wood_fire_01",
                    name: "Fireplace",
                    obj: fire,
                });
            }
        }

        // --- Flowers ---
        {
            const p = pickSpots(200, 250, 24);
            const flowers = await addGLB({
                url: "assets/models/flowers.glb",
                x: p.x,
                z: p.z,
                rot: Math.random() * Math.PI * 2,
                scale: 0.05,
                yOffset: -0.5,
                colliderMaxR: 0,
            });

            if (flowers) {
                interactables.push({
                    id: "mem:flower_01",
                    type: "flower",
                    obj: flowers,
                    radius: 2.8,
                    priority: 2,
                    getText: () => "Press E to examine",
                });
                starTargets.push({ id: "mem:flower_01", obj: flowers });
                addMemoryItem({
                    id: "mem:flower_01",
                    name: "Wild Flowers",
                    obj: flowers,
                });
            }
        }

        // ========================================================
        // ✅ Injured NPC + altar (random point)
        // ========================================================

        if (!npcBundle) {
            npcBundle = await buildNpcBundle({ gltfLoader, fbxLoader });
        }

        // deterministic-ish random per page load
        const rngNpc = mulberry32((Math.random() * 1e9) | 0);

        let npcPos = null;
        for (let tries = 0; tries < 50; tries++) {
            const p = randPointInDisk(
                rngNpc,
                Math.max(40, mapRadius * 0.35),
                mapRadius * 0.82
            );
            if (Math.hypot(p.x, p.z) < 30) continue;
            npcPos = p;
            break;
        }
        if (!npcPos) npcPos = { x: mapRadius * 0.55, z: -mapRadius * 0.35 };

        const npcX = npcPos.x;
        const npcZ = npcPos.z;
        const npcY = terrainHeight(npcX, npcZ);
        const npcYaw = rngNpc() * Math.PI * 2;

        const npc = makeNpcInstance({
            npcProto: npcBundle.npcProto,
            clips: npcBundle.clips,
        });
        npc.root.position.set(npcX, npcY, npcZ);
        npc.root.rotation.y = npcYaw;
        npc.root.scale.setScalar(1.0);
        npc.root.name = "__INJURED_NPC__";
        setpieceRoot.add(npc.root);

        // start idle
        npc.play("InjuredIdle", { loop: true, fade: 0.12, timeScale: 1.0 });

        // altar behind-left relative to NPC
        const forward = new THREE.Vector3(0, 0, 1)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), npcYaw)
            .normalize();
        const right = new THREE.Vector3(1, 0, 0)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), npcYaw)
            .normalize();

        const altarBehind = 2.2;
        const altarLeft = 0.55;

        const altarX = npcX - forward.x * altarBehind - right.x * altarLeft;
        const altarZ = npcZ - forward.z * altarBehind - right.z * altarLeft;

        const altarObj = await addGLB({
            url: "assets/models/altar.glb",
            x: altarX,
            z: altarZ,
            rot: npcYaw,
            scale: 1.0,
            yOffset: 0.0,
            colliderInflate: 0.25,
            colliderMaxR: 10,
        });

        // NPC collider
        setpieceColliders.push({
            x: npcX,
            z: npcZ,
            r: 0.85,
            yMin: npcY - 0.2,
            yMax: npcY + 2.3,
        });

        // Update mixer every frame
        runtime.push((dt) => npc.mixer.update(dt));

        // interactable state machine
        let active = true;
        let state = "idle"; // idle | talking | done

        const npcId = "npc:injured_01";
        npc.root.updateWorldMatrix(true, true);
        const npcAnchor = new THREE.Vector3();
        npc.root.getWorldPosition(npcAnchor);

        // talk anchor at chest-ish height (optional)
        npcAnchor.y = terrainHeight(npcAnchor.x, npcAnchor.z) + 1.2;

        interactables.push({
            id: npcId,
            type: "injured_npc",
            obj: npc.root,
            anchorPos: npcAnchor,   // optional (forces interaction point)
            radius: 3.2,
            priority: 10,

            enabled: () => active && state !== "done",
            getText: () => (active && state !== "done" ? "Press E to talk" : ""),

            npcApi: {
                playTalking() {
                if (state === "done") return;
                    state = "talking";
                    npc.play("Talking", { loop: true, fade: 0.12, timeScale: 1.0 });
                },

                async finishSequence() {
                    if (state === "done") return;

                    await npc.playOnce("FallingDown", { fade: 0.1, timeScale: 1.0 });
                    npc.play("LayingMoaning", { loop: true, fade: 0.08, timeScale: 1.0 });

                    state = "done";
                    active = false;
                },
            },

            onInteract: (it) => {
                it.npcApi?.playTalking?.();
                // if you want to auto-finish later, you can call:
                // setTimeout(() => it.npcApi?.finishSequence?.(), 4000);
            },
        });

        // Prime initial chunks
        update({ x: 0, z: 0 });
    }

    return {
        scatterScene,
        update,
        warmup,
        tick,
        colliders,
        benches,
        interactables,
        starTargets,
        getProgress,
        isReady,
        walkables,
        memoryItems
    };
}
