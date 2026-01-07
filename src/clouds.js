import * as THREE from "three";

function makeAnimeCloudTexture(size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");

  g.clearRect(0, 0, size, size);

  for (let k = 0; k < 28; k++) {
    const x = (0.15 + Math.random() * 0.7) * size;
    const y = (0.25 + Math.random() * 0.55) * size;
    const r = (0.10 + Math.random() * 0.22) * size;

    const grad = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    grad.addColorStop(0.00, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.70)");
    grad.addColorStop(1.00, "rgba(255,255,255,0.0)");

    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  g.globalCompositeOperation = "source-atop";
  const band = g.createLinearGradient(0, size * 0.55, 0, size);
  band.addColorStop(0.0, "rgba(210,225,255,0.00)");
  band.addColorStop(0.6, "rgba(170,195,240,0.18)");
  band.addColorStop(1.0, "rgba(130,160,220,0.00)");
  g.fillStyle = band;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function setupClouds(scene, count = 14) {
  const animeCloudTex = makeAnimeCloudTexture(512);
  const baseMat = new THREE.MeshBasicMaterial({
    map: animeCloudTex,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    opacity: 0.95,
  });
  baseMat.fog = false;

  const group = new THREE.Group();
  scene.add(group);

  const geo = new THREE.PlaneGeometry(22, 12);
  for (let i = 0; i < count; i++) {
    const m = baseMat.clone();
    const p = new THREE.Mesh(geo, m);
    p.renderOrder = -900;
    p.position.set((Math.random() - 0.5) * 180, 22 + Math.random() * 18, (Math.random() - 0.5) * 180);
    p.rotation.y = Math.random() * Math.PI * 2;

    const s = 0.9 + Math.random() * 2.0;
    p.scale.set(s, s, s);

    p.userData.drift = new THREE.Vector3(0.4 + Math.random() * 0.8, 0, 0.15 + Math.random() * 0.35);
    p.userData.spin = (Math.random() - 0.5) * 0.04;

    group.add(p);
  }

  function update(dt) {
    for (const p of group.children) {
      p.position.addScaledVector(p.userData.drift, dt);
      p.rotation.y += p.userData.spin * dt;

      if (p.position.x > 120) p.position.x = -120;
      if (p.position.x < -120) p.position.x = 120;
      if (p.position.z > 120) p.position.z = -120;
      if (p.position.z < -120) p.position.z = 120;
    }
  }

  return { group, update };
}
