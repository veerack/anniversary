// birds.js — Animated GLB birds, world-random spawning, LOD + optimized
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

// ------------------------------------------------------------
// No-allocation temps
// ------------------------------------------------------------
const _v3a = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _quat = new THREE.Quaternion();

function makeRng(seed = 1337) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng, a, b) {
  return a + (b - a) * rng();
}

function randOnDisk(rng, rMin, rMax) {
  // uniform area distribution in annulus
  const u = rng();
  const r = Math.sqrt(rMin * rMin + (rMax * rMax - rMin * rMin) * u);
  const a = rng() * Math.PI * 2;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

function setCastReceive(root, cast = false, receive = false) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = cast;
    o.receiveShadow = receive;
  });
}

function forceSafeBounds(root, minRadius = 1.5) {
  // Some exports have tiny/invalid bounds -> they get culled and “disappear”.
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere?.();
    if (g.boundingSphere) g.boundingSphere.radius = Math.max(g.boundingSphere.radius, minRadius);
  });
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
export function setupBirds(scene, opts = {}) {
  const {
    url = "assets/models/bird.glb",
    count = 12,

    // WORLD spawning (birds distributed around the origin, and as you travel we respawn them “ahead”)
    worldRadius = 1400,         // overall world bird distribution radius (XZ)
    respawnNearPlayer = 320,    // when re-seeding (player moved), spawn within this around player
    minSpawnFromPlayer = 80,    // keep some distance so they’re not always above your head

    // heights
    minHeight = 18,
    maxHeight = 40,

    // movement
    baseSpeed = 6.2,
    speedJitter = 2.6,
    moveSpeedMul = 1.35,        // ✅ faster flight
    driftSpeed = 0.9,           // gentle center drift
    turnSpeed = 4.2,            // yaw responsiveness
    orbitMin = 22,
    orbitMax = 95,

    // animation
    animSpeed = 2.0,            // ✅ 2x speed

    // visuals
    scale = 0.5,               // ✅ slightly smaller (not much)
    scaleJitter = 0.10,
    castShadow = false,

    // perf LOD
    hideBeyond = 260,           // invisible beyond this
    slowBeyond = 140,           // mixer slowed beyond this
    stopAnimBeyond = 190,       // mixer stopped beyond this
    despawnBeyond = 520,        // if bird anchor is farther than this from player, respawn it (keeps world “fresh”)
    minBoundsRadius = 1.0,

    // safety
    disableFrustumCull = false, // set true only if your bird model still disappears

    seed = 1337,
    debug = false,
  } = opts;

  const loader = new GLTFLoader();
  const rng = makeRng(seed);

  const group = new THREE.Group();
  group.name = "__BIRDS__";
  scene.add(group);

  let proto = null;
  let protoAnims = [];
  let ready = false;

  // Per-bird state
  // anchor: world “center” the bird orbits around (moves slowly)
  // ang/rad: orbit params
  // vel: drift velocity for anchor
  const birds = [];

  // Cached squared distances (avoid sqrt)
  const hideBeyond2 = hideBeyond * hideBeyond;
  const slowBeyond2 = slowBeyond * slowBeyond;
  const stopAnimBeyond2 = stopAnimBeyond * stopAnimBeyond;
  const despawnBeyond2 = despawnBeyond * despawnBeyond;

  // ----------------------------------------------------------
  // Spawn / respawn
  // ----------------------------------------------------------
  function randomWorldAnchor() {
    const p = randOnDisk(rng, 0, worldRadius);
    return { x: p.x, z: p.z };
  }

  function randomAnchorNearPlayer(playerPos) {
    const p = randOnDisk(rng, minSpawnFromPlayer, respawnNearPlayer);
    return { x: playerPos.x + p.x, z: playerPos.z + p.z };
  }

  function respawnBird(b, playerPos, mode = "near") {
    const a = mode === "world" ? randomWorldAnchor() : randomAnchorNearPlayer(playerPos);

    b.anchor.x = a.x;
    b.anchor.z = a.z;

    b.h = randRange(rng, minHeight, maxHeight);
    b.rad = randRange(rng, orbitMin, orbitMax);
    b.ang = randRange(rng, 0, Math.PI * 2);

    b.spd = (baseSpeed + randRange(rng, -speedJitter, speedJitter)) * moveSpeedMul;

    // drift direction
    b.vel.set(randRange(rng, -1, 1), 0, randRange(rng, -1, 1));
    if (b.vel.lengthSq() < 1e-6) b.vel.set(1, 0, 0);
    b.vel.normalize().multiplyScalar(driftSpeed);

    // time offsets
    b.phase = randRange(rng, 0, 100);
    b.visibleEver = true;
  }

  // ----------------------------------------------------------
  // Load prototype
  // ----------------------------------------------------------
  (async () => {
    try {
      const gltf = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
      proto = gltf.scene;
      protoAnims = gltf.animations || [];

      if (debug) {
        console.log("🐦 bird.glb loaded:", url);
        console.log("🐦 animations:", protoAnims.map((a) => a.name));
      }

      // clean materials
      proto.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        if ("envMapIntensity" in o.material) o.material.envMapIntensity = 0.0;
        o.material.needsUpdate = true;
      });

      setCastReceive(proto, castShadow, false);
      forceSafeBounds(proto, minBoundsRadius);

      // Create pool
      for (let i = 0; i < count; i++) {
        const root = SkeletonUtils.clone(proto);

        // slightly smaller, with tiny jitter
        const s = scale * (1.0 + randRange(rng, -scaleJitter, scaleJitter));
        root.scale.setScalar(s);

        setCastReceive(root, castShadow, false);
        forceSafeBounds(root, minBoundsRadius);

        if (disableFrustumCull) {
          root.traverse((o) => {
            if (o.isMesh) o.frustumCulled = false;
          });
        }

        const mixer = protoAnims.length ? new THREE.AnimationMixer(root) : null;
        let action = null;

        if (mixer && protoAnims.length) {
          action = mixer.clipAction(protoAnims[0]);
          action.play();
          // ✅ 2x animation speed
          action.setEffectiveTimeScale(animSpeed);
          mixer.setTime(randRange(rng, 0, 10));
        }

        root.visible = false; // placed on first update
        group.add(root);

        const b = {
          root,
          mixer,
          action,

          anchor: new THREE.Vector3(0, 0, 0),
          vel: new THREE.Vector3(1, 0, 0),

          ang: 0,
          rad: 40,
          h: 24,
          spd: baseSpeed,

          phase: 0,
          visibleEver: false,

          // smooth position target (no allocations)
          tx: 0,
          ty: 0,
          tz: 0,
        };

        birds.push(b);
      }

      // Initial distribution: truly world-random (not all around player)
      // They’ll still “refresh near player” as you move.
      const origin = _v3a.set(0, 0, 0);
      for (const b of birds) respawnBird(b, origin, "world");

      ready = true;
    } catch (e) {
      console.error("🐦 Failed to load bird model:", url, e);
    }
  })();

  // ----------------------------------------------------------
  // Update
  // ----------------------------------------------------------
  let _time = 0;

  function update(dt, playerPos, camera) {
    if (!ready || !proto) return;
    if (!playerPos) return;

    // stable time
    const dts = Math.min(Math.max(dt, 0.0), 0.033);
    _time += dts;

    const px = playerPos.x;
    const py = playerPos.y;
    const pz = playerPos.z;

    const camPos = camera?.position;

    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      const r = b.root;

      // If player has traveled far away from this bird’s anchor, recycle it near player
      // (keeps birds spread through the world as you travel)
      const dxA = px - b.anchor.x;
      const dzA = pz - b.anchor.z;
      const distA2 = dxA * dxA + dzA * dzA;

      if (distA2 > despawnBeyond2) {
        respawnBird(b, playerPos, "near");
        r.visible = false; // will be re-shown on placement below
      }

      // Place / show once
      if (!r.visible) {
        // Put at its target position immediately once (no pop)
        b.ang = randRange(rng, 0, Math.PI * 2);
        const ox = Math.cos(b.ang) * b.rad;
        const oz = Math.sin(b.ang) * b.rad;

        b.tx = b.anchor.x + ox;
        b.tz = b.anchor.z + oz;
        b.ty = py + b.h;

        r.position.set(b.tx, b.ty, b.tz);
        r.visible = true;
      }

      // Orbit + drift
      b.ang += (b.spd / Math.max(6.0, b.rad)) * dts;
      b.anchor.addScaledVector(b.vel, dts);

      const ox = Math.cos(b.ang) * b.rad;
      const oz = Math.sin(b.ang) * b.rad;

      // small bob
      const bob = Math.sin((_time * 1.8) + b.phase) * 0.75;

      b.tx = b.anchor.x + ox;
      b.tz = b.anchor.z + oz;
      b.ty = py + b.h + bob;

      // Distance LOD (squared, cheap)
      let distCam2 = 0;
      if (camPos) {
        const dx = b.tx - camPos.x;
        const dy = b.ty - camPos.y;
        const dz = b.tz - camPos.z;
        distCam2 = dx * dx + dy * dy + dz * dz;

        // visibility cull
        if (distCam2 > hideBeyond2) {
          r.visible = false;
          continue;
        }
      }

      // Smooth follow to target (no heavy math)
      // lerp factor tuned to feel “flying” (snappier than before)
      const lerpA = 1.0 - Math.exp(-5.2 * dts);
      r.position.x += (b.tx - r.position.x) * lerpA;
      r.position.y += (b.ty - r.position.y) * lerpA;
      r.position.z += (b.tz - r.position.z) * lerpA;

      // Face direction of travel (yaw only, fast)
      _v3a.set(b.tx - r.position.x, 0, b.tz - r.position.z);
      if (_v3a.lengthSq() > 1e-6) {
        _v3a.normalize();
        const yaw = Math.atan2(_v3a.x, _v3a.z);
        _quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        const slerpA = 1.0 - Math.exp(-turnSpeed * dts);
        r.quaternion.slerp(_quat, slerpA);
      }

      // Animation LOD
      if (b.mixer) {
        if (camPos && distCam2 > stopAnimBeyond2) {
          // stop updating mixer
        } else if (camPos && distCam2 > slowBeyond2) {
          b.mixer.update(dts * 0.35);
        } else {
          b.mixer.update(dts);
        }
      }
    }
  }

  return {
    group,
    update,
    isReady: () => ready,
    _debug: { birds },
  };
}
