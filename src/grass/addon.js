// grass/addon.js
import * as THREE from "three";
import { mergeGeometries } from "https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";

// ------------------------------------------------------------
// Procedural alpha texture for grass cards
// ------------------------------------------------------------
export function makeGrassBladeTexture(size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");

  g.clearRect(0, 0, size, size);

  const cx = size * 0.5;
  const bottom = size * 0.98;
  const top = size * 0.06;

  const grad = g.createLinearGradient(cx, bottom, cx, top);
  grad.addColorStop(0.00, "rgba(255,255,255,0.0)");
  grad.addColorStop(0.12, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.40, "rgba(255,255,255,0.95)");
  grad.addColorStop(1.00, "rgba(255,255,255,0.0)");

  g.fillStyle = grad;

  g.beginPath();
  const w0 = size * 0.20;
  const w1 = size * 0.10;
  const w2 = size * 0.02;

  g.moveTo(cx - w0, bottom);
  g.quadraticCurveTo(cx - w1, size * 0.55, cx - w2, top);
  g.lineTo(cx + w2, top);
  g.quadraticCurveTo(cx + w1, size * 0.55, cx + w0, bottom);
  g.closePath();
  g.fill();

  // subtle breakup
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a <= 0) continue;
    const n = (Math.random() * 2 - 1) * 0.07;
    d[i + 3] = (THREE.MathUtils.clamp(a + n, 0, 1) * 255) | 0;
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------
// Tuft geometry (crossed cards)
// ------------------------------------------------------------
export function makeTuftGeo(bladeW, bladeH) {
  const base = new THREE.PlaneGeometry(bladeW, bladeH, 1, 6);
  base.translate(0, bladeH * 0.5, 0);

  const geos = [];
  const angles = [0, Math.PI * 0.5, Math.PI * 0.25, -Math.PI * 0.25];

  for (const a of angles) {
    const gg = base.clone();
    gg.rotateY(a);
    gg.rotateX((Math.random() * 2 - 1) * 0.18);
    geos.push(gg);
  }

  // extra short fillers near base
  for (let i = 0; i < 2; i++) {
    const gg = base.clone();
    const s = 0.62 + Math.random() * 0.20;
    gg.scale(0.95, s, 0.95);
    gg.rotateY(Math.random() * Math.PI);
    gg.rotateX((Math.random() * 2 - 1) * 0.22);
    geos.push(gg);
  }

  return mergeGeometries(geos, false);
}

// ------------------------------------------------------------
// Shader modifier: wind + player push (no height work here)
// ------------------------------------------------------------
export function patchGrassMaterial(mat, bladeH) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uPlayer = { value: new THREE.Vector3() };
    shader.uniforms.uMoving = { value: 0 };
    shader.uniforms.uFadeNear = { value: 40 };
    shader.uniforms.uFadeFar = { value: 85 };
    shader.uniforms.uWindAmp = { value: 1.0 };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aRand;
        attribute float aPhase;

        uniform float uTime;
        uniform vec3  uPlayer;
        uniform float uMoving;
        uniform float uFadeNear;
        uniform float uFadeFar;
        uniform float uWindAmp;

        varying float vFade;

        float hash21(vec2 p){
          float n = sin(dot(p, vec2(127.1,311.7))) * 43758.5453;
          return fract(n);
        }
        float noise2(vec2 p){
          vec2 i=floor(p), f=fract(p);
          float a=hash21(i);
          float b=hash21(i+vec2(1,0));
          float c=hash21(i+vec2(0,1));
          float d=hash21(i+vec2(1,1));
          vec2 u=f*f*(3.0-2.0*f);
          return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
        }`
      )
      .replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>

        // world root position of this instance
        vec3 rootW = (modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;

        // fade by distance to player
        float distP = length(rootW.xz - uPlayer.xz);
        vFade = 1.0 - smoothstep(uFadeNear, uFadeFar, distP);

        float tip = smoothstep(0.08, 1.0, position.y / ${bladeH.toFixed(3)});

        // wind (macro + micro)
        float t = uTime;
        float macro = noise2(rootW.xz * 0.030 + vec2(t*0.15, t*0.11));
        float micro = noise2(rootW.xz * 0.180 + vec2(t*0.95, -t*0.88));
        float w = ((macro - 0.5) * 0.55 + (micro - 0.5) * 0.22) * uWindAmp;

        // player push
        vec2 toP = rootW.xz - uPlayer.xz;
        float pd = length(toP);
        float pr = 2.2;
        float push = (1.0 - smoothstep(0.0, pr, pd)) * uMoving;
        vec2 dir = (pd > 1e-4) ? (toP / pd) : vec2(0.0);

        float spring = sin(t * 9.0 + aPhase + rootW.x*0.25 + rootW.z*0.25) * 0.06;

        float bend = tip * (w * 0.38 + spring * 0.25 + push * 0.55);

        transformed.x += bend * (0.55 + aRand * 0.25);
        transformed.z += bend * (0.75 + aRand * 0.25);
        transformed.xz += dir * (push * tip * 0.22);

        // taper
        float taper = mix(1.0, 0.62, tip);
        transformed.x *= taper;
        transformed.z *= taper;
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vFade;

        float dither8x8(vec2 p){
          float x = floor(mod(p.x, 8.0));
          float y = floor(mod(p.y, 8.0));
          float i = x + y * 8.0;
          return fract(sin(i * 91.3458) * 47453.5453);
        }`
      )
      .replace(
        "#include <dithering_fragment>",
        `
        float a = gl_FragColor.a * vFade;
        float d = dither8x8(gl_FragCoord.xy);
        if (a < d * 0.28) discard;

        #include <dithering_fragment>
        `
      );

    mat.userData.shader = shader;
  };

  mat.needsUpdate = true;
  return mat;
}
