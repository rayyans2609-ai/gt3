/**
 * Persistent race instrumentation.
 *
 * The frame loop is owned by main.js. This module only reflects central state and
 * accepts the coin-approach cue through setApproach(), keeping scene/UI ownership
 * deliberately separate.
 */

import { state } from '../core/state.js';
import { CARS, getCar } from '../data/cars.js';
import { COIN_T, TRACK_LENGTH, pointAt } from '../scene/trackCurve.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAP_SIZE = 160;
const MAP_PADDING = 10;
const MAP_SAMPLES = 140;

let initialized = false;
let identitySlots = [];
let visibleIdentitySlot = 0;
let renderedCarIndex = -1;
let unlockedValue = null;
let distanceValue = null;
let speedFill = null;
let routeCarMarker = null;
let routeCoinMarkers = [];
let routeProject = null;
let approachRoot = null;
let approachName = null;
let approachFill = null;

let displayedSpeed = 0;
let displayedApproach = 0;
let approach = null;
let unlockSignature = '';

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeSvgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

function buildIdentity(root) {
  const accent = makeElement('span', 'hud-identity__accent');
  const copy = makeElement('div', 'hud-identity__copy');

  for (let i = 0; i < 2; i++) {
    const slot = makeElement('div', `hud-identity__slot${i === 0 ? ' is-visible' : ''}`);
    const manufacturer = makeElement('div', 'hud-label hud-identity__manufacturer');
    const name = makeElement('div', 'hud-identity__name');
    slot.append(manufacturer, name);
    copy.append(slot);
    identitySlots.push({ slot, manufacturer, name });
  }

  root.classList.add('hud-corner', 'hud-identity');
  root.append(accent, copy);
  root._brandAccent = accent;
}

function buildUnlocked(root) {
  const label = makeElement('div', 'hud-label', 'Cars unlocked');
  unlockedValue = makeElement('div', 'hud-unlocked__value', `00 / ${String(CARS.length).padStart(2, '0')}`);
  root.classList.add('hud-corner', 'hud-unlocked');
  root.append(label, unlockedValue);
}

function buildTelemetry(root) {
  const distance = makeElement('div', 'hud-telemetry__distance');
  const distanceLabel = makeElement('span', 'hud-label', 'Distance');
  distanceValue = makeElement('span', 'hud-telemetry__number', '0000 M');
  distance.append(distanceLabel, distanceValue);

  const speed = makeElement('div', 'hud-telemetry__speed');
  const speedLabel = makeElement('span', 'hud-label', 'Speed');
  const speedTrack = makeElement('span', 'hud-speedbar');
  speedFill = makeElement('span', 'hud-speedbar__fill');
  speedTrack.append(speedFill);
  speed.append(speedLabel, speedTrack);

  root.classList.add('hud-corner', 'hud-telemetry');
  root.append(distance, speed);
}

function buildRouteMap(root) {
  const points = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i <= MAP_SAMPLES; i++) {
    const point = pointAt(i / MAP_SAMPLES);
    points.push({ x: point.x, z: point.z });
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const scale = (MAP_SIZE - MAP_PADDING * 2) / Math.max(spanX, spanZ);
  const usedWidth = spanX * scale;
  const usedHeight = spanZ * scale;
  const offsetX = (MAP_SIZE - usedWidth) * 0.5;
  const offsetY = (MAP_SIZE - usedHeight) * 0.5;

  routeProject = (point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (maxZ - point.z) * scale,
  });

  const svg = makeSvgElement('svg', {
    class: 'hud-route__svg',
    viewBox: `0 0 ${MAP_SIZE} ${MAP_SIZE}`,
    role: 'img',
    'aria-label': 'Circuit route and collectible positions',
  });
  const pathData = points.map((point, index) => {
    const projected = routeProject(point);
    return `${index === 0 ? 'M' : 'L'}${projected.x.toFixed(2)} ${projected.y.toFixed(2)}`;
  }).join(' ');
  svg.append(makeSvgElement('path', { class: 'hud-route__path', d: pathData }));

  routeCoinMarkers = COIN_T.map((t, index) => {
    const projected = routeProject(pointAt(t));
    const marker = makeSvgElement('circle', {
      class: 'hud-route__coin',
      cx: projected.x.toFixed(2),
      cy: projected.y.toFixed(2),
      r: 2,
      'data-index': index,
    });
    svg.append(marker);
    return marker;
  });

  const initial = routeProject(pointAt(state.progress));
  routeCarMarker = makeSvgElement('circle', {
    class: 'hud-route__car',
    cx: initial.x.toFixed(2),
    cy: initial.y.toFixed(2),
    r: 2.8,
  });
  svg.append(routeCarMarker);

  const label = makeElement('div', 'hud-label hud-route__label', 'Route');
  root.classList.add('hud-corner', 'hud-route');
  root.append(label, svg);
}

