/** Neutral, fixed timing thresholds and the route/discovery progression they mark. */
import * as THREE from 'three';
import { state, set } from '../core/state.js';
import { CARS } from '../data/cars.js';
import {
  CHECKPOINT_T, CHECKPOINT_APPROACH_T, TRACK,
  offsetPointAt, tangentAt,
} from './trackCurve.js';

const postGeometry = new THREE.BoxGeometry(0.24, 7.6, 0.34);
const beamGeometry = new THREE.BoxGeometry(18.9, 0.24, 0.55);
const postMaterial = new THREE.MeshStandardMaterial({
  color: 0xa9b1b4, metalness: 0.35, roughness: 0.55,
  transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide,
  emissive: 0x717b80, emissiveIntensity: 0.14,
});
const beamMaterial = new THREE.MeshStandardMaterial({
  color: 0xd0d5d3, metalness: 0.2, roughness: 0.6,
  transparent: true, opacity: 0.76, depthWrite: false, side: THREE.DoubleSide,
  emissive: 0x919a9c, emissiveIntensity: 0.18,
});
const position = new THREE.Vector3();
const tangent = new THREE.Vector3();
const approach = { index: -1, proximity: 0 };
let routeIndex = 0;

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
  for (let i = 0; i < CHECKPOINT_T.length; i++) {
    const t = CHECKPOINT_T[i];
    const gate = new THREE.Group();
    gate.name = `checkpoint-${i + 1}`;
    offsetPointAt(t, 0, 0, position);
    tangentAt(t, tangent);
    gate.position.copy(position);
    gate.rotation.y = Math.atan2(tangent.x, tangent.z);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(side * lateral, 3.8, 0);
      gate.add(post);
    }
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.y = 7.7;
    gate.add(beam);
    root.add(gate);
  }
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
  routeIndex = nextIndex;
  if (state.activeCarIndex !== nextIndex) set('activeCarIndex', nextIndex);
}

export function getApproach() {
  const index = indexAt(state.progress);
  const distance = CHECKPOINT_T[index] - state.progress;
  if (index >= CHECKPOINT_T.length || distance <= 0 || distance >= CHECKPOINT_APPROACH_T) return null;
  approach.index = index + 1;
  approach.proximity = 1 - distance / CHECKPOINT_APPROACH_T;
  return approach;
}
