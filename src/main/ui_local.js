// main/ui_local.js — local UI + audio helpers (split from main.js)
import { stopAllAudio, registerAudio, playSfx } from "../extra/audio.js";

let introAudio = null;
export function playIntroMusic() {
  if (!introAudio) {
    introAudio = registerAudio(new Audio("assets/mp3s/intro.mp3"));
    introAudio.loop = false;
    introAudio.volume = 0.35;
  }
  introAudio.currentTime = 0;
  introAudio.play().catch(() => {});
}

export function createTitleCard() {
  const el = document.createElement("div");
  el.id = "titleCard";
  el.style.cssText = `
    position:fixed;
    left:50%; top:28px;
    transform: translateX(-50%);
    z-index: 99995;
    pointer-events:none;
    opacity:0;
    transition: opacity 0.7s ease;
    filter: drop-shadow(0 12px 18px rgba(0,0,0,0.45));
  `;
  el.innerHTML = `<img src="assets/imgs/Title.png" style="width:min(560px, 78vw); height:auto;" />`;
  document.body.appendChild(el);

  async function show({ duration = 3.5, fadeIn = 0.7, fadeOut = 0.85 } = {}) {
    el.style.transition = `opacity ${fadeIn}s ease`;
    el.style.opacity = "1";
    await new Promise((r) => setTimeout(r, duration * 1000));
    el.style.transition = `opacity ${fadeOut}s ease`;
    el.style.opacity = "0";
    await new Promise((r) => setTimeout(r, fadeOut * 1000 + 30));
  }

  function destroy() { el.remove(); }
  return { show, destroy, el };
}

