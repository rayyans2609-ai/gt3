/** World-space Grand Tour camera. Route samples, not the car rig, define its rail. */
import * as THREE from 'three';
import { state } from '../core/state.js';
import { curve, TRACK_LENGTH, pointAt } from './trackCurve.js';
import { COMP } from './composition.js';
import { pathPointAt } from './racingLine.js';
import { buildCompositionRail } from './compositionRail.js';

// `base` (legacy model) keeps today's values exactly; W2 review candidates and dev
// overrides supply fov / yaw / pitch / distance from composition.js.
export const TUNE = {
  fov: COMP.fov,
  speedFovRange: 0,
  yawDeg: COMP.yawDeg,
  pitchDeg: COMP.pitchDeg,
  distance: COMP.distance,
  routeSpreadM: 45,
  // A fixed +t look-ahead helps forward travel but pushes the car to the frame edge in
  // reverse (measured: 59% correction-active frames backward at 12 m, 0% at 0 m).
  lookAheadM: 0,
  lateralOffsetM: 0,
  trackingGain: 1,
  dampingSeconds: 0.18,
  safeX: 0.76,
  safeY: 0.72,
  correctionSeconds: 0.22,
  maxCorrectionM: 12,
  snapProgress: 0.008,
};

export const aerial = {
  TUNE,
  model: COMP.camera,
  correctionActive: false,
  correctionFrames: 0,
  frames: 0,
  snapCount: 0,
  carNdc: { x: 0, y: 0 },
};

let camera;
let lastProgress = null;
const routeTarget = new THREE.Vector3();
const desiredPosition = new THREE.Vector3();
const correction = new THREE.Vector3();
const wantedCorrection = new THREE.Vector3();
const car = new THREE.Vector3();
const projected = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const groundForward = new THREE.Vector3();
const sample = new THREE.Vector3();
const orientation = new THREE.Quaternion();
const viewMatrix = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const ROUTE_SAMPLES = [[-2, 0.06], [-1, 0.24], [0, 0.40], [1, 0.24], [2, 0.06]];
const previousPosition = new THREE.Vector3();
const basePosition = new THREE.Vector3();
const toCar = new THREE.Vector3();

function wrappedPoint(t, out) {
  return curve.getPointAt(((t % 1) + 1) % 1, out);
}

function routePose(t) {
  const yaw = THREE.MathUtils.degToRad(TUNE.yawDeg);
  const pitch = THREE.MathUtils.degToRad(TUNE.pitchDeg);
  groundForward.set(Math.sin(yaw), 0, -Math.cos(yaw));
  forward.copy(groundForward).multiplyScalar(Math.cos(pitch)).setY(-Math.sin(pitch));
  right.set(Math.cos(yaw), 0, Math.sin(yaw));

  // Five wrapped samples approximate a Gaussian window without a per-lap rail table.
  // The same progress gives the same target in either travel direction, including seam.
  routeTarget.set(0, 0, 0);
  const spread = TUNE.routeSpreadM / TRACK_LENGTH;
  const centre = t + TUNE.lookAheadM / TRACK_LENGTH;
  for (const [offset, weight] of ROUTE_SAMPLES) {
    wrappedPoint(centre + offset * spread, sample);
    routeTarget.addScaledVector(sample, weight);
  }
  // Gain is a tuneable blend toward the exact route point; default preserves the
  // smoothed rail's deliberately small car-to-centre drift.
  if (TUNE.trackingGain !== 1) {
    wrappedPoint(t, sample);
    routeTarget.lerp(sample, 1 - TUNE.trackingGain);
  }
  routeTarget.addScaledVector(right, TUNE.lateralOffsetM);
  desiredPosition.copy(routeTarget).addScaledVector(forward, -TUNE.distance);
  viewMatrix.lookAt(desiredPosition, routeTarget, UP);
  orientation.setFromRotationMatrix(viewMatrix);
}

function safetyOffset(testPosition) {
  // Test the pose about to be rendered, before this frame's last-resort correction.
  previousPosition.copy(camera.position);
  camera.position.copy(testPosition);
  camera.quaternion.copy(orientation);
  camera.updateMatrixWorld();
  pointAt(state.progress, car);
  car.y += 1.2;
  projected.copy(car).project(camera);
  aerial.carNdc.x = projected.x;
  aerial.carNdc.y = projected.y;
  const dx = Math.sign(projected.x) * Math.max(0, Math.abs(projected.x) - TUNE.safeX);
  const dy = Math.sign(projected.y) * Math.max(0, Math.abs(projected.y) - TUNE.safeY);
  aerial.correctionActive = dx !== 0 || dy !== 0;
  if (aerial.correctionActive) aerial.correctionFrames++;
  const depth = Math.max(1, toCar.copy(car).sub(testPosition).dot(forward));
  const halfHeight = depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const halfWidth = halfHeight * camera.aspect;
  wantedCorrection.copy(right).multiplyScalar(dx * halfWidth)
    .addScaledVector(groundForward, dy * halfHeight / Math.max(0.3, Math.sin(THREE.MathUtils.degToRad(TUNE.pitchDeg))));
  wantedCorrection.clampLength(0, TUNE.maxCorrectionM);
  camera.position.copy(previousPosition);
}

