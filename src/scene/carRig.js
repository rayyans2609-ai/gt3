/**
 * carRig.js — the camera rig hierarchy. (SPEC §4, §5, §7)
 *
 * OWNED BY THE MANAGER. This is the thing that makes the whole illusion work, so the
 * hierarchy is worth stating explicitly:
 *
 *   rig            — repositioned to curve.getPointAt(t), oriented to the tangent.
 *                    Its -Z axis is the direction of travel. Everything else is a child,
 *                    so everything else inherits "moving forward along the track".
 *     carMount     — holds the loaded car model. Only ever rotates (body roll into the
 *                    corner) and bobs a few centimetres. Never translates along the track.
 *       <car>      — swapped by morph.js. Models face -Z, nose to tail 4.6 units.
 *     shadow       — soft contact blob, pinned to the surface under the car.
 *     boom         — the camera arm. Holds the corner lean and the cursor parallax so
 *                    neither of those can contaminate the car's own transform.
 *       camera     — at a FIXED local offset. This is why the car stays locked in the
 *                    same screen position while the world streams past it.
 *
 * The camera is never repositioned per frame. It is parented once and left alone; all
 * apparent camera movement is the rig moving underneath it, plus a few degrees of lean.
 */

import * as THREE from 'three';
import { state } from '../core/state.js';
import { pointAt, tangentAt, curvatureAt } from './trackCurve.js';

// ---------------------------------------------------------------------------
// Framing. Derived, not guessed — see the note on CAMERA_OFFSET.
// ---------------------------------------------------------------------------
//
// Two angles matter here and they are NOT the same angle, which is the thing that
// makes this framing hard to tune by eye:
//
//   1. the angle from the camera DOWN TO THE CAR   — this is the "45 degree bird's-eye"
//      the spec asks for. The offset below sits 23.2 units from the car at 41.6 deg.
//   2. the angle the camera is AIMED at            — set by the look target. Aiming
//      lower than 45 deg would put the car dead centre and show almost no track ahead.
//
// Aiming at 27 deg while sitting at 41.6 deg puts the car 14.6 deg below frame centre.
// At FOV 52 (half-angle 26 deg) that lands it at ~0.78 of screen height — the lower
// third — while opening up a long read of the track ahead.
//
// The 27 deg aim is also what makes a horizon possible at all: the top of the frame
// then sits 1 deg BELOW horizontal, which is ground ~880 units away. That is far past
// the fog far plane, so the top of frame resolves into atmospheric haze rather than a
// hard edge of grass. Aiming any steeper (the literal 45 deg) puts the top of frame on
// ground only ~190 units out, and no amount of sky work can be seen past it.
//
// Car size check: 2 * 20.4 * tan(26 deg) = 19.9 units of visible height; a GT3 seen
// from 41.6 deg presents ~4.0 units, so the car covers ~17% of viewport height — mid
// band for the 15-25% the spec asks for, measured from a render rather than assumed.
const CAMERA_OFFSET = new THREE.Vector3(0, 13.55, 15.27); // +Z is behind, -Z is forward
const CAMERA_LOOK_LOCAL = new THREE.Vector3(0, 0.9, -9.55);

const TUNE = {
  // Body roll: the car leans INTO the turn, like weight transfer. Degrees at full lock.
  bodyRollDeg: 3.4,
  // Roll only develops when actually moving — a stationary car does not lean.
  bodyRollSpeedFloor: 0.12,
  bodyRollDamping: 0.055,

  // Camera corner lean (SPEC §5 "corner drift"): a small extra tilt on the sharpest
  // turns that eases out as the track straightens. Kept subtle — the 45 deg framing stays.
  camLeanDeg: 2.6,
  // The camera also slides slightly to the OUTSIDE of the turn, which reads as the car
  // drifting across the frame rather than the camera swinging.
  camLateral: 1.5,
  camLeanDamping: 0.04,

  // Cursor parallax (SPEC §11): a few degrees, no more. The scene breathing.
  cursorYawDeg: 2.2,
  cursorPitchDeg: 1.4,
  cursorDamping: 0.035,

  // Gentle idle bob, in metres. Barely there.
  bobAmplitude: 0.035,
  bobSpeed: 1.6,

  // Wheel spin. Radians per second at full speed.
  wheelSpinRate: 26,
};

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------
export const rig = new THREE.Group();
export const carMount = new THREE.Group();
export const boom = new THREE.Group();

rig.name = 'car-rig';
carMount.name = 'car-mount';
boom.name = 'camera-boom';

let shadowMesh = null;
let wheels = [];          // meshes rotated for the spin blur, supplied by cars.js
let attachedCamera = null;

// Smoothed values, so nothing in here can snap.
let bodyRoll = 0;
let camLean = 0;
let camLateral = 0;
let cursorX = 0;
let cursorY = 0;
let cursorTargetX = 0;
let cursorTargetY = 0;
let bobPhase = 0;

const _pos = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _target = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();

/** Frame-rate independent damping factor. Same formulation as scrollDrive. */
function damp(k, dt) {
  return 1 - Math.pow(1 - k, dt * 60);
}

