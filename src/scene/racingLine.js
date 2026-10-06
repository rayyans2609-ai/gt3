/**
 * Hidden authored racing line (W2 candidates b/c; SPEC §15 "Hero-car path").
 * Never rendered. A precomputed, wrapped lateral table derived from circuit geometry:
 * a difference of Gaussians of the (soft-thresholded) curvature puts the car outside
 * before entry, inside at the apex and outside again on exit, smoothly (C∞), and
 * almost nothing on straights and gentle bends. Deterministic in t (reversible).
 * With amplitude 0 every function here is exactly the centreline.
 */
import * as THREE from 'three';
import { COMP } from './composition.js';
import { curve, TRACK_LENGTH, curvatureAt } from './trackCurve.js';

const N = 2048;
const ds = TRACK_LENGTH / N;
const SIGMA_APEX_M = 55;     // corner-scale smoothing: where the apex sits
const SIGMA_WIDE_M = 140;    // wider smoothing: approach/exit outside lobes
const GENTLE_KAPPA = 1 / 500; // below this radius-equivalent nothing happens
const FULL_KAPPA = 1 / 120;   // at/above this a corner gets the full treatment

export const amplitudeM = COMP.racingLineM;
const lateralTable = new Float32Array(N + 1);  // offsetPointAt convention (+ = left)
const pathCurvatureTable = new Float32Array(N + 1); // normalised like curvatureAt

const wrap = t => ((t % 1) + 1) % 1;
const sample = (table, t) => {
  const x = wrap(t) * N;
  const i = Math.floor(x);
  const f = x - i;
  return table[i] * (1 - f) + table[i + 1] * f;
};

function gaussian(signal, sigmaM) {
  const s = sigmaM / ds;
  const radius = Math.ceil(3 * s);
  const weights = [];
  let sum = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-0.5 * (k / s) ** 2);
    weights.push(w); sum += w;
  }
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let v = 0;
    for (let k = -radius; k <= radius; k++) v += signal[((i + k) % N + N) % N] * weights[k + radius];
    out[i] = v / sum;
  }
  return out;
}

const points = Array.from({ length: N }, (_, i) => curve.getPointAt(i / N, new THREE.Vector3()));
const lefts = points.map((p, i) => {
  const next = points[(i + 1) % N];
  const prev = points[(i - 1 + N) % N];
  const tangent = next.clone().sub(prev).setY(0).normalize();
  // offsetPointAt's +lateral side: -(tangent × up).
  return new THREE.Vector3(tangent.z, 0, -tangent.x);
});

// Signed curvature (1/m, + = right turn) from heading change, lightly smoothed.
const kappa = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const a = points[i].clone().sub(points[(i - 1 + N) % N]).setY(0).normalize();
  const b = points[(i + 1) % N].clone().sub(points[i]).setY(0).normalize();
  const cross = a.x * b.z - a.z * b.x; // > 0 for a right turn in this world
  kappa[i] = Math.atan2(cross, a.dot(b)) / ds;
}
const kappaSmooth = gaussian(kappa, 12);
let kappaPeak = 1e-6;
for (const k of kappaSmooth) kappaPeak = Math.max(kappaPeak, Math.abs(k));

if (amplitudeM > 0) {
  const weighted = kappaSmooth.map(k =>
    k * THREE.MathUtils.smoothstep(Math.abs(k), GENTLE_KAPPA, FULL_KAPPA));
  const apex = gaussian(weighted, SIGMA_APEX_M);
  const wide = gaussian(weighted, SIGMA_WIDE_M);
  const dog = apex.map((v, i) => v - wide[i]);
  let peak = 1e-9;
  for (const v of dog) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < N; i++) {
    // + dog = toward the inside of a right turn = right = negative offset lateral.
    // tanh keeps the clamp soft so the line never visibly flattens against a wall.
    lateralTable[i] = -amplitudeM * Math.tanh(1.25 * dog[i] / peak) / Math.tanh(1.25);
    for (const corner of COMP.curbCorners || []) {
      const w = curbWeight(i / N, corner);
      // Only the selected apex may use the curb. The existing geometry-led
      // outside/inside/outside lobes remain everywhere else.
      lateralTable[i] += w * (corner.side * COMP.curbLateralM - lateralTable[i]);
    }
  }
}
lateralTable[N] = lateralTable[0];

/** Compact C3 apex window; no nonzero tails on straights. */
export function curbWeight(t, corner) {
  const distanceM = Math.abs(((t - corner.t + 1.5) % 1) - 0.5) * TRACK_LENGTH;
  return distanceM < corner.radiusM ? Math.cos(Math.PI * distanceM / (2 * corner.radiusM)) ** 4 : 0;
}

export function curbUseAt(t) {
  return Math.max(0, ...(COMP.curbCorners || []).map(c => curbWeight(t, c)));
}

// Path curvature, normalised by the centreline peak so roll matches today's scale.
{
  const path = points.map((p, i) => p.clone().addScaledVector(lefts[i], lateralTable[i]));
  for (let i = 0; i < N; i++) {
    const p0 = path[(i - 1 + N) % N], p1 = path[i], p2 = path[(i + 1) % N];
    const a = p1.clone().sub(p0).setY(0);
    const b = p2.clone().sub(p1).setY(0);
    const angle = Math.atan2(a.x * b.z - a.z * b.x, a.dot(b));
    pathCurvatureTable[i] = angle / ((a.length() + b.length()) * 0.5) / kappaPeak;
  }
  pathCurvatureTable[N] = pathCurvatureTable[0];
}

/** Lateral offset (offsetPointAt convention) at t. */
export function lateralAt(t) {
  return amplitudeM > 0 ? sample(lateralTable, t) : 0;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _left = new THREE.Vector3();

function rawPathPoint(t, out) {
  const u = wrap(t);
  curve.getPointAt(u, out);
  if (amplitudeM <= 0) return out;
  const lateral = sample(lateralTable, u);
  curve.getTangentAt(u, _left);
  _left.set(_left.z, 0, -_left.x).normalize();
  return out.addScaledVector(_left, lateral);
}

/** Car position at t (centreline when there is no racing line). */
export function pathPointAt(t, out = new THREE.Vector3()) {
  if (amplitudeM <= 0) return curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1), out);
  return rawPathPoint(t, out);
}

/** Unit tangent of the offset path itself, so the car never crabs. */
export function pathTangentAt(t, out = new THREE.Vector3()) {
  if (amplitudeM <= 0) return curve.getTangentAt(THREE.MathUtils.clamp(t, 0, 1), out).normalize();
  const h = 0.75 / TRACK_LENGTH;
  rawPathPoint(t - h, _a);
  rawPathPoint(t + h, _b);
  return out.subVectors(_b, _a).normalize();
}

/** Normalised signed curvature of the driven path (today's curvatureAt when centred). */
export function pathCurvatureAt(t) {
  return amplitudeM > 0 ? sample(pathCurvatureTable, t) : curvatureAt(t);
}

export const racingLineTables = { N, lateral: lateralTable, curvature: pathCurvatureTable };
