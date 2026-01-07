import * as THREE from "three";
import { terrainHeight } from "./terrain.js";

export function createGrassField({
  count = 120000,
  radius = 93,
  bladeH = 0.42,
  bladeW = 0.045
} = {}) {

  const bladeGeo = new THREE.PlaneGeometry(bladeW, bladeH, 1, 4);
  bladeGeo.translate(0, bladeH * 0.5, 0);

  const offsets = new Float32Array(count * 3);
  const scales  = new Float32Array(count);
  const yaws    = new Float32Array(count);
  const phases  = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = terrainHeight(x, z);

    offsets[i*3+0] = x;
    offsets[i*3+1] = y;
    offsets[i*3+2] = z;

    scales[i] = 0.85 + Math.random() * 0.55;
    yaws[i]   = Math.random() * Math.PI * 2;
    phases[i] = Math.random() * 10.0;
  }

  const instGeo = new THREE.InstancedBufferGeometry();
  instGeo.index = bladeGeo.index;
  instGeo.attributes.position = bladeGeo.attributes.position;
  instGeo.attributes.uv = bladeGeo.attributes.uv;
  instGeo.attributes.normal = bladeGeo.attributes.normal;

  instGeo.setAttribute("iOffset", new THREE.InstancedBufferAttribute(offsets, 3));
  instGeo.setAttribute("iScale",  new THREE.InstancedBufferAttribute(scales, 1));
  instGeo.setAttribute("iYaw",    new THREE.InstancedBufferAttribute(yaws, 1));
  instGeo.setAttribute("iPhase",  new THREE.InstancedBufferAttribute(phases, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uPlayerPos: { value: new THREE.Vector3() },
      uWindDir: { value: new THREE.Vector2(0.8, 0.2).normalize() },
      uWindStrength: { value: 1.0 },
      uInteractRadius: { value: 1.2 },
      uInteractStrength: { value: 0.65 }
    },
    vertexShader: `
      precision highp float;

      attribute vec3 iOffset;
      attribute float iScale;
      attribute float iYaw;
      attribute float iPhase;

      uniform float uTime;
      uniform vec3 uPlayerPos;
      uniform vec2 uWindDir;
      uniform float uWindStrength;
      uniform float uInteractRadius;
      uniform float uInteractStrength;

      varying vec2 vUv;
      varying float vShade;

      mat2 rot(float a){
        float s = sin(a), c = cos(a);
        return mat2(c,-s,s,c);
      }

      void main(){
        vUv = uv;

        vec3 p = position;
        p.y *= iScale;

        vec2 xz = rot(iYaw) * p.xz;
        p.x = xz.x;
        p.z = xz.y;

        float tip = smoothstep(0.15, 1.0, uv.y);
        float w = sin(uTime * 1.45 + iPhase) * 0.08
                + sin(uTime * 0.75 + iPhase * 1.7) * 0.05;

        vec2 wind = uWindDir * w * uWindStrength;
        p.xz += wind * tip * (0.9 + 0.25 * iScale);

        vec3 worldRoot = iOffset;
        vec2 toPlayer = (worldRoot.xz - uPlayerPos.xz);
        float d = length(toPlayer);
        float influence = 1.0 - smoothstep(0.0, uInteractRadius, d);
        vec2 pushDir = (d > 0.0001) ? normalize(toPlayer) : vec2(0.0, 1.0);

        p.xz += pushDir * (influence * uInteractStrength) * tip;

        vec3 worldPos = p + iOffset;
        vShade = 0.55 + 0.45 * uv.y;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      varying float vShade;

      void main(){
        float taper = mix(0.55, 1.0, smoothstep(0.0, 0.8, 1.0 - vUv.y));
        float centered = abs(vUv.x - 0.5);
        float width = 0.48 * taper;

        float edge = 1.0 - smoothstep(width - 0.06, width, centered);
        float tipFade = smoothstep(1.0, 0.82, vUv.y);
        float a = edge * (0.92 + 0.08 * tipFade);

        if (a < 0.05) discard;

        vec3 base = vec3(0.07, 0.20, 0.08);
        vec3 mid  = vec3(0.12, 0.36, 0.14);
        vec3 top  = vec3(0.20, 0.55, 0.22);

        float y = vUv.y;
        vec3 col = mix(base, mid, smoothstep(0.05, 0.7, y));
        col = mix(col, top, smoothstep(0.55, 1.0, y));
        col *= vShade;

        gl_FragColor = vec4(col, a);
      }
    `
  });

  const mesh = new THREE.Mesh(instGeo, mat);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  function update(time, playerPos, moving){
    mat.uniforms.uTime.value = time;
    mat.uniforms.uPlayerPos.value.copy(playerPos);
    mat.uniforms.uWindStrength.value = moving ? 1.15 : 0.85;
  }

  return { mesh, mat, update };
}
