/** Pure departure from the grid into the retained authored racing line. */
import * as THREE from 'three';
import { routeTAt, GRID_LATERAL, TOUR_LENGTH, offsetPointAt } from './trackCurve.js';
import { pathPointAt } from './racingLine.js';
const departure = new THREE.Vector3();
const a = new THREE.Vector3(), b = new THREE.Vector3();
export function tourPathPointAt(p, out = new THREE.Vector3()) {
  const t = routeTAt(p);
  pathPointAt(t, out);
  const u = Math.min(1, Math.max(0, p * TOUR_LENGTH / 90));
  if (u < 1) {
    const blend = u ** 3 * (10 + u * (-15 + 6 * u));
    offsetPointAt(t, GRID_LATERAL, 0, departure);
    out.lerp(departure, 1 - blend);
  }
  return out;
}
export function tourPathTangentAt(p, out = new THREE.Vector3()) {
  const h = .75 / TOUR_LENGTH;
  // Sample across the wrapped finish, never clamp the geometry at the seam.
  tourPathPointAt(p - h, a); tourPathPointAt(p + h, b);
  return out.subVectors(b, a).normalize();
}
