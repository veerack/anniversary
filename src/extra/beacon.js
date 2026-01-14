import * as THREE from "three";

export function createBeacon(scene, {
  height = 220,
  radius = 2.2,
  color = new THREE.Color(0xffd97a),
} = {}) {
  const group = new THREE.Group();
  group.name = "__BEACON__";

  // Vertical column (GPU cheap)
  const geom = new THREE.CylinderGeometry(radius, radius, height, 16, 1, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: color },
      uTime: { value: 0 },
      uHeight: { value: height },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uHeight;
      varying vec3 vPos;

      // cheap hash-ish noise
      float n1(float x){ return fract(sin(x)*43758.5453); }

      void main() {
        float y01 = (vPos.y / uHeight) + 0.5;          // 0..1 along height
        float centerFade = 1.0 - smoothstep(0.88, 1.0, abs(vPos.x)*0.0 + abs(vPos.z)*0.0);

        // stronger near bottom, fade to top
        float base = smoothstep(0.0, 0.12, y01) * (1.0 - smoothstep(0.72, 1.0, y01));

        // moving bands (subtle)
        float bands = 0.65 + 0.35*sin((y01*18.0) - uTime*1.2);
        float shimmer = 0.75 + 0.25*(n1(y01*120.0 + uTime*0.7));

        float a = base * bands * shimmer;

        // soft edge fade (since it's a cylinder wall, this still helps)
        a *= 0.85;

        // clamp alpha so it doesn’t blow HDR too hard
        a = min(a, 0.85);

        gl_FragColor = vec4(uColor, a);
      }
    `,
  });

  const column = new THREE.Mesh(geom, mat);
  column.renderOrder = 999; // draw late
  group.add(column);

  // Optional ground ring (close-range precision cue)
  const ringGeom = new THREE.RingGeometry(2.5, 4.6, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfff3c4,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 998;
  group.add(ring);

  scene.add(group);

  function setPosition(x, y, z) {
    group.position.set(x, y, z);
    // column centered; lift half height so it starts from ground
    column.position.y = height * 0.5;
    ring.position.y = 0.06;
  }

  function setEnabled(v) {
    group.visible = !!v;
  }

  function update(dt, camera) {
    mat.uniforms.uTime.value += dt;

    // subtle pulse
    const pulse = 0.85 + 0.15 * Math.sin(mat.uniforms.uTime.value * 0.9);
    ring.material.opacity = 0.30 + 0.30 * pulse;
    ring.rotation.z += dt * 0.35;

    // distance-based scaling so it stays visible far away
    if (camera) {
      const d = group.position.distanceTo(camera.position);
      const s = THREE.MathUtils.clamp(d / 140, 1.0, 2.8);
      column.scale.set(s, 1, s);
      ring.scale.setScalar(THREE.MathUtils.clamp(1.0 + d / 280, 1.0, 2.0));
    }
  }

  return { group, setPosition, setEnabled, update };
}