export function snap() {
  if (!camera) return;
  if (CORRIDOR) { corridorUpdate(true); return; }
  if (SECTOR) { sectorSnap(); return; }
  routePose(state.progress);
  basePosition.copy(desiredPosition);
  safetyOffset(basePosition);
  correction.copy(wantedCorrection);
  camera.position.copy(basePosition).add(correction);
  camera.quaternion.copy(orientation);
  camera.updateMatrixWorld();
  lastProgress = state.progress;
  aerial.snapCount++;
}

export function initAerialCamera(raceCamera) {
  camera = raceCamera;
  camera.fov = TUNE.fov;
  camera.updateProjectionMatrix();
  window.__gt3.aerial = aerial;
  snap();
}

export function update(dt) {
  if (!camera) return;
  if (CORRIDOR) { aerial.frames++; corridorUpdate(false); return; }
  if (SECTOR) { sectorUpdate(dt); return; }
  aerial.frames++;
  // Instant seek/replay sets progress directly; scrollbar pixel rounding can
  // leave a tiny velocity. A damped scroll step this large has high velocity.
  if (lastProgress === null || (Math.abs(state.progress - lastProgress) > TUNE.snapProgress
    && Math.abs(state.velocity) < 0.1)) {
    snap();
    return;
  }
  routePose(state.progress);
  const alpha = TUNE.dampingSeconds <= 0 ? 1
    : 1 - Math.exp(-Math.max(0, dt) / TUNE.dampingSeconds);
  basePosition.lerp(desiredPosition, alpha);
  safetyOffset(basePosition);
  const safetyAlpha = 1 - Math.exp(-Math.max(0, dt) / Math.max(0.001, TUNE.correctionSeconds));
  correction.lerp(wantedCorrection, safetyAlpha);
  camera.position.copy(basePosition).add(correction);
  camera.quaternion.copy(orientation);
  camera.updateMatrixWorld();
  lastProgress = state.progress;
}

// ---------------------------------------------------------------------------
// W2 sector-scale camera (review candidates a/b/c). Route-led: the rail is a
// precomputed, wrapped table derived from the car's path, so the same t gives the
// same pose in either direction and across the seam. The live layer is last resort.
// ---------------------------------------------------------------------------
const SECTOR = COMP.camera === 'sector';
const CORRIDOR = COMP.camera === 'corridor';
let compositionRail;

function corridorPose(t) {
  if (!compositionRail || Math.abs(compositionRail.aspect - camera.aspect) > 1e-3) {
    compositionRail = buildCompositionRail(camera.aspect);
    aerial.rail = { zone: COMP.railZone, aspect: camera.aspect,
      clampActiveFraction: compositionRail.activeFraction, holds: compositionRail.holds,
      unavailableHolds: compositionRail.unavailableHolds,
      buildMs: compositionRail.buildMs, solver: compositionRail.solver };
  }
  sectorBasis();
  compositionRail.at(t, routeTarget);
  desiredPosition.copy(routeTarget).addScaledVector(forward, -TUNE.distance);
  viewMatrix.lookAt(desiredPosition, routeTarget, UP);
  orientation.setFromRotationMatrix(viewMatrix);
}

function corridorUpdate(explicitSnap) {
  const instantSeek = lastProgress === null || (Math.abs(state.progress - lastProgress) > TUNE.snapProgress
    && Math.abs(state.velocity) < 0.1);
  corridorPose(state.progress);
  camera.position.copy(desiredPosition);
  camera.quaternion.copy(orientation);
  camera.updateMatrixWorld();
  aerial.correctionActive = false;
  aerial.hardCorrection = false;
  if (explicitSnap || instantSeek) aerial.snapCount++;
  lastProgress = state.progress;
}
const RAIL_N = 2048;
const rail = { x: new Float64Array(RAIL_N + 1), y: new Float64Array(RAIL_N + 1),
  z: new Float64Array(RAIL_N + 1), aspect: 0, activeFraction: 0 };
const camUp = new THREE.Vector3();
const railPoint = new THREE.Vector3();
const carCentre = new THREE.Vector3();
let engaged = false;

