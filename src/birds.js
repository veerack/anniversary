import * as THREE from "three";

export function setupBirds(scene, count = 22) {
  const g = new THREE.BufferGeometry();
  const verts = [];
  verts.push(-0.35,0,0, 0,0.12,0,  0,0.12,0, 0.35,0,0);
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));

  const mat = new THREE.LineBasicMaterial({ color: 0x1b1e2a, transparent:true, opacity:0.6 });

  const birds = [];
  for (let i=0;i<count;i++){
    const b = new THREE.LineSegments(g, mat);
    b.userData = {
      base: new THREE.Vector3((Math.random()-0.5)*120, 18+Math.random()*18, (Math.random()-0.5)*120),
      spd: 0.8 + Math.random()*1.4,
      ph: Math.random()*10.0
    };
    b.scale.setScalar(2.4 + Math.random()*2.6);
    scene.add(b);
    birds.push(b);
  }

  function update(t){
    for (const b of birds){
      const u = b.userData;
      const r = 35 + 20*Math.sin(t*0.08 + u.ph);
      b.position.x = u.base.x + Math.cos(t*0.18*u.spd + u.ph) * r;
      b.position.z = u.base.z + Math.sin(t*0.18*u.spd + u.ph) * r;
      b.position.y = u.base.y + Math.sin(t*1.9 + u.ph) * 0.6;

      b.rotation.y = Math.atan2(
        Math.cos(t*0.18*u.spd + u.ph),
        -Math.sin(t*0.18*u.spd + u.ph)
      );

      const flap = 0.75 + 0.25*Math.sin(t*7.0 + u.ph);
      b.scale.y = flap;
    }
  }

  return { birds, update };
}
