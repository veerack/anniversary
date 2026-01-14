// main/world_init.js — terrain warmup + loading progress waiters

export function warmupTerrain(renderer, terrain) {
  const m = terrain?.material;
  if (!m) return;

  if (m.map) renderer.initTexture(m.map);
  if (m.normalMap) renderer.initTexture(m.normalMap);
  if (m.roughnessMap) renderer.initTexture(m.roughnessMap);

  m.needsUpdate = true;
}

export function waitForTerrainReadyFactory({ terrain, player, loading }) {
  return async function waitForTerrainReady() {
    return new Promise((resolve) => {
      function tick() {
        terrain.update(player.position, 0);
        const p = terrain.getProgress?.() ?? 0;
        loading.setPct(5 + p * 60);
        if (terrain.isReady?.()) return resolve();
        requestAnimationFrame(tick);
      }
      tick();
    });
  };
}

export function waitForPropsReadyFactory({ world, player, loading }) {
  return async function waitForPropsReady() {
    return new Promise((resolve) => {
      function tick() {
        world.update(player.position);
        const p = world.getProgress?.() ?? 0;
        loading.setPct(70 + p * 20);
        if (world.isReady?.()) return resolve();
        requestAnimationFrame(tick);
      }
      tick();
    });
  };
}
