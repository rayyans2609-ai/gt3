/** Neutral, fixed timing thresholds and the route/discovery progression they mark. */
import * as THREE from 'three';
import { state, set } from '../core/state.js';
import { CARS } from '../data/cars.js';
import {
  CHECKPOINT_T, CHECKPOINT_APPROACH_T, TRACK,
  offsetPointAt, tangentAt,
} from './trackCurve.js';
import { createGateResponse } from './gateResponse.js';

const postGeometry = new THREE.BoxGeometry(0.24, 7.6, 0.34);
const beamGeometry = new THREE.BoxGeometry(18.9, 0.24, 0.55);
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
  const lateral = TRACK.halfWidth + TRACK.curbWidth + 1.0;
  const posts = new THREE.InstancedMesh(postGeometry, postMaterial, CHECKPOINT_T.length * 2);
  const beams = new THREE.InstancedMesh(beamGeometry, beamMaterial, CHECKPOINT_T.length);
  posts.name = 'checkpoint-posts';
  beams.name = 'checkpoint-beams';
  // The instances cover the full lap; two tiny static draws are cheaper than
  // maintaining a per-gate mesh hierarchy and need no per-frame updates.
  posts.frustumCulled = false;
  beams.frustumCulled = false;
  for (let i = 0; i < CHECKPOINT_T.length; i++) {
    const t = CHECKPOINT_T[i];
    tangentAt(t, tangent);
    instance.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
    for (let side = 0; side < 2; side++) {
      offsetPointAt(t, side === 0 ? -lateral : lateral, 3.8, position);
      instance.position.copy(position);
      instance.updateMatrix();
      posts.setMatrixAt(i * 2 + side, instance.matrix);
    }
    offsetPointAt(t, 0, 7.7, position);
    instance.position.copy(position);
    instance.updateMatrix();
    beams.setMatrixAt(i, instance.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  beams.instanceMatrix.needsUpdate = true;
  root.add(posts, beams);
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
  if (nextIndex !== routeIndex) response?.trigger(Math.max(nextIndex, routeIndex) - 1);
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
