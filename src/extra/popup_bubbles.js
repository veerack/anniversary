// popup_bubbles.js
import * as THREE from "three";
import { stopAllAudio } from "./audio.js";

const audioCache = new Map();

/** plays only if not already playing */
function playPopupAudioOnce(src, volume = 0.6) {
  if (!src) return;

  let audio = audioCache.get(src);
  if (!audio) {
    audio = new Audio(src);
    audio.preload = "auto";
    audioCache.set(src, audio);
  }

  audio.volume = volume;

  // if already playing, do nothing
  if (!audio.paused && audio.currentTime > 0 && !audio.ended) return;

  audio.currentTime = 0;
  audio.play().catch(() => {}); // ignore autoplay blocks
}

function stopPopupAudio(src) {
  if (!src) return;
  const audio = audioCache.get(src);
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

function pickRandom(arr) {
    return arr[(Math.random() * arr.length) | 0];
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";

    for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width <= maxWidth) {
            line = test;
        } else {
            if (line) lines.push(line);
            line = w;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function makeBubbleSprite(text, opts) {
    const {
        font = "600 22px system-ui, -apple-system, Segoe UI, Roboto, Arial",
        paddingX = 18,
        paddingY = 4,
        radius = 14,
        pointerH = 10,
        pointerW = 18,
        bg = "rgba(12, 14, 20, 0.78)",
        border = "rgba(255,255,255,0.18)",
        textColor = "rgba(255,255,255,0.94)",
        shadow = true,
        maxLineWidthPx = 260,
        lineGap = 8,
        dpiScale = 2, // crispness
    } = opts;

    // Measure + wrap
    const tmp = document.createElement("canvas");
    const tctx = tmp.getContext("2d");
    tctx.font = font;

    const lines = wrapText(tctx, text, maxLineWidthPx);
    const lineHeight = 24; // close enough for 22px
    const textW = Math.min(
        maxLineWidthPx,
        Math.max(...lines.map(l => tctx.measureText(l).width), 0)
    );
    const textH = lines.length * lineHeight + (lines.length - 1) * lineGap;

    const w = Math.ceil(textW + paddingX * 2);
    const h = Math.ceil(textH + paddingY * 2 + pointerH);

    // Build canvas at higher DPI for crisp sprite
    const canvas = document.createElement("canvas");
    canvas.width = w * dpiScale;
    canvas.height = h * dpiScale;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpiScale, dpiScale);
    ctx.font = font;
    ctx.textBaseline = "top";

    // Bubble shape (rounded rect + bottom pointer)
    const x = 0, y = 0, bw = w, bh = h - pointerH;
    const px = bw / 2; // pointer center

    if (shadow) {
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 6;
    }

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + bw - radius, y);
    ctx.quadraticCurveTo(x + bw, y, x + bw, y + radius);
    ctx.lineTo(x + bw, y + bh - radius);
    ctx.quadraticCurveTo(x + bw, y + bh, x + bw - radius, y + bh);

    // pointer
    ctx.lineTo(px + pointerW / 2, y + bh);
    ctx.lineTo(px, y + bh + pointerH);
    ctx.lineTo(px - pointerW / 2, y + bh);

    ctx.lineTo(x + radius, y + bh);
    ctx.quadraticCurveTo(x, y + bh, x, y + bh - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    // Fill + border
    ctx.fillStyle = bg;
    ctx.fill();

    // Remove shadow for stroke/text
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Text
    ctx.fillStyle = textColor;
    let ty = paddingY;
    for (const line of lines) {
        ctx.fillText(line, paddingX, ty);
        ty += lineHeight + lineGap;
    }

    // Texture + sprite
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        opacity: 1,
    });

    const sprite = new THREE.Sprite(mat);

    // Scale: convert pixels to world units (tune this)
    // This keeps "always readable" *relative* to your scene; sprites still get smaller far away.
    // If you want constant screen-size, tell me and I’ll switch to CSS2D.
    const worldPerPx = 0.0055;
    sprite.scale.set(w * worldPerPx, h * worldPerPx, 1);

    // Store for cleanup
    sprite.userData._bubble = { tex, canvasW: w, canvasH: h };

    return sprite;
}

