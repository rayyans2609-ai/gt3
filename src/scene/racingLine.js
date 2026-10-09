/** Hidden authored GT line. Pure in route t, wrapped, reversible; never rendered. */
import * as THREE from 'three';
import { COMP, CAR_HALF_WIDTH_M, RACING_MARGIN_M } from './composition.js';
import { curve, TRACK_LENGTH, curvatureAt } from './trackCurve.js';
import { profileAt, CORNERS } from './trackProfile.js';

const N = 4096;
export const amplitudeM = COMP.racingLineM;
const lateralTable = new Float32Array(N + 1);
const pathCurvatureTable = new Float32Array(N + 1);
const wrap = t => ((t % 1) + 1) % 1;
const sample = (table, t) => {
  const x = wrap(t) * N, i = Math.floor(x), f = x - i;
  return table[i] * (1 - f) + table[i + 1] * f;
};
// Fractions of LOCAL usable half-width, not a global amplitude. First exits of
// linked corners stay on the side that prepares the next apex (chicane, slowdowns).
// The long acceleration straights have explicitly centred, flat intervals.
export const LINE_KNOTS = Object.freeze([
  [0, 0], [.015, 0], [.029, .45], [.056, -.72], [.086, .25],
  [.104, -.50], [.123, .50], [.137, .20], [.159, .76], [.181, .20],
  [.190, .50], [.219, -.85], [.246, .30], [.261, -.62], [.280, 'hairpin'], [.283, 'hairpin'], [.286, 'hairpin'],
  [.312, .20], [.320, .48], [.337, -.66], [.349, -.40], [.362, 'chicane-out'], [.365, 'chicane-out'], [.368, 'chicane-out'],
  [.394, -.55], [.402, .40], [.420, -.62], [.436, -.38], [.470, .82],
  [.508, -.55], [.535, 0], [.590, 0], [.616, .62], [.635, -.70],
  [.644, -.40], [.654, .83], [.680, -.55], [.695, -.30], [.709, -.62],
  [.729, .66], [.737, .40], [.748, -.84], [.780, .55], [.799, 0],
  [.812, -.45], [.835, .50], [.860, -.30], [.871, -.40], [.898, .55],
  [.928, -.45], [.939, -.45], [.952, .72], [.979, -.20], [.990, 0], [1, 0],
].map(Object.freeze));
function knotValue(t, value) {
  const p = profileAt(t);
  const contact = typeof value === 'string' ? CORNERS.find(c => c.id === value) : null;
  const side = contact?.side ?? Math.sign(value);
  const width = side >= 0 ? p.left : p.right;
  const usable = Math.max(0, width - CAR_HALF_WIDTH_M * COMP.hero - RACING_MARGIN_M - .45);
  if (contact) {
    // A nominal 1.8 m tyre footprint clips only this 1.8 m curb. The widest
    // mirror/body envelope can overhang the asphalt, but clears the curb exterior.
    return side * Math.min(width - .9 * COMP.hero + .06,
      width + (side > 0 ? p.curbLeft : p.curbRight) - CAR_HALF_WIDTH_M * COMP.hero - .25);
  }
  return Number(value) * usable * (COMP.racingLine || 0);
}
const knots = LINE_KNOTS.map(([t, value]) => ({ t, y: knotValue(t, value) }));
// Shape-preserving Hermite: slope zero at extrema, harmonic slope elsewhere.
// This avoids oscillating overshoot and retains flat straight intervals.
const slopes = knots.map((k, i) => {
  if (i === 0 || i === knots.length - 1) return 0;
  const a = (k.y - knots[i - 1].y) / (k.t - knots[i - 1].t);
  const b = (knots[i + 1].y - k.y) / (knots[i + 1].t - k.t);
  return a * b > 0 ? 2 * a * b / (a + b) : 0;
});
let segment = 0;
for (let i = 0; i < N; i++) {
  const t = i / N;
  while (segment + 1 < knots.length - 1 && t > knots[segment + 1].t) segment++;
  const a = knots[segment], b = knots[segment + 1], dt = b.t - a.t;
  const u = (t - a.t) / dt;
  lateralTable[i] = amplitudeM <= 0 ? 0 :
    (2 * u ** 3 - 3 * u ** 2 + 1) * a.y + (u ** 3 - 2 * u ** 2 + u) * dt * slopes[segment]
    + (-2 * u ** 3 + 3 * u ** 2) * b.y + (u ** 3 - u ** 2) * dt * slopes[segment + 1];
}
lateralTable[N] = lateralTable[0];

// The two contacts hold a short constant LOCAL edge-relative plateau, so the
// car follows the curb rather than arriving at it with a large lateral yaw.
// Whole-footprint clearance is verified by check-track-profile, including the
// road curvature under front/rear corners; a centre-offset clamp is insufficient.
const a = new THREE.Vector3(), b = new THREE.Vector3(), tan = new THREE.Vector3();
function raw(t, out) {
  const u = wrap(t);
  curve.getPointAt(u, out);
  curve.getTangentAt(u, tan);
  tan.set(tan.z, 0, -tan.x).normalize();
  return out.addScaledVector(tan, sample(lateralTable, u));
}
export function lateralAt(t) { return amplitudeM > 0 ? sample(lateralTable, t) : 0; }
export function pathPointAt(t, out = new THREE.Vector3()) {
  return amplitudeM > 0 ? raw(t, out) : curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1), out);
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
export function pathTangentAt(t, out = new THREE.Vector3()) {
  if (amplitudeM <= 0) return curve.getTangentAt(THREE.MathUtils.clamp(t, 0, 1), out).normalize();
  const h = .75 / TRACK_LENGTH;
  raw(t - h, _a); raw(t + h, _b);
  return out.subVectors(_b, _a).normalize();
}
/** Only the two selected apex windows can request tyre/curb support. */
export function curbUseAt(t) {
  const u = wrap(t);
  return amplitudeM > 0 ? Math.max(0, ...CORNERS.filter(c => c.contact).map(c => {
    const d = Math.abs(u - c.apex) * TRACK_LENGTH;
    return d < 60 ? Math.cos(Math.PI * d / 120) ** 4 : 0;
  })) : 0;
}
// Curvature uses the driven path, normalized against the same centreline peak.
const ds = TRACK_LENGTH / N;
let peak = 1e-8;
const path = Array.from({ length: N }, (_, i) => pathPointAt(i / N));
for (let i = 0; i < N; i++) {
  curve.getTangentAt(wrap((i - 1) / N), a).setY(0).normalize();
  curve.getTangentAt(wrap((i + 1) / N), b).setY(0).normalize();
  peak = Math.max(peak, Math.abs(Math.atan2(a.x * b.z - a.z * b.x, a.dot(b))) / (2 * ds));
}
for (let i = 0; i < N; i++) {
  a.subVectors(path[i], path[(i - 1 + N) % N]).setY(0);
  b.subVectors(path[(i + 1) % N], path[i]).setY(0);
  pathCurvatureTable[i] = Math.atan2(a.x * b.z - a.z * b.x, a.dot(b))
    / ((a.length() + b.length()) / 2) / peak;
}
pathCurvatureTable[N] = pathCurvatureTable[0];
export function pathCurvatureAt(t) { return amplitudeM > 0 ? sample(pathCurvatureTable, t) : curvatureAt(t); }
export const racingLineTables = { N, lateral: lateralTable, curvature: pathCurvatureTable };