function buildApproach(root) {
  const label = makeElement('div', 'hud-label', 'Incoming');
  approachName = makeElement('div', 'hud-approach__name');
  const track = makeElement('div', 'hud-approach__track');
  approachFill = makeElement('span', 'hud-approach__fill');
  track.append(approachFill);
  root.classList.add('hud-approach');
  root.setAttribute('aria-hidden', 'true');
  root.append(label, approachName, track);
  approachRoot = root;
}

function setIdentity(index, immediate = false) {
  const car = getCar(index);
  const nextSlotIndex = immediate ? visibleIdentitySlot : 1 - visibleIdentitySlot;
  const next = identitySlots[nextSlotIndex];
  next.manufacturer.textContent = car.manufacturer;
  next.name.textContent = car.model;

  if (!immediate) {
    identitySlots[visibleIdentitySlot].slot.classList.remove('is-visible');
    next.slot.classList.add('is-visible');
    visibleIdentitySlot = nextSlotIndex;
  }

  const identityRoot = document.querySelector('#hud-topleft');
  if (identityRoot?._brandAccent) identityRoot._brandAccent.style.backgroundColor = car.brandColor;
  renderedCarIndex = car.index;
}

function updateUnlocks() {
  const unlocked = state.unlocked instanceof Set ? state.unlocked : new Set();
  unlockedValue.textContent = `${String(unlocked.size).padStart(2, '0')} / ${String(CARS.length).padStart(2, '0')}`;
  for (let i = 0; i < routeCoinMarkers.length; i++) {
    routeCoinMarkers[i].classList.toggle('is-unlocked', unlocked.has(i));
  }
}

/** Populate the existing HUD roots. Safe to call more than once. */
export function initHUD() {
  if (initialized) return;

  const topLeft = document.querySelector('#hud-topleft');
  const topRight = document.querySelector('#hud-topright');
  const bottomLeft = document.querySelector('#hud-bottomleft');
  const routeMap = document.querySelector('#hud-routemap');
  const approachBadge = document.querySelector('#hud-approach');
  if (!topLeft || !topRight || !bottomLeft || !routeMap || !approachBadge) {
    throw new Error('[hud] Required HUD roots are missing from the document.');
  }

  buildIdentity(topLeft);
  buildUnlocked(topRight);
  buildTelemetry(bottomLeft);
  buildRouteMap(routeMap);
  buildApproach(approachBadge);

  initialized = true;
  setIdentity(state.activeCarIndex, true);
  updateUnlocks();
  unlockSignature = [...state.unlocked].sort((a, b) => a - b).join(',');
  setApproach(approach);
}

/** Receive the scene-owned nearest-coin cue without importing the coin module. */
export function setApproach(value) {
  if (value === null || value === undefined) {
    approach = null;
    if (approachRoot) {
      approachRoot.classList.remove('is-visible');
      approachRoot.setAttribute('aria-hidden', 'true');
    }
    return;
  }

  const index = Math.max(0, Math.min(CARS.length - 1, Math.trunc(Number(value.index) || 0)));
  const proximity = Math.max(0, Math.min(1, Number(value.proximity) || 0));
  approach = { index, proximity };

  if (approachRoot) {
    approachName.textContent = getCar(index).displayName;
    approachRoot.classList.add('is-visible');
    approachRoot.setAttribute('aria-hidden', 'false');
  }
}

/** Reflect current state. Called by main.js's single animation loop. */
export function update(dt) {
  if (!initialized) return;

  const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
  if (state.activeCarIndex !== renderedCarIndex) setIdentity(state.activeCarIndex);

  const metres = Math.max(0, Math.round(Math.max(0, Math.min(1, state.progress)) * TRACK_LENGTH));
  distanceValue.textContent = `${String(metres).padStart(4, '0')} M`;

  const speedTarget = Math.max(0, Math.min(1, Number(state.speed01) || 0));
  displayedSpeed += (speedTarget - displayedSpeed) * (1 - Math.exp(-safeDt * 7));
  speedFill.style.transform = `scaleX(${displayedSpeed.toFixed(4)})`;

  const projected = routeProject(pointAt(state.progress));
  routeCarMarker.setAttribute('cx', projected.x.toFixed(2));
  routeCarMarker.setAttribute('cy', projected.y.toFixed(2));

  const currentUnlocked = state.unlocked instanceof Set ? state.unlocked : new Set();
  const nextUnlockSignature = [...currentUnlocked].sort((a, b) => a - b).join(',');
  if (nextUnlockSignature !== unlockSignature) {
    unlockSignature = nextUnlockSignature;
    updateUnlocks();
  }

  const approachTarget = approach ? approach.proximity : 0;
  displayedApproach += (approachTarget - displayedApproach) * (1 - Math.exp(-safeDt * 9));
  approachFill.style.transform = `scaleX(${displayedApproach.toFixed(4)})`;
}
