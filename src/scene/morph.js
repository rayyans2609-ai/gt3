/** Short body-only crossfade, with the historical emissive pulse as an option. */
import * as THREE from 'three';
import { state } from '../core/state.js';
import { CARS } from '../data/cars.js';
import { carMount, setCarModel, setWheels } from './carRig.js';
import { getCarModel, findWheels } from './cars.js';

const DURATION = 0.56;
export const swapTreatment = new URLSearchParams(location.search).get('swap') === 'pulse'
  ? 'pulse' : 'crossfade';
const PEAK_AT = 0.40 / 0.85; // Historical pulse crest, normalized to today's duration.
const pulseColors = CARS.map(car => new THREE.Color(car.brandColor)
  .lerp(new THREE.Color(0xffe9c0), 0.55));
const materialCache = new WeakMap();
let measureId = 0;

function beginMeasure(name) {
  const start = `gt3:${name}:start:${++measureId}`;
  const end = `gt3:${name}:end:${measureId}`;
  performance.mark(start);
  return () => {
    performance.mark(end);
    performance.measure(`gt3:${name}`, start, end);
    performance.clearMarks(start);
    performance.clearMarks(end);
  };
}

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
  const finishMeasure = beginMeasure('materialsFor:first');
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
  const result = { assignments, fades: [...fades.values()],
    emission: [...fades.values()].filter(mat => mat.emissive).map(mat => ({
      mat, color: mat.emissive.clone(), intensity: mat.emissiveIntensity,
    })) };
  materialCache.set(model, result);
  finishMeasure();
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

function applyFade(model, opacity, glow = 0, glowColor = pulseColors[0]) {
  if (!model) return;
  for (const mat of materialsFor(model).fades) {
    mat.opacity = opacity;
    mat.depthWrite = opacity > 0.985;
  }
  if (swapTreatment === 'pulse') {
    // Same half-sine, brand/warm-white mix and intensity law as 1864cbe^,
    // using cached fade materials; opaque originals are never modified.
    for (const { mat, color, intensity } of materialsFor(model).emission) {
      mat.emissive.copy(color).lerp(glowColor, glow);
      mat.emissiveIntensity = intensity + glow * 2.4;
    }
  }
}

/** Draw this exact material state during the real GPU warm-up. */
export function beginWarmFade(model) {
  activate(model);
  applyFade(model, 0.5, swapTreatment === 'pulse' ? 1 : 0);
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
  if ((active && index === pendingIndex) || (!active && index === renderedIndex)) return;
  const finishMeasure = beginMeasure('morphTo');
  try {
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
  } finally { finishMeasure(); }
}

function finish() {
  const finishMeasure = beginMeasure('morphFinish');
  try {
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
  } finally { finishMeasure(); }
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
  const pulseT = clock <= PEAK_AT ? clock / PEAK_AT * 0.5 :
    0.5 + (clock - PEAK_AT) / (1 - PEAK_AT) * 0.5;
  const glow = swapTreatment === 'pulse' ? Math.sin(Math.PI * pulseT) : 0;
  const color = pulseColors[pendingIndex];
  applyFade(outgoing, 1 - cross, glow, color);
  applyFade(incoming, cross, glow, color);
  if (clock >= 1) finish();
}
