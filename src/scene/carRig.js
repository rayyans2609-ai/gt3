/** Route-bound car, body motion, wheels and contact shadow. The race camera is independent. */

import * as THREE from 'three';
import { state } from '../core/state.js';
import { COMP } from './composition.js';
import { pathPointAt, pathTangentAt, pathCurvatureAt, curbUseAt } from './racingLine.js';
import { pointAt, tangentAt, offsetPointAt, TRACK, TRACK_LENGTH } from './trackCurve.js';

// W2 hero scale: uniform, about the mount origin, which is the models' ground plane
// (cars.js normaliseScene grounds every car at y=0), so tyres stay seated.
const HERO = COMP.hero;

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
let contacts = [];
const contactCache = new WeakMap();

// Candidate-only ground support. Cache four tyre contact vertices once per model,
// in normalized mount space; do not change the existing wheel-spin classifier.
function tyreContacts(model) {
  if (contactCache.has(model)) return contactCache.get(model);
  carMount.updateWorldMatrix(true, true);
  const inverse = carMount.matrixWorld.clone().invert();
  const v = new THREE.Vector3(), matrix = new THREE.Matrix4(), instance = new THREE.Matrix4();
  const quadrants = {}, treadBins = {};
  const wheelName = s => /wheel|tyre|tire|rim/i.test(s || '') && !/brake|caliper|disc|rotor|arch|well|steering/i.test(s || '');
  model.traverse(o => {
    if (!o.isMesh) return;
    let isWheel = false;
    for (let a = o; a && a !== model.parent; a = a.parent) if (wheelName(a.name)) isWheel = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!isWheel && !mats.some(m => wheelName(m?.name))) return;
    const p = o.geometry.getAttribute('position');
    for (let k = 0; k < (o.isInstancedMesh ? o.count : 1); k++) {
      matrix.copy(o.matrixWorld);
      if (o.isInstancedMesh) { o.getMatrixAt(k, instance); matrix.multiply(instance); }
      matrix.premultiply(inverse);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(matrix);
        const q = `${v.x >= 0 ? 'R' : 'L'}${v.z <= 0 ? 'F' : 'B'}`;
        if (!quadrants[q] || v.y < quadrants[q].y) quadrants[q] = v.clone();
        // Lowest vertex in 2 cm lateral bins retains the tread's contact width;
        // one arbitrary bottom vertex misses the raised half of a straddling tyre.
        const bin = `${q}:${Math.round(v.x / 0.02)}`;
        if (!treadBins[bin] || v.y < treadBins[bin].y) treadBins[bin] = v.clone();
      }
    }
  });
  const result = Object.entries(quadrants).map(([q, lowest]) => Object.entries(treadBins)
    .filter(([bin, p]) => bin.startsWith(q + ':') && p.y <= lowest.y + 0.025).map(([, p]) => p));
  contactCache.set(model, result);
  return result;
}

const contactWorld = new THREE.Vector3(), surfaceCenter = new THREE.Vector3();
const surfaceTan = new THREE.Vector3(), surfaceLeft = new THREE.Vector3();
const supportEuler = new THREE.Euler(), supportRotation = new THREE.Quaternion();

