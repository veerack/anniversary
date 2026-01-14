// extra/audio.js — global audio registry

const registry = new Set();

/** Register an HTMLAudioElement so stopAllAudio() can stop it later. */
export function registerAudio(a) {
  if (!a) return a;
  registry.add(a);

  // cleanup when it ends (optional but nice)
  a.addEventListener?.("ended", () => registry.delete(a), { once: true });
  return a;
}

/** Stop + rewind all registered audios. */
export function stopAllAudio() {
  for (const a of registry) {
    try { a.pause(); } catch {}
    try { a.currentTime = 0; } catch {}
  }
}

export function playSfx(url, volume = 0.65) {
  const a = registerAudio(document.createElement("audio"));
  a.src = url;
  a.volume = volume;
  a.preload = "auto";
  a.style.display = "none";
  document.body.appendChild(a);

  a.play().catch(() => {});

  a.addEventListener("ended", () => {
    a.remove();
  });
}

export function setupAudio() {
  let audioCtx = null;
  let master = null;
  let windGain = null;
  const danceTracks = {
    Samba: new Audio("assets/mp3s/samba.mp3"),
    Rumba: new Audio("assets/mp3s/rumba.mp3"),
    Salsa: new Audio("assets/mp3s/salsa.mp3"),
  };

  for (const a of Object.values(danceTracks)) {
    a.preload = "auto";
    a.loop = false;
  }

  let currentDanceAudio = null;

  function stopDance() {
    if (!currentDanceAudio) return;
    currentDanceAudio.pause();
    currentDanceAudio.currentTime = 0;
    currentDanceAudio = null;
  }

  function playDance(name, onEnded) {
    stopDance();

    const a = danceTracks[name];
    if (!a) return;

    currentDanceAudio = a;
    a.currentTime = 0;

    a.onended = () => {
      // mark it stopped first so stopDance() is safe if called again
      currentDanceAudio = null;
      onEnded?.();
    };

    a.play().catch(() => {});
  }

  function ensureAudio(){
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    master = audioCtx.createGain();
    master.gain.value = 0.9;
    master.connect(audioCtx.destination);

    const bufferSize = (audioCtx.sampleRate * 2) | 0;
    const noiseBuf = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i=0;i<bufferSize;i++){
      data[i] = (Math.random()*2-1) * 0.45;
    }

    const windSrc = audioCtx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;

    const bp = audioCtx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 380;
    bp.Q.value = 0.8;

    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;

    windGain = audioCtx.createGain();
    windGain.gain.value = 0.06;

    windSrc.connect(bp);
    bp.connect(lp);
    lp.connect(windGain);
    windGain.connect(master);
    windSrc.start();
  }

  function setWindStrength(v){
    if (!windGain || !audioCtx) return;
    const t = audioCtx.currentTime;
    const target = 0.03 + 0.12 * v;
    windGain.gain.cancelScheduledValues(t);
    windGain.gain.setTargetAtTime(target, t, 0.12);
  }

  function playFootstep(strength=1){
    if (!audioCtx) return;
    const t = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08 * strength, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    const nSize = (audioCtx.sampleRate * 0.12)|0;
    const nb = audioCtx.createBuffer(1, nSize, audioCtx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i=0;i<nSize;i++){
      nd[i] = (Math.random()*2-1) * (1 - i/nSize);
    }
    const ns = audioCtx.createBufferSource();
    ns.buffer = nb;

    const hp = audioCtx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 700;

    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.05 * strength, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

    osc.connect(g); g.connect(master);
    ns.connect(hp); hp.connect(ng); ng.connect(master);

    osc.start(t); osc.stop(t + 0.14);
    ns.start(t);  ns.stop(t + 0.12);
  }

  // resume on first interaction
  window.addEventListener("pointerdown", async () => {
    ensureAudio();
    if (audioCtx && audioCtx.state !== "running") await audioCtx.resume();
  }, { once: true });

  return { ensureAudio, setWindStrength, playFootstep, playDance, stopDance, playSfx };
}