// ---------------------------------------------------------------------------
// Contact shadow
// ---------------------------------------------------------------------------
// A real shadow map at this camera distance gives a mushy, unconvincing blob, so the
// car gets an explicit soft ellipse underneath it in addition to the cast shadow. This
// is what actually plants the car on the asphalt.
function buildContactShadow() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.30)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 8.6),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.06;
  mesh.renderOrder = 1;
  mesh.name = 'contact-shadow';
  return mesh;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Build the hierarchy and parent the camera into it.
 * @param {THREE.Camera} camera the camera created by sceneSetup
 * @returns {THREE.Group} the rig, to be added to the scene
 */
export function initCarRig(camera) {
  attachedCamera = camera;

  camera.position.copy(CAMERA_OFFSET);
  // Aim at a point ahead of the car. Derived rather than hard-coded so that moving
  // CAMERA_OFFSET or CAMERA_LOOK_LOCAL keeps the framing correct.
  const dir = _target.copy(CAMERA_LOOK_LOCAL).sub(CAMERA_OFFSET);
  camera.rotation.set(-Math.atan2(-dir.y, -dir.z), 0, 0, 'YXZ');

  boom.add(camera);
  rig.add(carMount);
  rig.add(boom);

  shadowMesh = buildContactShadow();
  rig.add(shadowMesh);

  return rig;
}

/** Replace the car model inside the mount. morph.js drives this. */
export function setCarModel(object3D) {
  for (let i = carMount.children.length - 1; i >= 0; i--) {
    carMount.remove(carMount.children[i]);
  }
  if (object3D) carMount.add(object3D);
}

/** Register the wheel meshes of the current car so they can be spun. */
export function setWheels(meshes) {
  wheels = Array.isArray(meshes) ? meshes : [];
}

/** Cursor parallax input, -1..1 on each axis. Called by the cursor module. */
export function setCursor(x, y) {
  cursorTargetX = THREE.MathUtils.clamp(x, -1, 1);
  cursorTargetY = THREE.MathUtils.clamp(y, -1, 1);
}

/** The camera's world position — the montage needs it to hand off cleanly. */
export function getCameraWorldPosition(out = new THREE.Vector3()) {
  return attachedCamera ? attachedCamera.getWorldPosition(out) : out.set(0, 0, 0);
}

// ---------------------------------------------------------------------------
// Frame update
// ---------------------------------------------------------------------------

export function update(dt) {
  const t = state.progress;

  // --- travel: position and orientation on the spline -----------------------
  pointAt(t, _pos);
  tangentAt(t, _tan);
  rig.position.copy(_pos);

  // Matrix4.lookAt sets +Z to (eye - target). Aiming it at a point AHEAD therefore
  // puts -Z along the direction of travel, which is the direction the models face.
  _target.copy(_pos).add(_tan);
  _m.lookAt(_pos, _target, _up);
  rig.quaternion.setFromRotationMatrix(_m);

  // --- corner signals ------------------------------------------------------
  const curvature = curvatureAt(t);
  const speed = state.speed01;
  const moving = Math.min(1, speed / TUNE.bodyRollSpeedFloor);

  // Body leans INTO the corner: turning right (+curvature) rolls the body right,
  // which in the rig's local frame is a negative Z rotation.
  const rollTarget = -curvature * THREE.MathUtils.degToRad(TUNE.bodyRollDeg) * moving;
  bodyRoll += (rollTarget - bodyRoll) * damp(TUNE.bodyRollDamping, dt);

  // Camera leans the same way but less, and drifts to the outside of the turn.
  const leanTarget = -curvature * THREE.MathUtils.degToRad(TUNE.camLeanDeg) * moving;
  const lateralTarget = curvature * TUNE.camLateral * moving;
  camLean += (leanTarget - camLean) * damp(TUNE.camLeanDamping, dt);
  camLateral += (lateralTarget - camLateral) * damp(TUNE.camLeanDamping, dt);

  // --- cursor parallax -----------------------------------------------------
  cursorX += (cursorTargetX - cursorX) * damp(TUNE.cursorDamping, dt);
  cursorY += (cursorTargetY - cursorY) * damp(TUNE.cursorDamping, dt);

  // --- apply ---------------------------------------------------------------
  bobPhase += dt * TUNE.bobSpeed;
  carMount.rotation.set(0, 0, bodyRoll);
  carMount.position.y = Math.sin(bobPhase) * TUNE.bobAmplitude * (0.4 + moving * 0.6);

  boom.rotation.set(
    cursorY * THREE.MathUtils.degToRad(TUNE.cursorPitchDeg),
    cursorX * THREE.MathUtils.degToRad(TUNE.cursorYawDeg),
    camLean,
    'YXZ',
  );
  boom.position.x = camLateral;

  // The contact shadow stays flat on the surface and does not inherit the body roll,
  // so it never peels off the asphalt on a corner.
  if (shadowMesh) {
    shadowMesh.scale.setScalar(1 + speed * 0.06);
    shadowMesh.material.opacity = 0.85 - speed * 0.12;
  }

  // --- wheels --------------------------------------------------------------
  if (wheels.length) {
    const spin = state.velocity * TUNE.wheelSpinRate * dt;
    for (const wheel of wheels) wheel.rotation.x += spin;
  }
}

export const rigTuning = TUNE;
export { CAMERA_OFFSET, CAMERA_LOOK_LOCAL };