export function createSitPopupSystem({
    scene,
    getAnchorObject, // () => THREE.Object3D (eg head bone or playerVisual)
    config,
}) {
    let timeSinceLast = 0;
    let bubble = null;
    let bubbleAge = 0;
    let enabled = false;

    // tweak: place bubble above head
    const bubbleOffset = new THREE.Vector3(0, 2, 0);

    function clearBubble() {
        if (!bubble) return;
        scene.remove(bubble);
        const { tex } = bubble.userData._bubble || {};
        if (tex) tex.dispose();
        if (bubble.material?.map) bubble.material.map.dispose?.();
        bubble.material?.dispose?.();
        bubble = null;
        bubbleAge = 0;
    }

    function spawnBubble() {
        clearBubble();

        const phrase = pickRandom(config.phrases);

        const src = config.audioMap?.[phrase];
        if (src) {
            stopAllAudio();
            playPopupAudioOnce(src, config.audioVolume ?? 0.4);
        }

        bubble = makeBubbleSprite(phrase, {
            maxLineWidthPx: config.maxLineWidthPx,
        });

        bubble.material.opacity = 1;
        bubble.renderOrder = 999;
        scene.add(bubble);
        bubbleAge = 0;
    }

    function setEnabled(on) {
        if (enabled === on) return;
        enabled = on;
        timeSinceLast = 0;
        clearBubble();

        // 🔇 standing up: stop any popup music
        if (!enabled && config.audioMap) {
            for (const src of Object.values(config.audioMap)) stopPopupAudio(src);
        }
    }

    function update(dt) {
        if (!enabled) return;

        // timer to spawn every interval
        timeSinceLast += dt;
        if (timeSinceLast >= config.intervalSec) {
            timeSinceLast = 0;
            spawnBubble();
        }

        // follow anchor
        if (bubble) {
            bubbleAge += dt;

            const anchor = getAnchorObject();
            if (anchor) {
                anchor.getWorldPosition(bubble.position);
                bubble.position.add(bubbleOffset);
            }

            // lifetime + fade
            const life = config.lifetimeSec;
            const fade = config.fadeOutSec;
            if (bubbleAge >= life) {
                clearBubble();
            } else if (bubbleAge >= life - fade) {
                const t = (bubbleAge - (life - fade)) / fade; // 0..1
                bubble.material.opacity = 1 - t;
            } else {
                bubble.material.opacity = 1;
            }
        }
    }

    return { setEnabled, update, clearBubble };
}

export function createManualPopupBubbleSystem({
  scene,

  // OLD (still supported)
  getAnchorObject, // () => THREE.Object3D

  // ✅ NEW (preferred): anchor directly to a world position (eg head position)
  getAnchorWorldPosition, // () => THREE.Vector3

  offset = new THREE.Vector3(0, 2, 0),
  style = {},       // optional overrides for makeBubbleSprite options
  audioVolume = 0.6,
} = {}) {
  let bubble = null;
  let bubbleAge = 0;
  let life = 0;
  let fade = 0;
  let active = false;
  let currentAudioSrc = null;

  // ✅ internal mutable offset (so app can lower it during closeups)
  const _offset = offset.clone();
  const _tmp = new THREE.Vector3();

  function clear() {
    if (!bubble) return;
    scene.remove(bubble);

    const { tex } = bubble.userData._bubble || {};
    if (tex) tex.dispose();

    if (bubble.material?.map) bubble.material.map.dispose?.();
    bubble.material?.dispose?.();

    bubble = null;
    bubbleAge = 0;
    active = false;

    if (currentAudioSrc) {
      stopPopupAudio(currentAudioSrc);
      currentAudioSrc = null;
    }
  }

  function setOffset(v) {
    if (!v) return;
    _offset.copy(v);
  }

  function show(text, {
    lifetimeSec = 1.8,
    fadeOutSec = 0.25,
    audioSrc = null,
  } = {}) {
    clear();

    if (audioSrc) {
      currentAudioSrc = audioSrc;
      playPopupAudioOnce(audioSrc, audioVolume);
    }

    bubble = makeBubbleSprite(text, style);
    bubble.material.opacity = 1;
    bubble.renderOrder = 999;
    scene.add(bubble);

    bubbleAge = 0;
    life = lifetimeSec;
    fade = fadeOutSec;
    active = true;
  }

  function update(dt) {
    if (!active || !bubble) return;

    bubbleAge += dt;

    // ✅ prefer world-position anchor if provided
    if (typeof getAnchorWorldPosition === "function") {
      const p = getAnchorWorldPosition();
      if (p) bubble.position.copy(p).add(_offset);
    } else {
      const anchor = getAnchorObject?.();
      if (anchor) {
        anchor.getWorldPosition(_tmp);
        bubble.position.copy(_tmp).add(_offset);
      }
    }

    if (bubbleAge >= life) {
      clear();
      return;
    }

    if (bubbleAge >= life - fade) {
      const t = (bubbleAge - (life - fade)) / fade; // 0..1
      bubble.material.opacity = 1 - t;
    } else {
      bubble.material.opacity = 1;
    }
  }

  return { show, clear, update, setOffset };
}

