/** Route-bound car, body motion, wheels and contact shadow. The race camera is independent. */

import * as THREE from 'three';
import { state } from '../core/state.js';
import { pointAt, tangentAt, curvatureAt } from './trackCurve.js';

const TUNE = {
  // Body roll: the car leans INTO the turn, like weight transfer. Degrees at full lock.
  bodyRollDeg: 3.4,
  // Roll only develops when actually moving — a stationary car does not lean.
  bodyRollSpeedFloor: 0.12,
  bodyRollDamping: 0.055,

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

rig.name = 'car-rig';
carMount.name = 'car-mount';

let shadowMesh = null;
let wheels = [];          // meshes rotated for the spin blur, supplied by cars.js

// Smoothed values, so nothing in here can snap.
let bodyRoll = 0;
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

/** Build the independent car hierarchy and return its route-bound root. */
export function initCarRig() {
  rig.add(carMount);
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

  // --- apply ---------------------------------------------------------------
  bobPhase += dt * TUNE.bobSpeed;
  carMount.rotation.set(0, 0, bodyRoll);
  carMount.position.y = Math.sin(bobPhase) * TUNE.bobAmplitude * (0.4 + moving * 0.6);

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
