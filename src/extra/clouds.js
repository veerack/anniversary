// clouds.js — Minecraft-shader-style world-space cloud layers (procedural)
// Drop-in replacement for your current setupClouds(scene, count)

import * as THREE from "three";

// ------------------------------------------------------------
// Small shader helpers
// ------------------------------------------------------------
const VERT = /* glsl */ `
varying vec3 vWorldPos;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// 4x4 Bayer for cheap dithering (reduces banding in smooth alpha edges)
const FRAG = /* glsl */ `
precision highp float;

varying vec3 vWorldPos;

uniform float uTime;
uniform vec3  uSunDir;

uniform vec3  uCloudColor;
uniform vec3  uLightColor;

uniform float uScale;        // world->noise scale
uniform float uCoverage;     // 0..1 threshold
uniform float uSoftness;     // edge softness
uniform float uDensity;      // alpha multiplier
uniform float uHeightFade;   // fade with distance/horizon
uniform vec2  uWind;         // xz speed
uniform float uShadow;       // darkening inside cloud
uniform float uSilver;       // rim light strength
uniform float uFar;          // distance fade range

// --- hash / noise ---
float hash12(vec2 p){
  // deterministic, fast
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  // smooth
  vec2 u = f*f*(3.0-2.0*f);

  float a = hash12(i + vec2(0.0,0.0));
  float b = hash12(i + vec2(1.0,0.0));
  float c = hash12(i + vec2(0.0,1.0));
  float d = hash12(i + vec2(1.0,1.0));

  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

float fbm(vec2 p){
  float s = 0.0;
  float a = 0.55;
  float f = 1.0;
  for(int i=0;i<3;i++){   // ✅ was 5
    s += noise(p*f) * a;
    f *= 2.03;
    a *= 0.52;
  }
  return s;
}

// --- bayer dithering ---
float bayer4(vec2 p){
  // p in pixels (screen-ish)
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int idx = x + y*4;

  // 4x4 matrix values / 16
  float v = 0.0;
  if(idx==0) v=0.0;  if(idx==1) v=8.0;  if(idx==2) v=2.0;  if(idx==3) v=10.0;
  if(idx==4) v=12.0; if(idx==5) v=4.0; if(idx==6) v=14.0; if(idx==7) v=6.0;
  if(idx==8) v=3.0;  if(idx==9) v=11.0; if(idx==10) v=1.0; if(idx==11) v=9.0;
  if(idx==12) v=15.0; if(idx==13) v=7.0; if(idx==14) v=13.0; if(idx==15) v=5.0;

  return v / 16.0;
}

void main(){
  // World-space cloud field
  vec2 p = vWorldPos.xz * uScale;

  // Wind scroll (world anchored, just scrolling texture space)
  p += uWind * uTime;

  // Base + detail (Minecraft-ish)
  float n = fbm(p);
  float d = n;

  // Coverage controls "how cloudy"
  // Higher coverage => fewer clouds (threshold rises)
  float cov = uCoverage;
  float alpha = smoothstep(cov, cov + uSoftness, d);

  // Add a bit of eroded edge detail
  float e = fbm(p * 2.2 + 13.7);
  alpha *= smoothstep(0.15, 0.95, e);

  // density
  alpha *= uDensity;

  // distance fade (helps horizon + reduces popping)
  float dist = length(vWorldPos.xz);
  float df = 1.0 - smoothstep(uFar * 0.72, uFar, dist);
  alpha *= mix(0.25, 1.0, df);

  // If nearly transparent, discard early
  if(alpha < 0.003) discard;

  // Lighting: fake normal from noise gradient
  // cheap gradient (2 samples) instead of 4 fbm calls
  float eps = 0.65;
  float n1 = fbm(p);
  float nx = fbm(p + vec2(eps, 0.0)) - n1;
  float nz = fbm(p + vec2(0.0, eps)) - n1;
  vec3 N = normalize(vec3(-nx * 1.8, 1.0, -nz * 1.8));
  vec3 L = normalize(uSunDir);

  float ndl = clamp(dot(N, L), 0.0, 1.0);

  // Darken interiors
  float inner = mix(1.0, 1.0 - uShadow, smoothstep(0.25, 0.95, alpha));

  // Silver lining near edges where alpha is low but present + facing light
  float edge = smoothstep(0.02, 0.30, alpha) * (1.0 - smoothstep(0.30, 0.85, alpha));
  float silver = edge * pow(ndl, 1.2) * uSilver;

  vec3 col = uCloudColor;
  col *= inner;
  col = mix(col, uLightColor, ndl * 0.55);
  col += uLightColor * silver;

  // Subtle vertical fade so clouds don't look like a hard ceiling layer
  // (works because the plane is flat but world-space gives us distance cue)
  float hf = 1.0 - smoothstep(uFar * 0.10, uFar * 0.70, dist);
  alpha *= mix(0.35, 1.0, hf * uHeightFade);

  // Dither alpha a tiny bit (stabilizes edges)
  float dth = (bayer4(gl_FragCoord.xy) - 0.5) * 0.04;
  alpha = clamp(alpha + dth, 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
}
`;

// ------------------------------------------------------------
// Cloud system
// ------------------------------------------------------------
function makeCloudLayer({
  size = 5000,          // BIG so you see it toward horizon
  y = 180,              // higher so it reads like "sky clouds"
  scale = 0.0022,       // slightly larger cloud features
  coverage = 0.42,      // lower threshold => MORE clouds visible
  softness = 0.10,
  density = 1.0,
  wind = new THREE.Vector2(0.010, 0.005),
  shadow = 0.30,
  silver = 0.45,
  far = 2600,           // match the new huge size
  cloudColor = new THREE.Color(0xffffff),
  lightColor = new THREE.Color(1.0, 1.0, 1.0),
  sunDir = new THREE.Vector3(0.6, 1.0, 0.2).normalize(),
} = {}) {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(Math.PI / 2);

  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,

    // IMPORTANT: you must see it from BELOW
    side: THREE.FrontSide, // ✅ NOT DoubleSide

    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone().normalize() },

      uCloudColor: { value: cloudColor.clone() },
      uLightColor: { value: lightColor.clone() },

      uScale: { value: scale },
      uCoverage: { value: coverage },
      uSoftness: { value: softness },
      uDensity: { value: density },
      uHeightFade: { value: 1.0 },
      uWind: { value: wind.clone() },
      uShadow: { value: shadow },
      uSilver: { value: silver },
      uFar: { value: far },
    },
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, y, 0);
  mesh.frustumCulled = false;
  mesh.renderOrder = -950; // sky is -1000 in your sky.js, so this renders after sky

  return mesh;
}

/**
 * setupClouds(scene, countIgnoredOrOptions = 14, maybeOptions)
 * - compatible with your old call: setupClouds(scene, 14)
 * - better call:
 *   setupClouds(scene, { sunDir: sky.sunDir, area: 1400, height: 60 })
 */
export function setupClouds(scene, countOrOptions = 14, maybeOptions = {}) {
  const opts =
    typeof countOrOptions === "object"
      ? countOrOptions
      : (maybeOptions || {});

  const group = new THREE.Group();
  group.name = "__CLOUDS__";
  scene.add(group);

  const sunDir = (opts.sunDir ? opts.sunDir.clone() : new THREE.Vector3(0.6, 1.0, 0.25)).normalize();

  const layerA = makeCloudLayer({
    size: opts.area ?? 5000,
    y: opts.height ?? 180,
    sunDir,
  });

  const layerB = makeCloudLayer({
    size: (opts.area ?? 5000) * 1.06,
    y: (opts.height ?? 180) + 14,
    scale: 0.0029,
    coverage: 0.52,
    density: 0.55,
    wind: new THREE.Vector2(0.014, 0.008),
    shadow: 0.18,
    silver: 0.25,
    sunDir,
  });

  group.add(layerA);
  group.add(layerB);

  let t = 0;

  function setSunDir(dir) {
    const d = dir.clone().normalize();
    layerA.material.uniforms.uSunDir.value.copy(d);
    layerB.material.uniforms.uSunDir.value.copy(d);
  }

  function update(dt) {
    t += Math.min(dt, 0.05);
    layerA.material.uniforms.uTime.value = t;
    layerB.material.uniforms.uTime.value = t;
  }

  return { group, update, setSunDir };
}

