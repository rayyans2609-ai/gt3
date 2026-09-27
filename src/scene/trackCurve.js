/**
 * trackCurve.js — the route. (SPEC §4, §6)
 *
 * OWNED BY THE MANAGER. This is the geometric contract every other scene module
 * builds against: the asphalt ribbon, the curbs, the coins, the environment
 * dressing, the car rig and the finish gate all read from here.
 *
 * The route is not authored as raw XYZ points — hand-placed points make it far too
 * easy to produce kinks, self-intersections and corners that are subtly wrong. It is
 * authored as a driver would describe a lap: a sequence of segments, each with a
 * length, a turn angle and an elevation change. Heading is integrated along the
 * sequence to produce the control points, which guarantees C1-smooth transitions and
 * makes the route trivially tunable — change a turn from 55 to 70 degrees and
 * everything downstream (curbs, coins, dressing) follows.
 *
 * World convention: Y is up. The route starts at the origin heading -Z.
 * One world unit ~= one metre. A GT3 car is ~4.6 units long.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Track dimensions
// ---------------------------------------------------------------------------
export const TRACK = {
  halfWidth: 7.0,        // asphalt is 14 units wide — two GT3s abreast, comfortably
  curbWidth: 1.15,       // red/white rumble strip, thin by default
  curbWidthWide: 2.6,    // thickened block through corners and accent points
  shoulderWidth: 3.0,    // dark run-off between curb and grass
};

/**
 * The route, as a driver would call it.
 *   len   — segment length in world units
 *   turn  — total heading change over the segment, degrees. +right, -left.
 *   rise  — elevation change over the segment, world units. Gentle throughout.
 *   note  — for readability only.
 */
const ROUTE = [
  { len: 150, turn:    0, rise:   0, note: 'start / finish straight' },
  { len: 210, turn:   55, rise:   3, note: 'turn 1 — long right sweep' },
  { len:  65, turn:    0, rise:   2, note: 'short chute' },
  { len: 165, turn:  -42, rise:   2, note: 'turn 2 — left' },
  { len: 175, turn:  -66, rise:   0, note: 'turn 3 — tightening left' },
  { len:  75, turn:    0, rise:   5, note: 'uphill chute' },
  { len: 205, turn:   92, rise:   3, note: 'turn 4 — the big right-hander' },
  { len:  95, turn:    0, rise:  -2, note: 'back chute' },
  { len: 172, turn: -112, rise:  -4, note: 'turn 5 — hairpin left' },
  { len:  65, turn:    0, rise:  -5, note: 'downhill run' },
  { len: 140, turn:   46, rise:  -2, note: 'turn 6 — chicane in' },
  { len: 140, turn:  -46, rise:   0, note: 'turn 7 — chicane out' },
  { len:  80, turn:    0, rise:   2, note: 'short exit chute' },
  { len: 150, turn:   50, rise:   4, note: 'turn 8 — fast right' },
  { len: 280, turn: -160, rise:   3, note: 'turn 9 — sweeping left return' },
  { len: 170, turn:    0, rise:   4, note: 'crest' },
  { len: 1405.282, turn:    0, rise:  -8, note: 'back straight' },
  { len: 767.018, turn: -190, rise:  -5, note: 'turn 10 — left onto the run-in' },
  { len:  40, turn:   13, rise:  -1, note: 'final kink right' },
  { len: 100, turn:    0, rise:  -1, note: 'run to the flag' },
];

// Points are emitted this often along each segment. Dense enough that the Catmull-Rom
// hugs the intended arc, sparse enough that the curve stays smooth rather than lumpy.
const POINT_SPACING = 34;

function buildControlPoints() {
  const pts = [];
  let x = 0;
  let z = 0;
  let y = 0;
  let heading = 0; // radians, 0 = facing -Z

  pts.push(new THREE.Vector3(x, y, z));

  for (const seg of ROUTE) {
    const steps = Math.max(2, Math.round(seg.len / POINT_SPACING));
    const dLen = seg.len / steps;
    const dTurn = THREE.MathUtils.degToRad(seg.turn) / steps;
    const dRise = seg.rise / steps;

    for (let i = 0; i < steps; i++) {
      // Turn half a step, advance, turn the other half — a midpoint integration that
      // keeps the arc centred on the intended radius instead of cutting inside it.
      heading += dTurn * 0.5;
      x += Math.sin(heading) * dLen;
      z -= Math.cos(heading) * dLen;
      heading += dTurn * 0.5;
      y += dRise;
      pts.push(new THREE.Vector3(x, y, z));
    }
  }
  // The final integration step returns to the origin. A closed Catmull-Rom curve
  // owns the final span, so retaining that duplicate point would make a cusp.
  pts.pop();
  return pts;
}

export const controlPoints = buildControlPoints();

/** One lap; t=0 and t=1 are the same point on the start/finish straight. */
export const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.5);

/** Total arc length in world units, used for the HUD distance readout. */
export const TRACK_LENGTH = curve.getLength();

