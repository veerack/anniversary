import * as THREE from "three";

export function setupMemories(scene, memories, {
  onOpenMemory,
} = {}) {
  const spots = [];
  const spotGeo = new THREE.TorusGeometry(1.0, 0.12, 16, 50);

  const glowBase = new THREE.MeshStandardMaterial({
    color: 0x7da6ff,
    emissive: 0x3b66ff,
    emissiveIntensity: 1.6,
    roughness: 0.25,
    metalness: 0.0,
    envMapIntensity: 0.0
  });

  for (const mem of memories) {
    const ring = new THREE.Mesh(spotGeo, glowBase.clone());
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(mem.pos);
    ring.position.y = 0.12;
    ring.receiveShadow = true;
    ring.castShadow = false;
    scene.add(ring);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 18, 18),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x7da6ff,
        emissiveIntensity: 1.0,
        roughness: 0.2,
        metalness: 0.0,
        envMapIntensity: 0.0
      })
    );
    marker.position.copy(mem.pos);
    marker.position.y = 1.35;
    marker.castShadow = true;
    scene.add(marker);

    spots.push({ mem, ring, marker });
  }

  let activeSpotId = null;

  function setActive(mem) {
    if (activeSpotId === mem.id) return;
    activeSpotId = mem.id;
    onOpenMemory?.(mem);
  }

  function update(time) {
    for (const s of spots) {
      s.ring.rotation.z = time * 0.7;
      s.marker.position.y = 1.35 + Math.sin(time * 2.2 + s.mem.pos.x) * 0.08;
    }
  }

  function checkTriggers(playerPos, { interactHintEl }) {
    let closest = null;
    let closestDist = Infinity;

    for (const s of spots) {
      const d = playerPos.distanceTo(s.mem.pos);
      if (d < closestDist) { closestDist = d; closest = s; }
    }

    if (interactHintEl) {
      interactHintEl.style.opacity = (closest && closestDist <= 2.4) ? "1" : "0";
    }

    if (closest && closestDist <= 2.1) setActive(closest.mem);
  }

  function clearActive() {
    activeSpotId = null;
  }

  return { spots, update, checkTriggers, clearActive };
}

export function setupMemoryPanelUI() {
  const panel = document.getElementById("panel");
  const panelTitle = document.getElementById("panelTitle");
  const panelText = document.getElementById("panelText");
  const closeBtn = document.getElementById("closeBtn");

  function open(mem) {
    panelTitle.textContent = mem.title;
    panelText.textContent = mem.text;
    panel.style.display = "block";
  }

  function close() {
    panel.style.display = "none";
  }

  closeBtn.onclick = close;

  return { open, close, panelEl: panel };
}
