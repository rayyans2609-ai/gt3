/** World-space Grand Tour camera. Route samples, not the car rig, define its rail. */
import * as THREE from 'three';
import { state } from '../core/state.js';
import { curve, TRACK_LENGTH, pointAt } from './trackCurve.js';

export const TUNE = {
  fov: 40,
  speedFovRange: 0,
  yawDeg: 75,
  pitchDeg: 52,
  distance: 54,
  routeSpreadM: 45,
  lookAheadM: 12,
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
const predictedPosition = new THREE.Vector3();
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
  routePose(state.progress);
  safetyOffset(desiredPosition);
  correction.copy(wantedCorrection);
  camera.position.copy(desiredPosition).add(correction);
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
  aerial.frames++;
  // Instant seek/replay sets progress directly; scrollbar pixel rounding can
  // leave a tiny velocity. A damped scroll step this large has high velocity.
  if (lastProgress === null || (Math.abs(state.progress - lastProgress) > TUNE.snapProgress
    && Math.abs(state.velocity) < 0.1)) {
    snap();
    return;
  }
  routePose(state.progress);
  const alpha = 1 - Math.exp(-Math.max(0, dt) / Math.max(0.001, TUNE.dampingSeconds));
  predictedPosition.copy(desiredPosition).add(correction);
  predictedPosition.lerpVectors(camera.position, predictedPosition, alpha);
  safetyOffset(predictedPosition);
  const safetyAlpha = 1 - Math.exp(-Math.max(0, dt) / Math.max(0.001, TUNE.correctionSeconds));
  correction.lerp(wantedCorrection, safetyAlpha);
  desiredPosition.add(correction);
  camera.position.lerp(desiredPosition, alpha);
  camera.quaternion.copy(orientation);
  camera.updateMatrixWorld();
  lastProgress = state.progress;
}
