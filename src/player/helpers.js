// player/helpers.js — ground sampling (terrain + walkables), unchanged behavior
import * as THREE from "three";
import { terrainHeight } from "../terrain/terrain.js";

export function createGroundSampler({ walkables = [] } = {}) {
  const _ray = new THREE.Raycaster();
  const _rayOrigin = new THREE.Vector3();
  const _rayDir = new THREE.Vector3(0, -1, 0);
  const _hits = [];

  function sampleGroundY(x, z) {
    let y = terrainHeight(x, z);

    // Cast from above the player downwards
    _rayOrigin.set(x, y + 50, z);
    _ray.set(_rayOrigin, _rayDir);
    _ray.far = 120;

    for (const w of walkables) {
      if (!w?.meshes?.length) continue;

      _hits.length = 0;
      _ray.intersectObjects(w.meshes, true, _hits);
      if (_hits.length) {
        // closest hit is first
        y = Math.max(y, _hits[0].point.y);
      }
    }

    return y;
  }

  return { sampleGroundY };
}