function sectorBasis() {
  const yaw = THREE.MathUtils.degToRad(TUNE.yawDeg);
  const pitch = THREE.MathUtils.degToRad(TUNE.pitchDeg);
  groundForward.set(Math.sin(yaw), 0, -Math.cos(yaw));
  forward.copy(groundForward).multiplyScalar(Math.cos(pitch)).setY(-Math.sin(pitch));
  right.set(Math.cos(yaw), 0, Math.sin(yaw));
  camUp.copy(groundForward).multiplyScalar(Math.sin(pitch)).setY(Math.cos(pitch));
}

/** Scaled car bounds as a sphere: centre height and radius in metres. */
function carBounds(t, out) {
  pathPointAt(t, out);
  out.y += 0.7 * COMP.hero;
  return 2.7 * COMP.hero;
}

function smoothWrapped(values, sigmaSamples) {
  const radius = Math.ceil(3 * sigmaSamples);
  const weights = [];
  let sum = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-0.5 * (k / sigmaSamples) ** 2);
    weights.push(w); sum += w;
  }
  const out = new Float64Array(RAIL_N + 1);
  for (let i = 0; i < RAIL_N; i++) {
    let v = 0;
    for (let k = -radius; k <= radius; k++) {
      v += values[((i + k) % RAIL_N + RAIL_N) % RAIL_N] * weights[k + radius];
    }
    out[i] = v / sum;
  }
  out[RAIL_N] = out[0];
  return out;
}

/**
 * Rail = heavy wrapped Gaussian of the car path (geography), then an elastic band:
 * light smoothing alternated with a projection that keeps the scaled car inside
 * `railZone`. Where the frame allows, the rail stays as straight as the geography.
 */
export function buildSectorRail(aspect) {
  sectorBasis();
  const ds = TRACK_LENGTH / RAIL_N;
  const car = { x: new Float64Array(RAIL_N + 1), y: new Float64Array(RAIL_N + 1),
    z: new Float64Array(RAIL_N + 1) };
  let radius = 0;
  for (let i = 0; i < RAIL_N; i++) {
    radius = carBounds(i / RAIL_N, carCentre);
    car.x[i] = carCentre.x; car.y[i] = carCentre.y; car.z[i] = carCentre.z;
  }
  const heavy = COMP.railSigmaM / ds;
  rail.x = smoothWrapped(car.x, heavy);
  rail.y = smoothWrapped(car.y, heavy);
  rail.z = smoothWrapped(car.z, heavy);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(TUNE.fov) / 2);
  const sinPitch = Math.sin(THREE.MathUtils.degToRad(TUNE.pitchDeg));
  const project = () => {
    let active = 0;
    for (let i = 0; i < RAIL_N; i++) {
      toCar.set(car.x[i] - rail.x[i], car.y[i] - rail.y[i], car.z[i] - rail.z[i]);
      const depth = Math.max(10, TUNE.distance + toCar.dot(forward));
      const limitX = Math.max(0, COMP.railZone.x * depth * tanHalf * aspect - radius);
      const limitY = Math.max(0, COMP.railZone.y * depth * tanHalf - radius);
      const sx = toCar.dot(right);
      const sy = toCar.dot(camUp);
      const dx = Math.sign(sx) * Math.max(0, Math.abs(sx) - limitX);
      const dy = Math.sign(sy) * Math.max(0, Math.abs(sy) - limitY);
      if (dx || dy) active++;
      rail.x[i] += right.x * dx + groundForward.x * dy / sinPitch;
      rail.z[i] += right.z * dx + groundForward.z * dy / sinPitch;
    }
    rail.x[RAIL_N] = rail.x[0];
    rail.z[RAIL_N] = rail.z[0];
    return active;
  };
  const light = 30 / ds;
  for (let iteration = 0; iteration < 100; iteration++) {
    project();
    rail.x = smoothWrapped(rail.x, light);
    rail.z = smoothWrapped(rail.z, light);
  }
  rail.activeFraction = project() / RAIL_N;
  // One last light pass so no clamp kink survives; the live layer covers residue.
  rail.x = smoothWrapped(rail.x, light);
  rail.z = smoothWrapped(rail.z, light);
  rail.aspect = aspect;
  aerial.rail = { sigmaM: COMP.railSigmaM, zone: COMP.railZone, aspect,
    clampActiveFraction: rail.activeFraction };
  return rail;
}

function railAt(t, out) {
  const x = (((t % 1) + 1) % 1) * RAIL_N;
  const i = Math.floor(x);
  const f = x - i;
  return out.set(rail.x[i] * (1 - f) + rail.x[i + 1] * f,
    rail.y[i] * (1 - f) + rail.y[i + 1] * f,
    rail.z[i] * (1 - f) + rail.z[i + 1] * f);
}

