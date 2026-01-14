// terrain/addon.js — procedural grass textures + terrain material
import * as THREE from "three";
import { fract } from "./utils.js";

function makeGrassMaps() {
  const size = 1024;

  // Albedo
  const c0 = document.createElement("canvas");
  c0.width = c0.height = size;
  const g0 = c0.getContext("2d");

  g0.fillStyle = "#2f7a2f";
  g0.fillRect(0, 0, size, size);

  for (let i = 0; i < 260; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 90 + Math.random() * 220;
    const a = 0.10 + Math.random() * 0.16;

    g0.globalAlpha = a;
    g0.fillStyle = Math.random() < 0.55 ? "#3f8e3a" : "#256a27";
    g0.beginPath();
    g0.arc(x, y, r, 0, Math.PI * 2);
    g0.fill();
  }
  g0.globalAlpha = 1;

  g0.globalAlpha = 0.25;
  for (let i = 0; i < 12000; i++) {
    const x = (Math.random() * size) | 0;
    const y = (Math.random() * size) | 0;
    const v = (120 + Math.random() * 80) | 0;
    const r = (35 + Math.random() * 40) | 0;
    g0.fillStyle = `rgb(${r},${v},${r})`;
    g0.fillRect(x, y, 1, 1);
  }
  g0.globalAlpha = 1;

  g0.globalAlpha = 0.22;
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 6 + Math.random() * 18;
    const ang = Math.random() * Math.PI * 2;
    g0.strokeStyle = "rgba(255,255,255,0.12)";
    g0.lineWidth = 1;
    g0.beginPath();
    g0.moveTo(x, y);
    g0.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g0.stroke();
  }
  g0.globalAlpha = 1;

  // Normal map
  const cN = document.createElement("canvas");
  cN.width = cN.height = size;
  const gN = cN.getContext("2d");
  const imgN = gN.createImageData(size, size);

  function heightAt(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return fract(n);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = heightAt(x - 1, y);
      const hR = heightAt(x + 1, y);
      const hD = heightAt(x, y - 1);
      const hU = heightAt(x, y + 1);

      const dx = (hR - hL);
      const dy = (hU - hD);

      let nx = -dx, ny = -dy, nz = 1.0;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;

      const i = (y * size + x) * 4;
      imgN.data[i + 0] = ((nx * 0.5 + 0.5) * 255) | 0;
      imgN.data[i + 1] = ((ny * 0.5 + 0.5) * 255) | 0;
      imgN.data[i + 2] = ((nz * 0.5 + 0.5) * 255) | 0;
      imgN.data[i + 3] = 255;
    }
  }
  gN.putImageData(imgN, 0, 0);

  // Roughness
  const cR = document.createElement("canvas");
  cR.width = cR.height = size;
  const gR = cR.getContext("2d");
  const imgR = gR.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = heightAt(x, y);
      const v = (190 + h * 50) | 0;
      const i = (y * size + x) * 4;
      imgR.data[i + 0] = v;
      imgR.data[i + 1] = v;
      imgR.data[i + 2] = v;
      imgR.data[i + 3] = 255;
    }
  }
  gR.putImageData(imgR, 0, 0);

  const map = new THREE.CanvasTexture(c0);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;

  const normalMap = new THREE.CanvasTexture(cN);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(cR);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.needsUpdate = true;

  return { map, normalMap, roughnessMap };
}

export function createTerrainMaterial() {
  const { map, normalMap, roughnessMap } = makeGrassMaps();

  map.repeat.set(18, 18);
  normalMap.repeat.set(18, 18);
  roughnessMap.repeat.set(18, 18);

  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    roughnessMap,
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.0,
  });

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWorldPos;`)
      .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>\nvWorldPos = worldPosition.xyz;`);

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWorldPos;`)
      .replace(
        "#include <dithering_fragment>",
        `
        float m = sin(vWorldPos.x * 0.03) * 0.55 + cos(vWorldPos.z * 0.028) * 0.55;
        m += sin((vWorldPos.x + vWorldPos.z) * 0.015) * 0.35;
        m = m * 0.5 + 0.5;

        vec3 warmSun = vec3(1.06, 1.04, 0.98);
        vec3 coolShade = vec3(0.95, 1.02, 0.96);
        vec3 macroTint = mix(coolShade, warmSun, m);

        gl_FragColor.rgb *= macroTint;

        #include <dithering_fragment>
        `
      );
  };

  mat.needsUpdate = true;
  return mat;
}