function seatOnCurb(t) {
  const weight = THREE.MathUtils.smoothstep(curbUseAt(t), 0, 0.1);
  if (!weight || contacts.length !== 4) return;
  // Fit delta-y = a*x + b*z + c to the four real tyre contacts. The curb is
  // the existing 0.005 -> 0.105 m ramp, widened to TRACK.curbWidthWide here.
  const rows = contacts.map(tread => tread.map(p => {
    contactWorld.copy(p).multiplyScalar(HERO).applyQuaternion(rig.quaternion).add(rig.position);
    let u = t;
    for (let i = 0; i < 3; i++) {
      pointAt(u, surfaceCenter); tangentAt(u, surfaceTan).setY(0).normalize();
      u = THREE.MathUtils.clamp(u + contactWorld.clone().sub(surfaceCenter).dot(surfaceTan) / TRACK_LENGTH, 0, 1);
    }
    pointAt(u, surfaceCenter);
    offsetPointAt(u, 1, 0, surfaceLeft).sub(surfaceCenter).setY(0).normalize();
    const lateral = Math.abs(contactWorld.clone().sub(surfaceCenter).dot(surfaceLeft));
    const curbY = lateral > TRACK.halfWidth
      ? 0.005 + 0.1 * Math.min(1, (lateral - TRACK.halfWidth) / TRACK.curbWidthWide) : -0.02;
    return [p.x * HERO, p.z * HERO, 1, surfaceCenter.y + curbY - contactWorld.y];
  }).reduce((a, b) => b[3] > a[3] ? b : a));
  const matrix = Array.from({ length: 3 }, (_, i) => Array.from({ length: 4 }, (_, j) =>
    rows.reduce((sum, row) => sum + row[i] * row[j], 0)));
  for (let i = 0; i < 3; i++) {
    const divisor = matrix[i][i];
    if (Math.abs(divisor) < 1e-10) return;
    for (let j = i; j < 4; j++) matrix[i][j] /= divisor;
    for (let k = 0; k < 3; k++) if (k !== i) {
      const factor = matrix[k][i];
      for (let j = i; j < 4; j++) matrix[k][j] -= factor * matrix[i][j];
    }
  }
  supportEuler.set(-Math.atan(matrix[1][3]) * weight, 0, Math.atan(matrix[0][3]) * weight);
  supportRotation.setFromEuler(supportEuler);
  rig.quaternion.multiply(supportRotation);
  rig.position.y += matrix[2][3] * weight;
}

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
  carMount.scale.setScalar(HERO);
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
  if (COMP.look) contacts = object3D ? tyreContacts(object3D) : [];
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

  // --- travel: position and orientation on the driven path ------------------
  // Centreline unless a racing line is active; heading follows the path's own tangent.
  pathPointAt(t, _pos);
  pathTangentAt(t, _tan);
  rig.position.copy(_pos);
  // The real asphalt vertices are 2 cm below the spline, not at spline y.
  if (COMP.look) rig.position.y -= 0.02;

  // Matrix4.lookAt sets +Z to (eye - target). Aiming it at a point AHEAD therefore
  // puts -Z along the direction of travel, which is the direction the models face.
  _target.copy(_pos).add(_tan);
  _m.lookAt(_pos, _target, _up);
  rig.quaternion.setFromRotationMatrix(_m);
  if (COMP.look) seatOnCurb(t);

  // --- corner signals ------------------------------------------------------
  const curvature = pathCurvatureAt(t);
  const speed = state.speed01;
  const moving = Math.min(1, speed / TUNE.bodyRollSpeedFloor);

  // Body leans INTO the corner: turning right (+curvature) rolls the body right,
  // which in the rig's local frame is a negative Z rotation.
  const rollTarget = -curvature * THREE.MathUtils.degToRad(TUNE.bodyRollDeg) * moving;
  bodyRoll += (rollTarget - bodyRoll) * damp(TUNE.bodyRollDamping, dt);

  // --- apply ---------------------------------------------------------------
  bobPhase += dt * TUNE.bobSpeed;
  carMount.rotation.set(0, 0, bodyRoll);
  carMount.position.y = Math.sin(bobPhase) * TUNE.bobAmplitude * HERO * (0.4 + moving * 0.6);

  // The contact shadow stays flat on the surface and does not inherit the body roll,
  // so it never peels off the asphalt on a corner.
  if (shadowMesh) {
    shadowMesh.scale.setScalar(HERO * (1 + speed * 0.06));
    shadowMesh.material.opacity = 0.85 - speed * 0.12;
  }

  // --- wheels --------------------------------------------------------------
  if (wheels.length) {
    const spin = state.velocity * TUNE.wheelSpinRate * dt;
    for (const wheel of wheels) wheel.rotation.x += spin;
  }
}

export const rigTuning = TUNE;
