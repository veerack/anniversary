// interactions.js
import * as THREE from "three";

export function createInteractionSystem({ interactHintEl, interactHintTextEl }) {
  const entries = [];
  let current = null;

  const _objW = new THREE.Vector3();

  function add(entry) {
    if (entry.id) {
      const existing = entries.find(e => e.id === entry.id);
      if (existing) entries[entries.indexOf(existing)] = entry;
      else entries.push(entry);
    } else {
      entries.push(entry);
    }
    return () => {
      const i = entries.indexOf(entry);
      if (i >= 0) entries.splice(i, 1);
      if (current === entry) {
        current = null;
        hideHint();
      }
    };
  }

  function hideHint() { if (interactHintEl) interactHintEl.style.opacity = "0"; }
  function showHint(text) {
    if (interactHintTextEl) interactHintTextEl.textContent = text ?? "";
    if (interactHintEl) interactHintEl.style.opacity = "1";
  }

  function getEntryWorldPos(e, out) {
    // 1) explicit world anchor takes precedence
    if (e.anchorPos) {
      out.copy(e.anchorPos);
      return out;
    }
    // 2) object world position (not local)
    e.obj.updateWorldMatrix(true, false);
    return e.obj.getWorldPosition(out);
  }

  function update(playerWorldPos) {
    let best = null;
    let bestScore = Infinity;

    for (const e of entries) {
      if (e.enabled && !e.enabled()) continue;
      if (!e.obj && !e.anchorPos) continue;

      const r = (typeof e.radius === "function") ? e.radius() : (e.radius ?? 2.0);
      const r2 = r * r;

      const p = getEntryWorldPos(e, _objW);

      // ✅ XZ-only distance (ignore Y completely)
      const dx = playerWorldPos.x - p.x;
      const dz = playerWorldPos.z - p.z;
      const d2 = dx * dx + dz * dz;

      if (d2 > r2) continue;

      const pr = (typeof e.priority === "function") ? e.priority() : (e.priority ?? 0);
      const score = d2 - pr * 1e12;

      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }

    current = best;
    if (!current) hideHint();
    else showHint(current.getText());
  }

  function interact() {
    if (!current) return;
    if (current.enabled && !current.enabled()) return;
    current.onInteract();
  }

  return { add, update, interact, getCurrent: () => current, clear: () => { entries.length = 0; current = null; hideHint(); } };
}