/** Deterministic rail pose for t: writes desiredPosition / orientation / routeTarget. */
export function sectorPose(t) {
  if (Math.abs(rail.aspect - camera.aspect) > 1e-3) buildSectorRail(camera.aspect);
  sectorBasis();
  railAt(t, routeTarget);
  desiredPosition.copy(routeTarget).addScaledVector(forward, -TUNE.distance);
  viewMatrix.lookAt(desiredPosition, routeTarget, UP);
  orientation.setFromRotationMatrix(viewMatrix);
}

/** Car bounds in NDC for a camera at `position` (centre + half extents). */
function carNdcAt(position, t) {
  const radius = carBounds(t, carCentre);
  previousPosition.copy(camera.position);
  camera.position.copy(position);
  camera.quaternion.copy(orientation);
  camera.updateMatrixWorld();
  projected.copy(carCentre).project(camera);
  camera.position.copy(previousPosition);
  const depth = Math.max(1, toCar.copy(carCentre).sub(position).dot(forward));
  const halfHeight = depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return { x: projected.x, y: projected.y, rx: radius / (halfHeight * camera.aspect),
    ry: radius / halfHeight, halfHeight, halfWidth: halfHeight * camera.aspect };
}

/** World shift that brings the car's bounds inside `zone` from the uncorrected pose. */
function shiftInto(ndc, zone) {
  const over = (value, extent, limit) =>
    Math.sign(value) * Math.max(0, Math.abs(value) + extent - limit);
  const dx = over(ndc.x, ndc.rx, zone.x);
  const dy = over(ndc.y, ndc.ry, zone.y);
  const sinPitch = Math.max(0.3, Math.sin(THREE.MathUtils.degToRad(TUNE.pitchDeg)));
  return wantedCorrection.copy(right).multiplyScalar(dx * ndc.halfWidth)
    .addScaledVector(groundForward, dy * ndc.halfHeight / sinPitch)
    .clampLength(0, COMP.maxCorrectionM);
}

function sectorFraming(dt, snapNow) {
  const t = state.progress;
  // Hysteresis: engage only when the rendered framing reaches the outer zone;
  // release once the rail alone frames the car inside the inner zone again.
  testPosition.copy(basePosition).add(correction);
  const shown = carNdcAt(testPosition, t);
  aerial.carNdc.x = shown.x;
  aerial.carNdc.y = shown.y;
  aerial.carNdcExtent = { x: shown.rx, y: shown.ry };
  const reach = Math.max((Math.abs(shown.x) + shown.rx) / COMP.engageZone.x,
    (Math.abs(shown.y) + shown.ry) / COMP.engageZone.y);
  const uncorrected = carNdcAt(basePosition, t);
  if (!engaged && reach > 1) engaged = true;
  if (engaged) {
    shiftInto(uncorrected, COMP.releaseZone);
    if (wantedCorrection.lengthSq() < 1e-6) engaged = false;
  } else wantedCorrection.set(0, 0, 0);
  aerial.correctionActive = engaged;
  if (engaged) aerial.correctionFrames++;
  const hard = Math.max(Math.abs(shown.x) + shown.rx, Math.abs(shown.y) + shown.ry) > COMP.hardZone;
  aerial.hardCorrection = hard;
  if (snapNow) { correction.copy(wantedCorrection); return; }
  const seconds = hard ? COMP.fastCorrectionSeconds : COMP.correctionSeconds;
  correction.lerp(wantedCorrection, 1 - Math.exp(-Math.max(0, dt) / seconds));
}

const testPosition = new THREE.Vector3();

function sectorSnap() {
  sectorPose(state.progress);
  basePosition.copy(desiredPosition);
  correction.set(0, 0, 0);
  engaged = false;
  sectorFraming(0, true);
  camera.position.copy(basePosition).add(correction);
  camera.quaternion.copy(orientation);
  camera.updateMatrixWorld();
  lastProgress = state.progress;
  aerial.snapCount++;
}

function sectorUpdate(dt) {
  aerial.frames++;
  if (lastProgress === null || (Math.abs(state.progress - lastProgress) > TUNE.snapProgress
    && Math.abs(state.velocity) < 0.1)) {
    sectorSnap();
    return;
  }
  sectorPose(state.progress);
  const alpha = COMP.dampingSeconds <= 0 ? 1
    : 1 - Math.exp(-Math.max(0, dt) / COMP.dampingSeconds);
  basePosition.lerp(desiredPosition, alpha);
  sectorFraming(dt, false);
  camera.position.copy(basePosition).add(correction);
  camera.quaternion.copy(orientation);
  camera.updateMatrixWorld();
  lastProgress = state.progress;
}

/** Pure helpers for harnesses: the deterministic rail pose at any t (no state). */
export function railPoseAt(t) {
  if (!camera) return null;
  if (CORRIDOR) corridorPose(t);
  else if (SECTOR) sectorPose(t);
  else routePose(t);
  return { position: desiredPosition.toArray(), target: routeTarget.toArray(),
    quaternion: orientation.toArray() };
}
