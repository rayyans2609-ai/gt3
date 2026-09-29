/** A short body-only cross-fade. The route rig never changes during a swap. */
import { state } from '../core/state.js';
import { carMount, setCarModel, setWheels } from './carRig.js';
import { getCarModel, findWheels } from './cars.js';

const DURATION = 0.56;
const materialCache = new WeakMap();

let active = false;
let clock = 0;
let outgoing = null;
let incoming = null;
let pendingIndex = -1;
let renderedIndex = 0;
const completeHandlers = [];

// Each car owns a second set of materials for the transparent state. They share
// the source textures, while their shader programs stay resident after warm-up.
// Repeatedly changing a single material between opaque and transparent releases
// the old program and recreates it at the next gate.
function materialsFor(model) {
  if (!model) return null;
  const cached = materialCache.get(model);
  if (cached) return cached;
  const fades = new Map();
  const assignments = [];
  const fadeOne = (normal) => {
    if (!fades.has(normal)) {
      const fade = normal.clone();
      fade.transparent = true;
      fade.depthWrite = false;
      fade.forceSinglePass = true;
      fades.set(normal, fade);
    }
    return fades.get(normal);
  };
  model.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const normal = object.material;
    const fade = Array.isArray(normal) ? normal.map(fadeOne) : fadeOne(normal);
    assignments.push({ object, normal, fade });
  });
  const result = { assignments, fades: [...fades.values()] };
  materialCache.set(model, result);
  return result;
}

function activate(model) {
  if (!model) return;
  for (const { object, fade } of materialsFor(model).assignments) object.material = fade;
}

function restore(model) {
  if (!model) return;
  for (const { object, normal } of materialsFor(model).assignments) object.material = normal;
}

function applyFade(model, opacity) {
  if (!model) return;
  for (const mat of materialsFor(model).fades) {
    mat.opacity = opacity;
    mat.depthWrite = opacity > 0.985;
  }
}

/** Draw this exact material state during the real GPU warm-up. */
export function beginWarmFade(model) {
  activate(model);
  applyFade(model, 0.5);
}

export function endWarmFade(model) {
  restore(model);
}

export function initMorph() {
  renderedIndex = state.activeCarIndex;
}

export function isMorphing() {
  return active;
}

export function onMorphComplete(fn) {
  completeHandlers.push(fn);
}

/** Cancel an in-flight swap to its dominant body before retargeting. */
export function morphTo(index) {
  if (active && index === pendingIndex) return;
  if (active) cancel();
  if (index === renderedIndex) return;

  const next = getCarModel(index);
  if (!next) {
    console.warn(`[morph] no model for index ${index}`);
    return;
  }

  outgoing = carMount.children[0] || null;
  incoming = next;
  pendingIndex = index;
  activate(outgoing);
  activate(incoming);
  applyFade(outgoing, 1);
  applyFade(incoming, 0);
  carMount.add(incoming);
  clock = 0;
  active = true;
}

function finish() {
  restore(outgoing);
  restore(incoming);
  setCarModel(incoming);
  setWheels(findWheels(incoming));

  active = false;
  outgoing = null;
  incoming = null;

  if (pendingIndex >= 0) {
    const completedIndex = pendingIndex;
    pendingIndex = -1;
    renderedIndex = completedIndex;
    for (const fn of completeHandlers) fn(completedIndex);
  }
}

function cancel() {
  const keepIncoming = smooth(clock) >= 0.5;
  restore(outgoing);
  restore(incoming);
  const retained = keepIncoming ? incoming : outgoing;
  if (retained) {
    setCarModel(retained);
    setWheels(findWheels(retained));
  }
  if (keepIncoming) renderedIndex = pendingIndex;
  active = false;
  outgoing = null;
  incoming = null;
  pendingIndex = -1;
}

/** Replay resets the route model without changing discovery state. */
export function resetMorph(index = 0) {
  if (active) cancel();
  const model = getCarModel(index);
  if (!model) return;
  setCarModel(model);
  setWheels(findWheels(model));
  renderedIndex = index;
}

function smooth(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function updateMorph(dt) {
  if (!active) return;
  clock = Math.min(1, clock + dt / DURATION);
  const cross = smooth(clock);
  applyFade(outgoing, 1 - cross);
  applyFade(incoming, cross);
  if (clock >= 1) finish();
}
