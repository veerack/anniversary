import * as THREE from "three";
import { hash2 } from "./utils.js";

export function terrainHeight(x, z) {
  const h1 = Math.sin(x * 0.06) * 1.2 + Math.cos(z * 0.05) * 1.1;
  const h2 = Math.sin((x + z) * 0.035) * 1.6;
  const n  = (hash2(x * 0.35, z * 0.35) - 0.5) * 0.35;
  let h = (h1 + h2) * 0.8 + n;

  const d = Math.hypot(x, z);
  const flat = THREE.MathUtils.smoothstep(d, 0, 18);
  h *= (1.0 - flat * 0.75);

  return h;
}

export function placeOnTerrain(obj, x, z, yOffset = 0) {
  obj.position.set(x, terrainHeight(x, z) + yOffset, z);
}

function makeGrassMaps() {
  const size = 512;

  const c0 = document.createElement("canvas");
  c0.width = c0.height = size;
  const g0 = c0.getContext("2d");

  g0.fillStyle = "#0b2411";
  g0.fillRect(0,0,size,size);

  for (let i=0;i<14000;i++){
    const x = (Math.random()*size)|0;
    const y = (Math.random()*size)|0;
    const v = 50 + (Math.random()*90)|0;
    const r = 10 + (Math.random()*20)|0;
    g0.fillStyle = `rgb(${r},${v},${20})`;
    g0.fillRect(x,y,1,1);
  }

  g0.globalAlpha = 0.35;
  for (let i=0;i<2800;i++){
    const x = Math.random()*size;
    const y = Math.random()*size;
    const len = 2 + Math.random()*6;
    const ang = Math.random()*Math.PI*2;
    g0.strokeStyle = "rgba(160,255,190,0.20)";
    g0.lineWidth = 1;
    g0.beginPath();
    g0.moveTo(x,y);
    g0.lineTo(x + Math.cos(ang)*len, y + Math.sin(ang)*len);
    g0.stroke();
  }
  g0.globalAlpha = 1;

  const cN = document.createElement("canvas");
  cN.width = cN.height = size;
  const gN = cN.getContext("2d");
  const imgN = gN.createImageData(size,size);

  function heightAt(x,y){
    const n = Math.sin(x*12.9898 + y*78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  for (let y=0;y<size;y++){
    for (let x=0;x<size;x++){
      const hL = heightAt(x-1,y);
      const hR = heightAt(x+1,y);
      const hD = heightAt(x,y-1);
      const hU = heightAt(x,y+1);

      const dx = (hR - hL) * 1.2;
      const dy = (hU - hD) * 1.2;

      let nx = -dx, ny = -dy, nz = 1.0;
      const inv = 1 / Math.hypot(nx,ny,nz);
      nx*=inv; ny*=inv; nz*=inv;

      const i = (y*size + x)*4;
      imgN.data[i+0] = ((nx*0.5+0.5)*255)|0;
      imgN.data[i+1] = ((ny*0.5+0.5)*255)|0;
      imgN.data[i+2] = ((nz*0.5+0.5)*255)|0;
      imgN.data[i+3] = 255;
    }
  }
  gN.putImageData(imgN,0,0);

  const cR = document.createElement("canvas");
  cR.width = cR.height = size;
  const gR = cR.getContext("2d");
  const imgR = gR.createImageData(size,size);
  for (let y=0;y<size;y++){
    for (let x=0;x<size;x++){
      const h = heightAt(x,y);
      const r = (170 + h*70)|0;
      const i = (y*size + x)*4;
      imgR.data[i+0] = r;
