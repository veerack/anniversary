// main/divine_sequence.js — divine sequence + streaming helpers, unchanged behavior

export async function ensureHeightAt({ terrain, terrainHeight }, x, z, {
  maxFrames = 180,
  stableFrames = 3,
} = {}) {
  let stable = 0;
  let last = NaN;

  for (let i = 0; i < maxFrames; i++) {
    terrain.update({ x, z }, 0);

    const h = terrainHeight(x, z);

    if (Number.isFinite(h)) {
      if (h === last) stable++;
      else stable = 1;

      last = h;

      if (stable >= stableFrames) return h;
    } else {
      stable = 0;
      last = NaN;
    }

    await new Promise((r) => requestAnimationFrame(r));
  }

  const h = terrainHeight(x, z);
  return Number.isFinite(h) ? h : 0;
}

export async function preStreamWorldAt(
  { THREE, renderer, scene, camera, terrain, world, grassField },
  x, z,
  {
    maxFrames = 900,
    minStableFrames = 20,
    dt = 1 / 60,
    onProgress = null,
  } = {}
) {
  let stable = 0;
  let lastP = -1;

  const pos = { x, z };
  const vpos = new THREE.Vector3(x, 0, z);

  if (typeof world.warmup === "function") {
    try {
      await world.warmup(pos, {
        buildBudget: 9999,
        despawnBudget: 9999,
        maxFrames: 240,
      });
    } catch {}
  }

  for (let i = 0; i < maxFrames; i++) {
    terrain.update(pos, dt);
    world.update(pos);
    grassField.update(performance.now() * 0.001, vpos, false);

    const tp = terrain.getProgress?.() ?? (terrain.isReady?.() ? 1 : 0);
    const wp = world.getProgress?.() ?? (world.isReady?.() ? 1 : 0);
    const p = Math.min(tp, wp);

    if (typeof onProgress === "function") onProgress(p);

    if (p === lastP) stable++;
    else stable = 0;
    lastP = p;

    const terrainReady = terrain.isReady?.() ?? true;
    const worldReady = world.isReady?.() ?? true;

    if (terrainReady && worldReady && stable >= minStableFrames) break;

    await new Promise((r) => requestAnimationFrame(r));
  }

  // warmup textures
  const m = terrain?.material;
  if (m) {
    if (m.map) renderer.initTexture(m.map);
    if (m.normalMap) renderer.initTexture(m.normalMap);
    if (m.roughnessMap) renderer.initTexture(m.roughnessMap);
    m.needsUpdate = true;
  }

  renderer.compile(scene, camera);

  for (let k = 0; k < 3; k++) {
    renderer.render(scene, camera);
    await new Promise((r) => requestAnimationFrame(r));
  }
}

export function createFeatherSwirl(THREE, scene, {
  count = 140,
  radius = 1.6,
  height = 2.4,
} = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.35, "rgba(255,240,200,0.55)");
  g.addColorStop(1, "rgba(255,240,200,0.0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const ring = new Float32Array(count);
  const yoff = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    seed[i] = Math.random() * 1000;
    ring[i] = radius * (0.25 + Math.random() * 0.95);
    yoff[i] = (Math.random() - 0.2) * height;

    pos[i * 3 + 0] = 0;
    pos[i * 3 + 1] = 0;
    pos[i * 3 + 2] = 0;
  }

  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.22,
    map: tex,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  const pts = new THREE.Points(geom, mat);
  pts.renderOrder = 9999;
  scene.add(pts);

  const _center = new THREE.Vector3();

  function update(t, centerWorld) {
    if (centerWorld) _center.copy(centerWorld);

    const a = geom.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const s = seed[i];
      const ang = (t * 3.3) + s;
      const r = ring[i] * (0.75 + 0.25 * Math.sin(t * 2.0 + s));
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;

      const yy = yoff[i] + ((t * 1.6 + s) % height) - height * 0.5;

      a[i * 3 + 0] = _center.x + x;
      a[i * 3 + 1] = _center.y + yy;
      a[i * 3 + 2] = _center.z + z;
    }
    geom.attributes.position.needsUpdate = true;
  }

  function setOpacity(o) { mat.opacity = o; }

  function destroy() {
    pts.removeFromParent();
    geom.dispose();
    mat.dispose();
    tex.dispose();
  }

  return { pts, update, setOpacity, destroy };
}

