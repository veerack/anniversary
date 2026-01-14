import * as THREE from "three";

function makeShaderSky({ sunDir }) {
  const geo = new THREE.SphereGeometry(500, 48, 24);
  geo.scale(-1, 1, 1);

  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone().normalize() },
      uTop: { value: new THREE.Color(0x6fb6ff) },
      uHorizon: { value: new THREE.Color(0xe9f6ff) },
      uGround: { value: new THREE.Color(0xbad8ff) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vPos;

      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uGround;

      float hash(vec2 p){
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
      }
      float fbm(vec2 p){
        float v = 0.0;
        float a = 0.5;
        for(int i=0;i<5;i++){
          v += a * noise(p);
          p *= 2.02;
          a *= 0.5;
        }
        return v;
      }

      void main(){
        vec3 dir = normalize(vPos);

        float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uGround, uHorizon, smoothstep(0.02, 0.35, up));
        col = mix(col, uTop, smoothstep(0.35, 1.0, up));

        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        float sunCore = pow(sunDot, 900.0);
        float sunHalo = pow(sunDot, 18.0) * 0.55;
        col += vec3(1.0, 0.95, 0.75) * (sunCore * 2.5 + sunHalo);

        float haze = exp(-abs(dir.y) * 8.0);
        col = mix(col, uHorizon, haze * 0.35);

        vec2 uv = normalize(dir.xz) * (1.0 / max(0.12, dir.y + 0.35));
        float t = uTime * 0.015;

        float c1 = fbm(uv * 1.6 + vec2(t, -t));
        float c2 = fbm(uv * 3.1 + vec2(-t*1.3, t*0.8));

        float clouds = smoothstep(0.58, 0.82, c1) * 0.65 + smoothstep(0.62, 0.86, c2) * 0.45;

        float cloudMask = smoothstep(-0.05, 0.25, dir.y);
        clouds *= cloudMask;

        float light = 0.55 + 0.45 * pow(sunDot, 2.2);
        vec3 cloudCol = mix(vec3(0.95), vec3(1.0, 0.98, 0.92), 0.35) * light;

        col = mix(col, cloudCol, clamp(clouds, 0.0, 0.15)); // subtle background
        col = pow(col, vec3(0.95));

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  const skyMesh = new THREE.Mesh(geo, mat);
  skyMesh.renderOrder = -1000;
  return { skyMesh, mat };
}

function makeSunTexture(size=256){
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");

  const grd = g.createRadialGradient(size*0.5, size*0.5, 0, size*0.5, size*0.5, size*0.5);
  grd.addColorStop(0.00, "rgba(255,255,255,1.0)");
  grd.addColorStop(0.15, "rgba(255,250,220,0.95)");
  grd.addColorStop(0.35, "rgba(255,235,170,0.55)");
  grd.addColorStop(0.70, "rgba(255,220,120,0.18)");
  grd.addColorStop(1.00, "rgba(255,220,120,0.0)");

  g.fillStyle = grd;
  g.fillRect(0,0,size,size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSunraysMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0.65 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uStrength;

      float hash(float n){ return fract(sin(n)*43758.5453); }

      void main(){
        vec2 uv = vUv * 2.0 - 1.0;
        float r = length(uv);
        if (r > 1.0) discard;

        float a = atan(uv.y, uv.x);

        float rays = 0.0;
        float t = uTime * 0.35;
        for (int i=0; i<10; i++){
          float fi = float(i);
          float freq = 6.0 + fi * 2.0;
          float ph = hash(fi + 1.7) * 6.28318;
          rays += smoothstep(0.75, 1.0, sin(a * freq + t + ph)) * (0.10 + 0.06 * fi);
        }

        float core = exp(-r * 4.5);
        float fall = pow(1.0 - r, 1.8);

        float alpha = (core * 0.85 + rays * 0.12) * fall * uStrength;

        vec3 col = vec3(1.0, 0.95, 0.80) * alpha;
        gl_FragColor = vec4(col, alpha);
      }
    `
  });
}

export function setupSkyAndSun({ scene, skyConfig }) {
  const sunDir = skyConfig.SUN_DIR.clone().normalize();
  const sunWorldPos = sunDir.clone().multiplyScalar(skyConfig.SUN_RADIUS);

  const shaderSky = makeShaderSky({ sunDir });
  scene.add(shaderSky.skyMesh);

  const sunTex = makeSunTexture(256);

  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sunTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      opacity: 0.95
    })
  );
  sunSprite.scale.set(38, 38, 1);
  sunSprite.renderOrder = 9999;
  sunSprite.position.copy(sunWorldPos);
  scene.add(sunSprite);

  const sunRays = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    makeSunraysMaterial()
  );
  sunRays.renderOrder = 9998;
  scene.add(sunRays);

  function update(camera, time) {
    shaderSky.mat.uniforms.uTime.value = time;

    // Rays: anchored, billboard to camera, scale by distance
    sunRays.position.copy(sunWorldPos);
    sunRays.lookAt(camera.position);
    const d = camera.position.distanceTo(sunWorldPos);
    const s = (d * 0.35) / 90;
    sunRays.scale.set(s, s, s);
    sunRays.material.uniforms.uTime.value = time;

    // Sun disc: anchored, billboard, optional scale by distance
    sunSprite.position.copy(sunWorldPos);
    sunSprite.lookAt(camera.position);
    const sunScale = (d * 0.12) / 38;
    sunSprite.scale.setScalar(38 * sunScale);
  }

  return { sunDir, sunWorldPos, sunTex, shaderSky, sunSprite, sunRays, update };
}
