// player/utils.js — pure helpers (no behavior change)

export function resolveCollisionsXZ(pos, y, cols, playerRadius) {
  if (!cols?.length) return;

  for (let iter = 0; iter < 4; iter++) {
    let pushed = false;

    for (const c of cols) {
      if (y < c.yMin || y > c.yMax) continue;

      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d2 = dx * dx + dz * dz;

      const minD = c.r + playerRadius;
      if (d2 >= minD * minD) continue;

      const d = Math.sqrt(d2) || 0.0001;
      const nx = dx / d;
      const nz = dz / d;

      const penetration = minD - d;
      const push = Math.min(penetration, 0.35);

      pos.x += nx * push;
      pos.z += nz * push;

      pushed = true;
    }

    if (!pushed) break;
  }
}

export function clampToMap(pos, mapRadius) {
  const d = Math.hypot(pos.x, pos.z);
  if (d > mapRadius) {
    const s = mapRadius / d;
    pos.x *= s;
    pos.z *= s;
  }
}
