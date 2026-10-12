/** Neutral, fixed timing thresholds and the route/discovery progression they mark. */
import * as THREE from 'three';
import { state, set } from '../core/state.js';
import { CARS } from '../data/cars.js';
import {
  CHECKPOINT_T, CHECKPOINT_ROUTE_T, CHECKPOINT_APPROACH_T,
  offsetPointAt, tangentAt,
} from './trackCurve.js';
import { gateSpanAt, profileAt, CROSS_SECTION } from './trackProfile.js';
import { createGateResponse } from './gateResponse.js';

const postGeometry = new THREE.BoxGeometry(0.55, 7.6, 0.65);
// Keep a realistic reference span in geometry.parameters for the existing gate
// response owner; instance scale adjusts only span, leaving thickness untouched.
const BEAM_REFERENCE_WIDTH = gateSpanAt(CHECKPOINT_ROUTE_T[0]).width + .6;
const beamGeometry = new THREE.BoxGeometry(BEAM_REFERENCE_WIDTH, 0.65, 0.9);
const postMaterial = new THREE.MeshStandardMaterial({
  color: 0xa9b1b4, metalness: 0.35, roughness: 0.55,
  transparent: true, opacity: 0.72, depthWrite: false,
  emissive: 0x717b80, emissiveIntensity: 0.14,
});
const beamMaterial = new THREE.MeshStandardMaterial({
  color: 0xd0d5d3, metalness: 0.2, roughness: 0.6,
  transparent: true, opacity: 0.76, depthWrite: false,
  emissive: 0x919a9c, emissiveIntensity: 0.18,
});
const position = new THREE.Vector3();
const tangent = new THREE.Vector3();
const instance = new THREE.Object3D();
const approach = { index: -1, proximity: 0 };
let routeIndex = 0;
let response = null;
const crossingHandlers = [];

/** Live gate crossings only (never boot restore). `direction` is +1 forward, -1 reverse. */
export function onCrossing(fn) {
  crossingHandlers.push(fn);
}

export function indexAt(progress) {
  let index = 0;
  for (const threshold of CHECKPOINT_T) {
    if (progress < threshold) break;
    index++;
  }
  return index;
}

export function buildCheckpoints() {
  if (CHECKPOINT_T.length !== CARS.length - 1) {
    throw new Error('[checkpoints] Each car after Lexus needs one threshold.');
  }
  const root = new THREE.Group();
  root.name = 'checkpoints';
  const posts = new THREE.InstancedMesh(postGeometry, postMaterial, CHECKPOINT_T.length * 2);
  const beams = new THREE.InstancedMesh(beamGeometry, beamMaterial, CHECKPOINT_T.length);
  // Nine substantial two-metre transverse stripes, merged and drawn at boot.
  // Surface paint follows the route grade; it never changes tyre support.
  const stripeVertices = [];
  const stripeGeometry = new THREE.BufferGeometry();
  posts.name = 'checkpoint-posts';
  beams.name = 'checkpoint-beams';
  // The instances cover the full lap; two tiny static draws are cheaper than
  // maintaining a per-gate mesh hierarchy and need no per-frame updates.
  posts.frustumCulled = false;
  beams.frustumCulled = false;
  for (let i = 0; i < CHECKPOINT_T.length; i++) {
    const t = CHECKPOINT_ROUTE_T[i];
    const span = gateSpanAt(t);
    const profile = profileAt(t);
    const left = profile.left - .45, right = -profile.right + .45;
    const forward = tangentAt(t);
    const corners = [];
    for (const distance of [-1, 1]) for (const lateral of [right, left]) {
      corners.push(offsetPointAt(t, lateral, CROSS_SECTION.asphaltY + .01)
        .addScaledVector(forward, distance));
    }
    for (const v of [corners[0], corners[2], corners[1], corners[1], corners[2], corners[3]])
      stripeVertices.push(v.x, v.y, v.z);
    instance.scale.set(1, 1, 1);
    tangentAt(t, tangent);
    instance.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
    for (let side = 0; side < 2; side++) {
      offsetPointAt(t, side === 0 ? -span.right : span.left, 3.8, position);
      instance.position.copy(position);
      instance.updateMatrix();
      posts.setMatrixAt(i * 2 + side, instance.matrix);
    }
    // Grow upward from the original underside, preserving vertical clearance.
    offsetPointAt(t, span.center, 7.58 + beamGeometry.parameters.height / 2, position);
    instance.scale.x = (span.width + .6) / BEAM_REFERENCE_WIDTH;
    instance.position.copy(position);
    instance.updateMatrix();
    beams.setMatrixAt(i, instance.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  beams.instanceMatrix.needsUpdate = true;
  stripeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stripeVertices, 3));
  stripeGeometry.computeVertexNormals();
  const stripes = new THREE.Mesh(stripeGeometry, new THREE.MeshStandardMaterial({
    color: 0xe8e6df, roughness: .86, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
  }));
  stripes.name = 'checkpoint-road-stripes';
  stripes.frustumCulled = false; // Buffers and lit material actually draw during boot warmup.
  stripes.receiveShadow = true;
  root.add(posts, beams, stripes);
  response = createGateResponse(posts, beams);
  root.add(response.group);
  routeIndex = indexAt(state.progress);
  return root;
}

/** Runs after scrollDrive. Route is derived every frame; discovery only grows. */
export function updateCheckpoints() {
  const nextIndex = indexAt(state.progress);
  if (nextIndex > routeIndex) {
    let discovered = null;
    for (let index = routeIndex + 1; index <= nextIndex; index++) {
      if (!state.unlocked.has(index)) {
        discovered ??= new Set(state.unlocked);
        discovered.add(index);
      }
    }
    if (discovered) set('unlocked', discovered);
  }
  if (nextIndex !== routeIndex) {
    const gate = Math.max(nextIndex, routeIndex) - 1;
    const crossing = { gate, direction: nextIndex > routeIndex ? 1 : -1 };
    response?.trigger(gate, crossing.direction);
    for (const fn of crossingHandlers) fn(crossing);
  }
  routeIndex = nextIndex;
  if (state.activeCarIndex !== nextIndex) set('activeCarIndex', nextIndex);
}

/** Set route-derived state at boot without replaying discovery or gate effects. */
export function restoreAtProgress(progress) {
  routeIndex = indexAt(progress);
  if (state.activeCarIndex !== routeIndex) set('activeCarIndex', routeIndex);
  return routeIndex;
}

export function updateGateResponse(dt) {
  response?.update(dt);
}

export function warmCheckpointResponse() {
  return response?.warm() ?? (() => {});
}

export function getApproach() {
  const index = indexAt(state.progress);
  const distance = CHECKPOINT_T[index] - state.progress;
  if (index >= CHECKPOINT_T.length || distance <= 0 || distance >= CHECKPOINT_APPROACH_T) return null;
  approach.index = index + 1;
  approach.proximity = 1 - distance / CHECKPOINT_APPROACH_T;
  return approach;
}