export function createBeacon(THREE, scene, targetPos, {
  height = 260,
  radius = 2.8,
  glowRadius = 7.0,
} = {}) {
  const root = new THREE.Group();
  root.name = "__BEACON__";
  root.position.copy(targetPos);

  const beamGeo = new THREE.CylinderGeometry(radius, radius, height, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffd36b,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = height * 0.5;
  beam.renderOrder = 9998;
  root.add(beam);

  const glowGeo = new THREE.CylinderGeometry(glowRadius, glowRadius, height, 12, 1, true);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xfff0b0,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.y = height * 0.5;
  glow.renderOrder = 9997;
  root.add(glow);

  const ringGeo = new THREE.RingGeometry(3.5, 7.0, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd36b,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  ring.renderOrder = 9999;
  root.add(ring);

  scene.add(root);

  function update(t) {
    beamMat.opacity = 0.18 + 0.10 * (0.5 + 0.5 * Math.sin(t * 2.2));
    glowMat.opacity = 0.06 + 0.05 * (0.5 + 0.5 * Math.sin(t * 1.6 + 1.0));
    ringMat.opacity = 0.55 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.8));
  }

  function destroy() {
    root.removeFromParent();
    beamGeo.dispose();
    glowGeo.dispose();
    ringGeo.dispose();
    beamMat.dispose();
    glowMat.dispose();
    ringMat.dispose();
  }

  return { root, update, destroy };
}

export function startDivineSequenceFactory({
  THREE,
  scene,
  renderer,
  camera,
  controls,
  player,
  playerVisual,

  avatar,
  playerCtl,

  // ✅ FIX: functions instead of accessor destructuring
  getCutsceneActive,
  setCutsceneActive,
  getDivineLiftActive,
  setDivineLiftActive,
  getDivineLiftY,
  setDivineLiftY,

  ensureSpecialNpcSpawned,
  getSpecialNpcCoords,

  createGodlyCutsceneOverlay,
  createFeatherSwirl,
  createBeacon,

  ensureHeightAt,
  preStreamWorldAt,
  setWorldVisible,
  hardSnapCameraToPlayer,

  startGodlyMusic,
  stopGodlyMusic,

  getActiveBeacon,
  setActiveBeacon,

  easeInOutCubic,
  rafPromise,
}) {
  return async function startDivineSequence({ npcPos }) {
    setCutsceneActive(true);
    playerCtl.setEnabled(false);
    controls.enabled = false;

    avatar.cancelDance?.();
    startGodlyMusic();

    const overlay = createGodlyCutsceneOverlay();
    const feathers3D = createFeatherSwirl({ count: 160, radius: 1.8, height: 2.8 });

    try {
      const startY = playerVisual.position.y;
      const liftHeight = 10.5;
      const liftDuration = 3.2;

      setDivineLiftActive(true);
      setDivineLiftY(startY);

      await overlay.fadeTo(0.0, 0.01);
      await avatar.playFbx?.("Floating", { fade: 0.12, loop: true }).catch?.(() => {});

      let elapsed = 0;
      while (elapsed < liftDuration) {
        await rafPromise();
        const dt = 1 / 60;
        elapsed += dt;

        const t = Math.min(1, elapsed / liftDuration);
        const k = easeInOutCubic(t);

        const y = startY + liftHeight * k;
        setDivineLiftY(y);

        const center = new THREE.Vector3(player.position.x, y + 0.4, player.position.z);
        feathers3D.update(performance.now() * 0.001, center);
        feathers3D.setOpacity(0.25 + 0.75 * k);
      }

      setWorldVisible(false);

      await overlay.fadeTo(1.0, 0.6);
      feathers3D.destroy();

      await ensureSpecialNpcSpawned();
      const npcP = getSpecialNpcCoords() || npcPos;
      if (!npcP) throw new Error("[DivineSequence] npc position missing");

      const to = npcP.clone().add(new THREE.Vector3(-6.0, 0, -10.0));
      const yGround = await ensureHeightAt(to.x, to.z);

      player.position.set(to.x, 0, to.z);
      playerVisual.position.y = yGround;
      playerCtl.snapToGroundNow();

      setDivineLiftActive(false);
      setDivineLiftY(yGround);

      const dir = npcP.clone().sub(new THREE.Vector3(to.x, yGround, to.z));
      player.rotation.y = Math.atan2(dir.x, dir.z);

      hardSnapCameraToPlayer();

      overlay.setPct(0.0);
      await preStreamWorldAt(to.x, to.z, {
        maxFrames: 900,
        minStableFrames: 25,
        dt: 1 / 60,
        onProgress: (p) => overlay.setPct(p),
      });

      const prev = getActiveBeacon();
      if (prev) prev.destroy();
      setActiveBeacon(createBeacon(npcP));

      avatar.stopAllFbx?.({ fade: 0.12, resume: true });

      renderer.render(scene, camera);
      await rafPromise();
      renderer.render(scene, camera);

      await overlay.fadeTo(0.0, 0.6);
      setWorldVisible(true);
    } catch (err) {
      console.error(err);
      try { overlay.el.style.opacity = "0"; } catch {}
    } finally {
      try { feathers3D.destroy(); } catch {}
      try { overlay.destroy(); } catch {}

      setDivineLiftActive(false);

      playerCtl.setEnabled(true);
      controls.enabled = true;
      setCutsceneActive(false);

      stopGodlyMusic();
    }
  };
}