// ---------------------------------------------------------------------------
// Curvature — sampled once, read every frame.
// ---------------------------------------------------------------------------
// Drives: camera corner-lean (§5), car body roll (§7), and where the curbs thicken
// into blocks (§6). Signed: positive = turning right, negative = turning left.

const CURVATURE_SAMPLES = 800;
const curvatureTable = new Float32Array(CURVATURE_SAMPLES + 1);

(function buildCurvatureTable() {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const cross = new THREE.Vector3();
  const eps = 1 / CURVATURE_SAMPLES;
  let peak = 1e-6;

  for (let i = 0; i <= CURVATURE_SAMPLES; i++) {
    const t = i / CURVATURE_SAMPLES;
    curve.getTangentAt((t - eps + 1) % 1, a).setY(0).normalize();
    curve.getTangentAt((t + eps) % 1, b).setY(0).normalize();
    // Signed angle between the two tangents about the world up axis.
    const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
    const angle = Math.acos(dot);
    cross.crossVectors(a, b);
    const signed = cross.dot(up) >= 0 ? -angle : angle;
    curvatureTable[i] = signed;
    peak = Math.max(peak, Math.abs(signed));
  }
  // Normalise to roughly -1..1 so downstream tuning is in sane units, then apply a
  // light 3-tap smooth so a single noisy sample cannot make the camera twitch.
  const raw = Float32Array.from(curvatureTable);
  for (let i = 0; i <= CURVATURE_SAMPLES; i++) {
    const p = raw[(i - 1 + CURVATURE_SAMPLES) % CURVATURE_SAMPLES];
    const c = raw[i];
    const n = raw[(i + 1) % CURVATURE_SAMPLES];
    curvatureTable[i] = ((p + 2 * c + n) / 4) / peak;
  }
})();

/**
 * Signed, normalised curvature at t. Roughly -1 (hardest left) .. +1 (hardest right).
 * Linearly interpolated between samples.
 */
export function curvatureAt(t) {
  const x = THREE.MathUtils.clamp(t, 0, 1) * CURVATURE_SAMPLES;
  const i = Math.floor(x);
  const j = Math.min(CURVATURE_SAMPLES, i + 1);
  const f = x - i;
  return curvatureTable[i] * (1 - f) + curvatureTable[j] * f;
}

// ---------------------------------------------------------------------------
// Frames — position + orientation at a given t.
// ---------------------------------------------------------------------------

const _pos = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _side = new THREE.Vector3();

/** Centreline position at t. Writes into `out` if given. */
export function pointAt(t, out = new THREE.Vector3()) {
  return curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1), out);
}

/** Unit forward direction at t. Writes into `out` if given. */
export function tangentAt(t, out = new THREE.Vector3()) {
  return curve.getTangentAt(THREE.MathUtils.clamp(t, 0, 1), out).normalize();
}

/**
 * A point offset laterally from the centreline. `lateral` is metres to the right of
 * the direction of travel; `height` is metres above the surface. This is how curbs,
 * markings, roadside dressing and the finish gate are all placed.
 */
export function offsetPointAt(t, lateral, height = 0, out = new THREE.Vector3()) {
  pointAt(t, _pos);
  tangentAt(t, _tan);
  _side.crossVectors(_tan, _up).normalize().multiplyScalar(-lateral);
  return out.set(_pos.x + _side.x, _pos.y + height, _pos.z + _side.z);
}

/** Convert an arc-length distance in world units to a t value. */
export function distanceToT(distance) {
  return THREE.MathUtils.clamp(distance / TRACK_LENGTH, 0, 1);
}

// ---------------------------------------------------------------------------
// Coin placement (SPEC §8) — ten coins, one per car, index-matched to src/data/cars.js
// ---------------------------------------------------------------------------
// Deliberately paced rather than evenly divided: the first comes early enough to
// teach the mechanic before the user doubts it, the middle ones sit on the exits of
// corners where the car is already the focus, and the last lands with enough run-out
// left that its montage does not collide with the finish line.

export const COIN_T = [
  0.070, // 1  Lexus     — early, on the opening straight, teaches the mechanic
  0.155, // 2  Nissan    — exit of turn 1
  0.245, // 3  Audi      — through the left-hand esses
  0.330, // 4  BMW       — on the uphill chute
  0.415, // 5  Mercedes  — exit of the big right-hander
  0.505, // 6  Ferrari   — out of the hairpin, the halfway beat
  0.590, // 7  McLaren   — between the chicane apexes
  0.680, // 8  Aston     — down the back straight
  0.775, // 9  Lamborghini — over the crest
  0.870, // 10 Porsche   — the final kink, with room to breathe before the flag
];

/** Height of a coin's centre above the asphalt. Large and unmistakable at 45°. */
export const COIN_HEIGHT = 4.2;

/** How close in t the rig must get before a coin fires. ~9 world units of travel. */
export const COIN_TRIGGER_T = 9 / TRACK_LENGTH;

/** How far out the approach cue begins — 15% of the gap to the coin (SPEC §14). */
export const COIN_APPROACH_T = 0.062;

/** Where the finish gate stands. */
export const FINISH_T = 0.994;
