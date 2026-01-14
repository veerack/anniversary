// terrain/helpers.js
import * as THREE from "three";
import { domainWarp, fbm, ridged, valueNoise2, lerp, clamp01 } from "./utils.js";

// --- optional water carving overlay (set by app before terrain build) ---
let _waterCarve = null;

export function setWaterCarveData(data) {
  _waterCarve = data || null;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function distPointToSegment2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const apx = px - ax, apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  const t = ab2 > 1e-8 ? (apx * abx + apz * abz) / ab2 : 0;
  const tt = Math.max(0, Math.min(1, t));
  const cx = ax + abx * tt;
  const cz = az + abz * tt;
  const dx = px - cx;
  const dz = pz - cz;
  return Math.sqrt(dx * dx + dz * dz);
}

function _waterDepthAt(x, z) {
  const W = _waterCarve;
  if (!W) return 0;

  const shore = W.shore ?? 2.0;

  let d = 0;

  // --------------------------
  // LAKES (deep in center -> 0 at shore)
  // --------------------------
  for (const lake of (W.lakes || [])) {
    const dx = x - lake.x;
    const dz = z - lake.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const r = lake.r;
    const maxDepth = lake.depth ?? (W.lakeDepth ?? 1.2);

    if (dist <= r + shore) {
      // core depth: 1 at center -> 0 at r
      const core = 1 - smoothstep(0, r, dist);

      // extra smoothing band outside the lake edge: r..r+shore
      const edge = 1 - smoothstep(r, r + shore, dist);

      // depth is strong in core, fades out across edge band
      const t = core * edge;

      d = Math.max(d, maxDepth * t);
    }
  }

  // --------------------------
  // RIVERS (deep on centerline -> 0 at banks)
  // --------------------------
  for (const river of (W.rivers || [])) {
    const pts = river.pts || [];
    if (pts.length < 2) continue;

    const halfW = (river.w ?? 6) * 0.5;
    const maxDepth = river.depth ?? (W.riverDepth ?? 0.8);

    let best = 1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      best = Math.min(best, distPointToSegment2D(x, z, a.x, a.z, b.x, b.z));
    }

    if (best <= halfW + shore) {
      // core depth: 1 at centerline -> 0 at halfW
      const core = 1 - smoothstep(0, halfW, best);

      // extra smoothing band: halfW..halfW+shore
      const edge = 1 - smoothstep(halfW, halfW + shore, best);

      const t = core * edge;

      d = Math.max(d, maxDepth * t);
    }
  }

  return d;
}

// ✅ export this
export function getWaterCarveDepth(x, z) {
  return _waterCarve ? _waterDepthAt(x, z) : 0;
}

export function terrainSurfaceHeightProcedural(x, z) {
  // this returns the "pre-carve" height by adding carved depth back
  const hCarved = terrainHeightProcedural(x, z);  // already includes carve subtraction
  const d = _waterCarve ? _waterDepthAt(x, z) : 0;
  return hCarved + d;
}

export function terrainHeightProcedural(x, z) {
  const w = domainWarp(x, z, 0.45, 0.018);

  const hills =
    fbm(w.x, w.z, { octaves: 5, freq: 0.008, amp: 3.6, gain: 0.55, lacunarity: 2.05 }) +
    fbm(w.x + 1000, w.z - 900, { octaves: 3, freq: 0.02, amp: 1.1, gain: 0.5 });

  const mMask = clamp01(
    (ridged(w.x + 2200, w.z - 1300, { octaves: 4, freq: 0.0032, amp: 1.0 }) - 0.35) * 1.65
  );

  const mountains =
    ridged(w.x, w.z, { octaves: 5, freq: 0.0045, amp: 14.0, gain: 0.52, lacunarity: 2.05 }) +
    ridged(w.x + 777, w.z + 333, { octaves: 3, freq: 0.011, amp: 2.5, gain: 0.5 });

  let h = hills + mountains * mMask;

  const d = Math.hypot(x, z);

  // Flat spawn plateau: radius ~18 fully flat, soft edge to ~28
  const r0 = 18;
  const r1 = 28;
  const t = clamp01((d - r0) / (r1 - r0));
  const flat = t * t * (3 - 2 * t); // smoothstep

  // Blend the terrain height towards 0 at the center (not a scale)
  h = lerp(0.0, h, flat);

  // Keep micro-variation OUTSIDE the plateau so the spawn is clean
  if (flat > 0.001) {
    h += (valueNoise2(x * 0.07, z * 0.07) * 2 - 1) * 0.18 * flat;
  }

  if (_waterCarve) h -= _waterDepthAt(x, z);
  return h;
}

// ============================================================
// Height cache hookup (fast path)
// ============================================================

let _activeTerrain = null;

export function setActiveTerrain(sys) {
  _activeTerrain = sys;
}

/**
 * terrainHeight(x,z)
 * - Fast when terrain system is active + chunk grid exists
 * - Falls back to procedural if not ready / out of range
 */
export function terrainHeight(x, z) {
  if (_activeTerrain) {
    const h = _activeTerrain.sampleHeight(x, z);
    if (h !== null) return h;
  }
  return terrainHeightProcedural(x, z);
}

export function placeOnTerrain(obj, x, z, yOffset = 0) {
  obj.position.set(x, terrainHeight(x, z) + yOffset, z);
}