export function createGodlyCutsceneOverlay() {
  const el = document.createElement("div");
  el.id = "godlyCutsceneOverlay";
  el.style.cssText = `
    position:fixed; inset:0; z-index:999999;
    display:flex; align-items:center; justify-content:center;
    opacity:0; pointer-events:none;
    transition: opacity 0.6s ease;
    background: radial-gradient(circle at 50% 40%,
      rgba(255,240,200,0.25) 0%,
      rgba(10,12,20,1) 55%,
      rgba(0,0,0,1) 100%);
    overflow:hidden;
  `;

  el.innerHTML = `
    <canvas id="godlyFeatherCanvas" style="
      position:absolute; inset:0; width:100%; height:100%;
    "></canvas>

    <div style="position:relative; text-align:center; transform: translateY(-10px);">
      <div id="godlyHalo" style="
        width:220px; height:220px; margin:0 auto 18px auto;
        border-radius:999px;
        background: radial-gradient(circle,
          rgba(255,230,160,0.55) 0%,
          rgba(255,230,160,0.18) 35%,
          rgba(255,230,160,0.0) 70%);
        filter: drop-shadow(0 0 28px rgba(255,220,140,0.45));
        animation: haloPulse 1.6s ease-in-out infinite;
      "></div>

      <div style="
        position:absolute;
        width:360px; height:360px;
        left:50%; top:50%;
        transform: translate(-50%,-58%);
        background: radial-gradient(circle,
          rgba(255,240,180,0.35),
          rgba(255,240,180,0.0) 70%);
        filter: blur(18px);
        pointer-events:none;
      "></div>

      <svg id="angelWings" viewBox="0 0 900 360" style="
        width:520px;
        height:auto;
        margin:-160px auto 10px auto;
        filter: drop-shadow(0 0 22px rgba(255,220,150,0.45));
        animation: wingsBreath 3.8s ease-in-out infinite;
      ">
        <defs>
          <linearGradient id="featherGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(255,255,255,0.95)"/>
            <stop offset="55%" stop-color="rgba(255,240,200,0.75)"/>
            <stop offset="100%" stop-color="rgba(255,230,180,0.15)"/>
          </linearGradient>
        </defs>

        <g class="wing wingLeft" transform="translate(450 180)">
          <path class="feather" d="M0 0 C-120 -90,-260 -120,-360 -60 C-260 -40,-180 20,-120 60 Z"/>
          <path class="feather" d="M0 10 C-110 -60,-220 -90,-300 -40 C-220 -20,-160 30,-90 70 Z"/>
          <path class="feather" d="M0 30 C-100 -30,-190 -60,-260 -30 C-190 10,-140 50,-70 90 Z"/>
        </g>

        <g class="wing wingRight" transform="translate(450 180) scale(-1 1)">
          <path class="feather" d="M0 0 C-120 -90,-260 -120,-360 -60 C-260 -40,-180 20,-120 60 Z"/>
          <path class="feather" d="M0 10 C-110 -60,-220 -90,-300 -40 C-220 -20,-160 30,-90 70 Z"/>
          <path class="feather" d="M0 30 C-100 -30,-190 -60,-260 -30 C-190 10,-140 50,-70 90 Z"/>
        </g>

        <circle cx="450" cy="190" r="36" fill="rgba(255,220,150,0.25)"/>
      </svg>

      <div style="
        font: 800 26px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        color: rgba(255,235,190,0.95);
        text-shadow: 0 0 16px rgba(255,215,120,0.35);
        letter-spacing: 0.4px;
      ">Divine Passage</div>

      <div id="godlyPct" style="
        margin-top:10px;
        font: 600 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        color: rgba(255,255,255,0.78);
      ">Preparing…</div>
    </div>

    <style>
      @keyframes haloPulse {
        0%,100% { transform: scale(1); opacity: 0.95; }
        50% { transform: scale(1.06); opacity: 1; }
      }

      #angelWings .feather {
        fill: url(#featherGrad);
        opacity: 0.95;
        animation: featherSway 4.5s ease-in-out infinite;
      }

      .wingLeft .feather:nth-child(1) { animation-delay: 0s; }
      .wingLeft .feather:nth-child(2) { animation-delay: 0.6s; }
      .wingLeft .feather:nth-child(3) { animation-delay: 1.2s; }

      .wingRight .feather:nth-child(1) { animation-delay: 0s; }
      .wingRight .feather:nth-child(2) { animation-delay: 0.6s; }
      .wingRight .feather:nth-child(3) { animation-delay: 1.2s; }

      @keyframes featherSway {
        0%,100% { transform: rotate(0deg) translateY(0); }
        50% { transform: rotate(3deg) translateY(-6px); }
      }

      @keyframes wingsBreath {
        0%,100% { transform: scale(1); }
        50% { transform: scale(1.03); }
      }
    </style>
  `;

  document.body.appendChild(el);

  const canvas = el.querySelector("#godlyFeatherCanvas");
  const pctEl = el.querySelector("#godlyPct");
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas._dpr = dpr;
  }
  resize();
  window.addEventListener("resize", resize);

  const feathers = [];
  function spawnFeather() {
    feathers.push({
      x: Math.random(),
      y: -0.05 - Math.random() * 0.2,
      s: 0.006 + Math.random() * 0.012,
      vx: (Math.random() - 0.5) * 0.02,
      vy: 0.03 + Math.random() * 0.05,
      w: 0.02 + Math.random() * 0.03,
      a: 0.35 + Math.random() * 0.45,
      p: Math.random() * Math.PI * 2,
    });
  }
  for (let i = 0; i < 60; i++) spawnFeather();

  let running = false;
  let raf = 0;

  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (feathers.length < 140 && Math.random() < 0.55) spawnFeather();

    for (let i = feathers.length - 1; i >= 0; i--) {
      const f = feathers[i];
      f.p += 0.08;
      f.x += f.vx * (0.5 + 0.5 * Math.sin(f.p));
      f.y += f.vy;

      const cx = f.x * W;
      const cy = f.y * H;

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, f.w * W * 0.9);
      glow.addColorStop(0, `rgba(255,240,200,${f.a})`);
      glow.addColorStop(0.55, `rgba(255,240,200,${f.a * 0.35})`);
      glow.addColorStop(1, `rgba(255,240,200,0)`);

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, f.w * W, 0, Math.PI * 2);
      ctx.fill();

      if (f.y > 1.2) feathers.splice(i, 1);
    }
  }

  function setPct(p01) {
    if (!pctEl) return;
    if (p01 == null) pctEl.textContent = "Preparing…";
    else pctEl.textContent = `${Math.floor(p01 * 100)}%`;
  }

  async function fadeTo(opacity, duration = 0.6) {
    el.style.transition = `opacity ${duration}s ease`;
    el.style.opacity = String(opacity);

    if (opacity > 0) {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    } else {
      setTimeout(() => {
        running = false;
        cancelAnimationFrame(raf);
      }, duration * 1000 + 50);
    }

    await new Promise((r) => setTimeout(r, duration * 1000));
  }

  function destroy() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    el.remove();
  }

  return { el, setPct, fadeTo, destroy };
}

