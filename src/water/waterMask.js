// water/waterMask.js
import { distPointToSegment2D } from "./math.js";

export function makeWaterMask({ lakes = [], rivers = [] }) {

  function lakeDepth(x, z) {
    let d = 0;
    for (const l of lakes) {
      const dx = x - l.x;
      const dz = z - l.z;
      const r = Math.sqrt(dx*dx + dz*dz);
      if (r < l.r) {
        const t = 1 - r / l.r;
        d = Math.max(d, t);
      }
    }
    return d;
  }

  function riverDepth(x, z) {
    let d = 0;
    for (const r of rivers) {
      const half = (r.w ?? 6) * 0.5;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i];
        const b = r.pts[i + 1];
        const dist = distPointToSegment2D(x, z, a.x, a.z, b.x, b.z);
        if (dist < half) {
          const t = 1 - dist / half;
          d = Math.max(d, t);
        }
      }
    }
    return d;
  }

  return {
    depth01(x, z) {
      return Math.max(lakeDepth(x,z), riverDepth(x,z));
    }
  };
}
