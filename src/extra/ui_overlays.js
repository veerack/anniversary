// ui_overlays.js
// Small UI overlays: coords HUD, book page modal, and golden toast.

export function createCoordsHud() {
  const el = document.createElement("div");
  el.id = "coordHud";
  el.style.cssText = `
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 9999;
    user-select: none;
    pointer-events: none;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(0,0,0,0.35);
    border: 1px solid rgba(255,255,255,0.10);
    color: rgba(255,255,255,0.92);
    font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    backdrop-filter: blur(8px);
    min-width: 160px;
    text-align: right;
  `;
  el.textContent = "X: 0.00 | Y: 0.00 | Z: 0.00";
  document.body.appendChild(el);

  return {
    set(x, y, z) {
      el.textContent = `X: ${x.toFixed(2)} | Y: ${y.toFixed(2)} | Z: ${z.toFixed(2)}`;
    },
    remove() {
      el.remove();
    },
  };
}

export function createBookOverlay({ imgUrl }) {
  // Root
  const root = document.createElement("div");
  root.id = "bookOverlay";
  root.style.cssText = `
    position: fixed; inset: 0;
    z-index: 9998;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(6px);
    opacity: 0;
    transition: opacity 220ms ease;
    pointer-events: none;
    user-select: none;
  `;

  // Card
  const card = document.createElement("div");
  card.style.cssText = `
    width: min(900px, calc(100vw - 40px));
    height: min(680px, calc(100vh - 120px));
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(10,12,18,0.65);
    box-shadow: 0 18px 60px rgba(0,0,0,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
  `;

  const img = document.createElement("img");
  img.src = imgUrl;
  img.alt = "Book Page";
  img.style.cssText = `
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 12px;
  `;

  const hint = document.createElement("div");
  hint.style.cssText = `
    position:absolute;
    bottom: 26px;
    left: 0;
    right: 0;
    text-align: center;
    color: rgba(255,255,255,0.78);
    font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    pointer-events: none;
  `;
  hint.textContent = "Press ESC or ENTER to close";

  card.appendChild(img);
  root.appendChild(card);
  root.appendChild(hint);
  document.body.appendChild(root);

  let active = false;
  let onClose = null;

  function open({ onClosed } = {}) {
    if (active) return;
    active = true;
    onClose = onClosed || null;

    root.style.display = "flex";
    root.style.pointerEvents = "auto";
    requestAnimationFrame(() => {
      root.style.opacity = "1";
    });
  }

  function close() {
    if (!active) return;
    active = false;

    root.style.opacity = "0";
    root.style.pointerEvents = "none";
    const cb = onClose;
    onClose = null;

    setTimeout(() => {
      root.style.display = "none";
      cb?.();
    }, 230);
  }

  function onKeyDown(e) {
    if (!active) return;
    if (e.key === "Escape" || e.key === "Enter") {
      e.preventDefault();
      close();
    }
  }
  window.addEventListener("keydown", onKeyDown, { passive: false });

  return {
    open,
    close,
    isOpen: () => active,
  };
}

export function createGoldenToast() {
  const el = document.createElement("div");
  el.id = "goldToast";
  el.style.cssText = `
    position: fixed;
    left: 50%;
    top: 22%;
    transform: translateX(-50%);
    z-index: 9999;
    pointer-events: none;
    user-select: none;
    text-align: center;
    opacity: 0;
    transition: opacity 280ms ease, transform 280ms ease;
    transform-origin: center;
  `;

  const title = document.createElement("div");
  title.style.cssText = `
    font: 34px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    font-weight: 800;
    color: #ffd56a;
    text-shadow:
      0 0 10px rgba(255, 210, 90, 0.55),
      0 0 22px rgba(255, 210, 90, 0.35),
      0 10px 30px rgba(0,0,0,0.45);
    letter-spacing: 0.2px;
  `;
  title.textContent = "A special NPC Spawned!";

  const coords = document.createElement("div");
  coords.style.cssText = `
    margin-top: 10px;
    font: 16px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    color: rgba(255,255,255,0.92);
    text-shadow: 0 8px 26px rgba(0,0,0,0.55);
    opacity: 0.95;
  `;
  coords.textContent = "X: 0 | Y: 0 | Z: 0";

  el.appendChild(title);
  el.appendChild(coords);
  document.body.appendChild(el);

  let timer = null;

  function show({ x, y, z, durationMs = 20000 } = {}) {
    if (timer) clearTimeout(timer);

    coords.textContent = `X: ${x.toFixed(2)} | Y: ${y.toFixed(2)} | Z: ${z.toFixed(2)}`;

    el.style.opacity = "0";
    el.style.transform = "translateX(-50%) translateY(-6px)";
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateX(-50%) translateY(0px)";
    });

    timer = setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(-50%) translateY(-6px)";
      timer = null;
    }, durationMs);
  }

  return { show };
}
