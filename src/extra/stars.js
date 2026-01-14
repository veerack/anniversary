// stars.js (WORLD-ANCHORED, CONSTANT SCALE)
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const _box = new THREE.Box3();
const _center = new THREE.Vector3();
let _haloTex = null;

function makeHaloTexture(size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);

  // ✅ make the core golden, not white
  grad.addColorStop(0.00, "rgba(255,215,120,0.95)"); // warm gold
  grad.addColorStop(0.12, "rgba(255,210,90,0.70)");
  grad.addColorStop(0.30, "rgba(255,180,60,0.25)");
  grad.addColorStop(1.00, "rgba(255,160,40,0.00)");

  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeHaloSprite(scale = 1.35) {
  if (!_haloTex) _haloTex = makeHaloTexture(256);

  const mat = new THREE.SpriteMaterial({
    map: _haloTex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    opacity: 0.95,

    // ✅ gold tint (so even if texture is a bit pale, it stays gold)
    color: 0xffc44d,
  });

  const s = new THREE.Sprite(mat);
  s.scale.setScalar(scale);
  return s;
}

export function createStarManager({
  scene,
  starUrl = "assets/models/rotating_star.glb",
  uiTextEl,
  total = 10,
  margin = 1.55,
  scale = 0.25,     // constant world scale now

  starSize = 0.32,        // ⬅smaller star
  starYOffset = 0.65,     // ⬅higher above object

  bobAmp = 0.08,
  bobSpeed = 2.0,
  rotSpeed = 1.6,
  glow = true,
  sfxWhoosh = "assets/sfx/star_whoosh.mp3",
  sfxCollect = "assets/sfx/star_collect.mp3",
  sfxVolume = 0.85,
} = {}) {
  const loader = new GLTFLoader();
  let starProto = null;

  // id -> state
  const stars = new Map();
  let collectedCount = 0;

  function playOneShot(src, volume = 0.8) {
    if (!src) return;
    try {
      const a = new Audio(src);
      a.volume = volume;
      a.play().catch(() => {});
    } catch {}
  }

  function setUI(bump = false) {
    if (!uiTextEl) return;
    uiTextEl.textContent = `${collectedCount}/${total}`;

    // optional highlight pulse
    if (bump) {
      const el = uiTextEl.parentElement ?? uiTextEl;
      el.classList.remove("mem-bump");
      // force reflow
      void el.offsetWidth;
      el.classList.add("mem-bump");
    }
  }

  async function load() {
    if (starProto) return starProto;

    const gltf = await new Promise((res, rej) => loader.load(starUrl, res, undefined, rej));
    starProto = gltf.scene;

    starProto.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;

      // simple fake glow: slightly emissive + additive sprite halo (cheap)
      if (glow && o.material) {
        o.material = o.material.clone();
        o.material.toneMapped = false;

        if ("emissive" in o.material) {
          o.material.emissive.set(0xffc44d);     // ✅ gold
          o.material.emissiveIntensity = 1.8;
        }

        if ("color" in o.material) {
          o.material.color.set(0xffe1a3);        // ✅ warm base
        }

        o.material.needsUpdate = true;
      }
    });

    return starProto;
  }

  function computeTopWorld(target, outPos) {
    target.updateWorldMatrix(true, true);
    _box.setFromObject(target);
    _box.getCenter(_center);

    outPos.set(
      _center.x,
      _box.max.y + margin + starYOffset, // ✅ lifted here
      _center.z
    );

    return outPos;
  }

  async function addStar({ id, target }) {
    if (!id) throw new Error("addStar needs an id");
    if (!target) throw new Error("addStar needs a target Object3D");
    if (stars.has(id)) return;

    await load();

    const anchor = new THREE.Object3D();
    scene.add(anchor);

    // ✅ wrapper so we can re-center the model pivot locally
    const starGroup = new THREE.Group();
    anchor.add(starGroup);

    const star = starProto.clone(true);
    star.scale.setScalar(starSize);
    starGroup.add(star);

    // ✅ CENTER the star in starGroup (fix halo placement) — CORRECT SPACE
    star.updateWorldMatrix(true, true);
    const starBox = new THREE.Box3().setFromObject(star);

    const centerW = starBox.getCenter(new THREE.Vector3()); // world
    const centerL = starGroup.worldToLocal(centerW.clone()); // convert to starGroup local

    // move model so its visual center sits at (0,0,0) of starGroup
    star.position.sub(centerL);

    // ✅ add halo at starGroup origin (now aligned to visual star)
    const halo = glow ? makeHaloSprite(starSize * 2.4) : null;
    if (halo) {
      halo.position.set(0, 0, 0);
      starGroup.add(halo);
    }

    // initial position
    computeTopWorld(target, anchor.position);

    stars.set(id, {
      id,
      target,
      anchor,
      starGroup,     // ✅ store this
      star,
      collected: false,
      baseY: anchor.position.y,
      t: Math.random() * Math.PI * 2,
      fly: null,
    });
  }

  function isCollected(id) {
    const s = stars.get(id);
    return !!s?.collected;
  }

  function collect(id) {
    const s = stars.get(id);
    if (!s || s.collected) return false;

    s.collected = true;
    collectedCount++;
    setUI(true);

    // base scale (starSize already applied on the model)
    s.starGroup.scale.setScalar(0.32);

    // SFX
    playOneShot(sfxWhoosh, sfxVolume);

    s.fly = {
      t: 0,
      dur: 0.75,
      startPos: s.anchor.position.clone(),
      playedCollect: false,
    };

    return true;
  }

  function update(dt) {
    for (const s of stars.values()) {
      if (!s.collected) {
        computeTopWorld(s.target, s.anchor.position);

        s.t += dt;
        s.starGroup.rotation.y += dt * rotSpeed;     // ✅
        s.starGroup.position.y = Math.sin(s.t * bobSpeed) * bobAmp; // ✅

      } else if (s.fly) {
        s.fly.t += dt;
        const u = Math.min(1, s.fly.t / s.fly.dur);

        s.starGroup.rotation.y += dt * rotSpeed * 6.0; // ✅

        s.anchor.position.copy(s.fly.startPos)
          .add(new THREE.Vector3(0, 2.2 * u, 0))
          .add(new THREE.Vector3(0.35 * u, 0, -0.15 * u));

        const k = 1 - u;
        s.starGroup.scale.setScalar(0.25 + 0.75 * k); // ✅ shrink group (halo + star together)

        // ✅ play collect sound near the end of the fly
        if (!s.fly.playedCollect && u >= 0.85) {
          s.fly.playedCollect = true;
          playOneShot(sfxCollect, sfxVolume);
        }

        if (u >= 1) {
          scene.remove(s.anchor);
          s.fly = null;
        }
      }
    }
  }

  setUI(false);

  return {
    load,
    addStar,
    collect,
    isCollected,
    update,
    getCollected: () => collectedCount,
    getTotal: () => total,
  };
}