let godlyAudio = null;
export function startGodlyMusic({ reset = true } = {}) {
  stopAllAudio(); // ✅ kills intro + anything else registered

  if (!godlyAudio) {
    godlyAudio = registerAudio(new Audio("assets/mp3s/godly.mp3"));
    godlyAudio.loop = true;
    godlyAudio.volume = 0.65;
  }
  if (reset) godlyAudio.currentTime = 0;
  godlyAudio.play().catch(() => {});
}

export function stopGodlyMusic() {
  if (!godlyAudio) return;
  try { godlyAudio.pause(); } catch {}
  try { godlyAudio.currentTime = 0; } catch {}
}

export function createLoadingOverlay() {
  const el = document.createElement("div");
  el.id = "loadingOverlay";
  el.style.cssText = `
    position:fixed; inset:0; z-index:9999;
    display:flex; align-items:center; justify-content:center;
    background: #05060a;
    color: rgba(255,255,255,0.9);
    font: 16px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial;
  `;
  el.innerHTML = `<div style="text-align:center">
    <div style="font-size:18px; margin-bottom:10px;">Loading world…</div>
    <div id="loadingPct" style="opacity:0.75">0%</div>
  </div>`;
  document.body.appendChild(el);

  return {
    el,
    setPct(p) {
      const pct = document.getElementById("loadingPct");
      if (pct) pct.textContent = `${Math.floor(p)}%`;
    },
    hide() { el.remove(); },
  };
}

export function setWorldVisible(renderer, v) {
  renderer.domElement.style.visibility = v ? "visible" : "hidden";
}

export function showAnnouncement({
  title,
  subtitle,
  duration = 10.0,
  fadeIn = 0.35,
  fadeOut = 0.55,
} = {}) {
  let el = document.getElementById("npcAnnouncement");
  if (!el) {
    el = document.createElement("div");
    el.id = "npcAnnouncement";
    el.style.cssText = `
      position: fixed;
      left: 50%;
      top: 62%;
      transform: translate(-50%, -50%);
      z-index: 9998;
      text-align: center;
      pointer-events: none;
      opacity: 0;
      transition: opacity ${fadeIn}s ease;
      will-change: opacity, transform;
      filter: drop-shadow(0 0 10px rgba(255, 215, 120, 0.55));
    `;
    el.innerHTML = `
      <div id="npcAnnouncementTitle" style="
        font: 800 44px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        color: #ffd97a;
        text-shadow: 0 0 14px rgba(255,215,120,0.55);
        letter-spacing: 0.5px;
      "></div>
      <div id="npcAnnouncementSub" style="
        margin-top: 10px;
        font: 500 18px/1.25 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        color: rgba(255,255,255,0.92);
        text-shadow: 0 0 10px rgba(0,0,0,0.35);
      "></div>
    `;
    document.body.appendChild(el);
  }

  const tEl = document.getElementById("npcAnnouncementTitle");
  const sEl = document.getElementById("npcAnnouncementSub");
  tEl.textContent = title ?? "";
  sEl.textContent = subtitle ?? "";

  el.style.transition = `opacity ${fadeIn}s ease`;
  el.style.opacity = "0";
  el.style.display = "block";

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      el.style.opacity = "1";

      const visibleMs = Math.max(0, duration) * 1000;

      setTimeout(() => {
        el.style.transition = `opacity ${fadeOut}s ease`;
        el.style.opacity = "0";

        setTimeout(() => {
          el.style.display = "none";
          resolve();
        }, fadeOut * 1000 + 20);
      }, visibleMs);
    });
  });
}
