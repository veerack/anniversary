// ui/memories_menu.js
function waitForTitleGone() {
  // try common ids/classes; adjust if yours is different
  const titleEl =
    document.getElementById("titleCard") ||
    document.getElementById("TitleCard") ||
    document.querySelector(".title-card") ||
    document.querySelector("#title");

  if (!titleEl) return Promise.resolve();

  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      const cs = getComputedStyle(titleEl);
      const op = parseFloat(cs.opacity || "1");
      const gone =
        cs.display === "none" ||
        cs.visibility === "hidden" ||
        op <= 0.02;

      // safety timeout so we never hang
      if (gone || performance.now() - t0 > 8000) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export function createMemoriesMenuUI({
  THREE,
  parentEl = document.body,
  titleFadeDonePromise,
} = {}) {
  // --- build hint DOM ---
  const hint = document.createElement("div");
  hint.className = "mem-hint";
  hint.innerHTML = `
    <div class="mem-hint-title">Recollect your memories!</div>
    <div class="mem-hint-sub">Press T for more information</div>
  `;
  parentEl.appendChild(hint);

  // --- build overlay DOM ---
  const overlay = document.createElement("div");
  overlay.id = "memOverlay";
  overlay.innerHTML = `
    <div class="memPanel">
      <div class="memPanelHeader">
        <div class="memPanelTitle">Memories</div>
        <div class="memPanelClose">Press <b>T</b> or <b>ESC</b> to close</div>
      </div>
      <div class="memList"></div>
    </div>
  `;
  parentEl.appendChild(overlay);

  const listEl = overlay.querySelector(".memList");

  // ---------- styling ----------
  const style = document.createElement("style");
  style.textContent = `
    /* ✅ HINT (AFTER TITLE) */
    .mem-hint{
      position: fixed;
      left: 50%;
      top: 18%;
      transform: translateX(-50%);
      z-index: 9999;
      text-align: center;
      color: rgba(255,255,255,0.95);
      text-shadow: 0 2px 20px rgba(0,0,0,0.55);
      opacity: 0;
      pointer-events: none;
      transition: opacity 600ms ease;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
    }
    .mem-hint.show{ opacity: 1; }

    .mem-hint-title{
      font-weight: 800;
      font-size: 44px;
      line-height: 1.1;
    }
    .mem-hint-sub{
      margin-top: 10px;
      font-weight: 650;
      font-size: 18px;
      line-height: 1.2;
      color: rgba(255,255,255,0.85);
    }

    /* ✅ OVERLAY */
    #memOverlay{
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(4px);
    }
    #memOverlay.open{ display: flex; }

    .memPanel{
      width: min(880px, 92vw);
      max-height: min(76vh, 720px);
      background: rgba(15,16,20,0.92);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 18px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.6);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .memPanelHeader{
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1px solid rgba(255,255,255,0.10);
    }
    .memPanelTitle{
      color: rgba(255,255,255,0.95);
      font: 800 18px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    }
    .memPanelClose{
      color: rgba(255,255,255,0.70);
      font: 600 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    }

    .memList{
      padding: 12px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .memRow{
      display: grid;
      grid-template-columns: 92px 1fr 220px;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
    }

    .memThumb{
      width: 92px;
      height: 68px;
      border-radius: 12px;
      background: rgba(0,0,0,0.25);
      border: 1px solid rgba(255,255,255,0.10);
      overflow: hidden;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .memThumb img{
      width: 100%;
      height: 100%;
      object-fit: contain;
      image-rendering: auto;
    }

    .memName{
      color: rgba(255,255,255,0.92);
      font: 700 15px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    }
    .memId{
      margin-top: 4px;
      color: rgba(255,255,255,0.55);
      font: 600 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    }

    .memCoords{
      color: rgba(255,255,255,0.85);
      font: 650 13px/1.3 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      text-align: right;
      white-space: pre;
    }
  `;
  parentEl.appendChild(style);

  // ---------- thumbnails (one-time) ----------
  const thumbGen = createThumbGenerator({ THREE });

  let items = [];
  let isOpen = false;

  async function setItems(newItems) {
    items = Array.isArray(newItems) ? newItems.slice() : [];
    await renderList();
  }

  async function renderList() {
    listEl.innerHTML = "";
    for (const it of items) {
      const row = document.createElement("div");
      row.className = "memRow";

      const thumb = document.createElement("div");
      thumb.className = "memThumb";
      const img = document.createElement("img");
      img.alt = it.name || it.id;
      thumb.appendChild(img);

      const meta = document.createElement("div");
      meta.innerHTML = `
        <div class="memName">${escapeHtml(it.name || it.id)}</div>
        <div class="memId">${escapeHtml(it.id)}</div>
      `;

      const coords = document.createElement("div");
      coords.className = "memCoords";
      coords.textContent = formatCoords(it.pos);

      row.appendChild(thumb);
      row.appendChild(meta);
      row.appendChild(coords);
      listEl.appendChild(row);

      // generate thumbnail from the actual object
      try {
        const url = await thumbGen.makeThumb(it.obj);
        img.src = url;
      } catch {
        // ignore
      }
    }
  }

  function open() {
    isOpen = true;
    overlay.classList.add("open");
  }
  function close() {
    isOpen = false;
    overlay.classList.remove("open");
  }
  function toggle() {
    if (isOpen) close();
    else open();
  }

  // ---------- hint logic ----------
  let hintHideTimer = null;
  function showHintFor10s() {
    hint.classList.add("show");
    if (hintHideTimer) clearTimeout(hintHideTimer);
    hintHideTimer = setTimeout(() => {
      hint.classList.remove("show");
      hintHideTimer = null;
    }, 10_000);
  }

    (function showHintAfterTitle() {
        let shown = false;
        const showOnce = async () => {
            if (shown) return;
            shown = true;

            // Wait for your promise, then wait until title is visually gone
            try { await Promise.resolve(titleFadeDonePromise); } catch {}
            await waitForTitleGone();

            // small buffer so it never overlaps the last frame of the title
            setTimeout(() => showHintFor10s(), 120);
        };

        showOnce();

        // hard fallback (in case the promise never resolves)
        setTimeout(() => {
            if (!shown) {
            shown = true;
            showHintFor10s();
            }
        }, 9000);
    })();

  // ---------- keybind ----------
  function onKeyDown(e) {
    const k = (e.key || "").toLowerCase();
    if (k === "t") {
      e.preventDefault();
      toggle();
    } else if (k === "escape" && isOpen) {
      e.preventDefault();
      close();
    }
  }
  window.addEventListener("keydown", onKeyDown);

  return {
    setItems,
    open,
    close,
    toggle,
    showHint: () => showHintFor10s(),
    hideHint: () => hint.classList.remove("show"),
    dispose: () => {
      window.removeEventListener("keydown", onKeyDown);
      if (hintHideTimer) clearTimeout(hintHideTimer);
      hint.remove();
      overlay.remove();
      style.remove();
      thumbGen.dispose();
    },
  };
}

// ---------- helpers ----------
function formatCoords(pos) {
  if (!pos) return "";
  const f = (n) => (Number.isFinite(n) ? n.toFixed(1) : "0.0");
  return `x ${f(pos.x)}\ny ${f(pos.y)}\nz ${f(pos.z)}`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- thumbnail renderer ----------
function createThumbGenerator({ THREE }) {
  const size = 128;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(size, size, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x111111, 1.1);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(2, 3, 4);
  scene.add(dir);

  const root = new THREE.Group();
  scene.add(root);

  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _center = new THREE.Vector3();

  async function makeThumb(obj) {
    while (root.children.length) root.remove(root.children[0]);
    if (!obj) throw new Error("No object for thumbnail");

    const clone = obj.clone(true);
    root.add(clone);

    clone.updateWorldMatrix(true, true);
    _box.setFromObject(clone);
    _box.getSize(_size);
    _box.getCenter(_center);

    const maxDim = Math.max(_size.x, _size.y, _size.z) || 1;
    const s = 1.0 / maxDim;

    clone.position.x -= _center.x;
    clone.position.y -= _center.y;
    clone.position.z -= _center.z;
    clone.scale.multiplyScalar(s);

    camera.position.set(0.0, 0.25, 2.2);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    renderer.clear();
    renderer.render(scene, camera);

    return renderer.domElement.toDataURL("image/png");
  }

  function dispose() {
    renderer.dispose();
  }

  return { makeThumb, dispose };
}
