// dialogue.js
export function createDialogueSystem({
  avatarApi,
  typeSpeed = 28,        // chars per second
  idleDelay = 7.0,       // seconds
} = {}) {
  // ---- DOM ----
  const root = document.createElement("div");
  root.id = "dlgRoot";
  root.style.cssText = `
    position: fixed; left: 0; right: 0; bottom: 0;
    padding: 18px 22px 26px;
    display: none; z-index: 9999;
    pointer-events: none;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
  `;

  const box = document.createElement("div");
  box.style.cssText = `
    margin: 0 auto;
    width: min(980px, calc(100vw - 24px));
    background: rgba(10,12,18,0.72);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 16px;
    padding: 16px 18px 14px;
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.25);
  `;

  const text = document.createElement("div");
  text.style.cssText = `
    color: rgba(255,255,255,0.95);
    font-size: 18px;
    line-height: 1.35;
    min-height: 56px;
    white-space: pre-wrap;
  `;

  const hint = document.createElement("div");
  hint.style.cssText = `
    display:flex; justify-content:flex-end; align-items:center;
    margin-top: 10px;
    color: rgba(255,255,255,0.75);
    font-size: 14px;
    gap: 8px;
  `;
  hint.innerHTML = `<span style="opacity:.8">Enter</span><span style="opacity:.7">to continue</span>`;

  box.appendChild(text);
  box.appendChild(hint);
  root.appendChild(box);
  document.body.appendChild(root);

  // ---- state ----
  let active = false;
  let phrases = [];
  let idx = 0;

  let revealed = "";
  let full = "";
  let charAcc = 0;

  let waitingEnter = false;
  let idleTimer = 0;
  let idleThinkTimer = 0;

  let onDone = null;

  function show() { root.style.display = "block"; }
  function hide() { root.style.display = "none"; }

  function start(newPhrases, { onComplete } = {}) {
    active = true;
    phrases = newPhrases || [];
    idx = 0;
    onDone = onComplete || null;
    show();
    startPhrase();
  }

  function stop() {
    active = false;
    phrases = [];
    idx = 0;
    onDone = null;
    hide();
  }

  function startPhrase() {
    full = phrases[idx] ?? "";
    revealed = "";
    charAcc = 0;
    waitingEnter = false;
    idleTimer = 0;
    idleThinkTimer = 0;
    text.textContent = "";
  }

  function next() {
    if (!active) return;

    // if still typing → finish instantly
    if (!waitingEnter) {
      revealed = full;
      text.textContent = revealed;
      waitingEnter = true;
      idleTimer = 0;
      idleThinkTimer = 0;
      return;
    }

    idx++;
    if (idx >= phrases.length) {
      const cb = onDone;
      stop();
      cb?.();
      return;
    }

    startPhrase();
  }

  function update(dt) {
    if (!active) return;

    if (!waitingEnter) {
      // typewriter (chars per second)
      charAcc += dt * typeSpeed;
      const n = Math.floor(charAcc);
      if (n > 0) {
        charAcc -= n;
        revealed = full.slice(0, Math.min(full.length, revealed.length + n));
        text.textContent = revealed;
        if (revealed.length >= full.length) {
          waitingEnter = true;
          idleTimer = 0;
          idleThinkTimer = 0;
        }
      }
      return;
    }

    // idle thinking loop
    idleTimer += dt;
    if (idleTimer >= idleDelay) {
      idleTimer = 0;
      // play thinking every 7s until user presses Enter
      avatarApi?.playFbx?.("Thinking") ?? avatarApi?.play?.("Thinking");
      idleThinkTimer = 0;
    }
  }

  function onKeyDown(e) {
    if (!active) return;
    if (e.key !== "Enter") return;

    e.preventDefault();
    // if waiting, go next. if typing, finish.
    next();
  }
  window.addEventListener("keydown", onKeyDown, { passive: false });

  return {
    start,
    stop,
    update,
    isActive: () => active,
    next,
  };
}
