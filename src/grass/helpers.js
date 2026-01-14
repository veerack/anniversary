// grass/helpers.js
import * as THREE from "three";

/**
 * Finite-difference terrain normal using the provided terrainHeight().
 * Returns a normalized world-space normal.
 */
export function terrainNormalFromHeightFn(terrainHeight, x, z, e = 0.25, out = new THREE.Vector3()) {
  const hL = terrainHeight(x - e, z);
  const hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e);
  const hU = terrainHeight(x, z + e);
  out.set(hL - hR, 2 * e, hD - hU).normalize();
  return out;
}
