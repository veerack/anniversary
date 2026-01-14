// terrain/utils.js
import * as THREE from "three";
import { hash2 } from "../extra/utils.js";

export function fract(x) { return x - Math.floor(x); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(t) { return t * t * (3 - 2 * t); }

export function valueNoise2(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;

  const v00 = hash2(xi, zi);
  const v10 = hash2(xi + 1, zi);
  const v01 = hash2(xi, zi + 1);
  const v11 = hash2(xi + 1, zi + 1);

  const u = smoothstep(xf);
  const v = smoothstep(zf);

  const a = lerp(v00, v10, u);
  const b = lerp(v01, v11, u);
  return lerp(a, b, v); // [0..1]
}

export function fbm(x, z, {
  octaves = 5,
  lacunarity = 2.0,
  gain = 0.5,
  freq = 1.0,
  amp = 1.0,
} = {}) {
  let sum = 0;
  let a = amp;
  let f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise2(x * f, z * f) * 2 - 1) * a;
    f *= lacunarity;
    a *= gain;
  }
  return sum;
}

export function ridged(x, z, {
  octaves = 5,
  lacunarity = 2.0,
  gain = 0.5,
  freq = 1.0,
  amp = 1.0,
} = {}) {
  let sum = 0;
  let a = amp;
  let f = freq;
  let prev = 1.0;
  for (let i = 0; i < octaves; i++) {
    let n = valueNoise2(x * f, z * f);
    n = 1.0 - Math.abs(n * 2.0 - 1.0);
    n *= n;
    sum += n * a * prev;
    prev = n;
    f *= lacunarity;
    a *= gain;
  }
  return sum;
}

export function domainWarp(x, z, strength = 0.35, freq = 0.02) {
  const wx = fbm(x + 31.7, z - 12.9, { octaves: 3, freq, amp: 1.0 });
  const wz = fbm(x - 19.4, z + 44.1, { octaves: 3, freq, amp: 1.0 });
  return { x: x + wx * strength * 20.0, z: z + wz * strength * 20.0 };
}

export function clamp01(x) {
  return THREE.MathUtils.clamp(x, 0, 1);
}
