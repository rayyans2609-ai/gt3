/**
 * Sparse Grand Tour HUD.
 *
 * The frame loop is owned by main.js. This module only reflects route position
 * and active-car state; the marker uses an SVG transform attribute so it never
 * causes layout work while the route is moving.
 */

import * as THREE from 'three';
import { state } from '../core/state.js';
import { getCar } from '../data/cars.js';
import { CHECKPOINT_T, pointAt } from '../scene/trackCurve.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAP_SIZE = 148;
const MAP_PADDING = 9;
const MAP_SAMPLES = 160;
const DIRECTION_DEAD_ZONE = 0.035;
const CUE_HIDE_DELAY = 1400;

let initialized = false;
let identitySlots = [];
let visibleIdentitySlot = 0;
let renderedCarIndex = -1;
let routeProject;
let routePoint;
const routeWorldPoint = new THREE.Vector3();
let routeMarker;
let writtenRouteX = NaN;
let writtenRouteY = NaN;
let directionRoot;
let directionTimer = 0;
let cueUsed = false;
let identityMeasureId = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function buildIdentity(root) {
  const copy = element('div', 'hud-identity__copy');
  for (let i = 0; i < 2; i++) {
    const slot = element('div', `hud-identity__slot${i === 0 ? ' is-visible' : ''}`);
    // The inactive slot is only hidden via opacity (the cross-fade needs both slots
    // painted at once), so assistive tech needs aria-hidden kept in sync separately.
    slot.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
    const name = element('div', 'hud-identity__name');
    slot.append(name);
    copy.append(slot);
    identitySlots.push({ slot, name });
  }
  root.classList.add('hud-identity');
  root.append(copy);
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
  const scale = (MAP_SIZE - MAP_PADDING * 2) / Math.max(maxX - minX, maxZ - minZ, 1);
  const offsetX = (MAP_SIZE - (maxX - minX) * scale) * 0.5;
  const offsetY = (MAP_SIZE - (maxZ - minZ) * scale) * 0.5;
  routeProject = (point, target) => {
    target.x = offsetX + (point.x - minX) * scale;
    target.y = offsetY + (maxZ - point.z) * scale;
    return target;
  };

  const svg = svgElement('svg', {
    class: 'hud-route__svg', viewBox: `0 0 ${MAP_SIZE} ${MAP_SIZE}`,
    role: 'img', 'aria-label': 'Circuit route and checkpoint positions',
  });
  const d = points.map((point, index) => {
    const projected = routeProject(point, { x: 0, y: 0 });
    return `${index === 0 ? 'M' : 'L'}${projected.x.toFixed(2)} ${projected.y.toFixed(2)}`;
  }).join(' ');
  svg.append(svgElement('path', { class: 'hud-route__path', d }));
  for (const t of CHECKPOINT_T) {
    const projected = routeProject(pointAt(t), { x: 0, y: 0 });
    svg.append(svgElement('circle', { class: 'hud-route__checkpoint', cx: projected.x.toFixed(2), cy: projected.y.toFixed(2), r: 1.35 }));
  }
  routeMarker = svgElement('circle', { class: 'hud-route__marker', cx: 0, cy: 0, r: 2.7 });
  svg.append(routeMarker);
  root.classList.add('hud-route');
  root.append(svg);
}

function buildDirectionCue(root) {
  directionRoot = element('div', 'hud-direction is-primer');
  directionRoot.setAttribute('aria-label', 'Scroll down to drive forward. Scroll up to reverse.');
  directionRoot.append(
    element('span', 'hud-direction__arrow', '↑'), element('span', 'hud-direction__copy', 'reverse'),
    element('span', 'hud-direction__divider', '/'),
    element('span', 'hud-direction__copy', 'forward'), element('span', 'hud-direction__arrow', '↓'),
  );
  root.classList.add('hud-direction-host');
  root.append(directionRoot);
}

function setIdentity(index, immediate = false) {
  const start = `gt3:hudIdentity:start:${++identityMeasureId}`;
  const end = `gt3:hudIdentity:end:${identityMeasureId}`;
  performance.mark(start);
  const car = getCar(index);
  const nextIndex = immediate ? visibleIdentitySlot : 1 - visibleIdentitySlot;
  identitySlots[nextIndex].name.textContent = car.displayName;
  if (!immediate) {
    identitySlots[visibleIdentitySlot].slot.classList.remove('is-visible');
    identitySlots[visibleIdentitySlot].slot.setAttribute('aria-hidden', 'true');
    identitySlots[nextIndex].slot.classList.add('is-visible');
    identitySlots[nextIndex].slot.setAttribute('aria-hidden', 'false');
    visibleIdentitySlot = nextIndex;
  }
  renderedCarIndex = car.index;
  performance.mark(end);
  performance.measure('gt3:hudIdentity', start, end);
  performance.clearMarks(start);
  performance.clearMarks(end);
}

function updateDirectionCue(dt) {
  if (cueUsed) return;
  const velocity = Number(state.velocity) || 0;
  if (directionTimer === 0) {
    if (Math.abs(velocity) <= DIRECTION_DEAD_ZONE) return;
    directionRoot.classList.toggle('is-forward', velocity > 0);
    directionRoot.classList.toggle('is-reverse', velocity < 0);
  }
  directionTimer += dt;
  if (directionTimer >= CUE_HIDE_DELAY / 1000) {
    cueUsed = true;
    directionRoot.classList.add('is-dismissed');
  }
}

export function initHUD() {
  if (initialized) return;
  const topLeft = document.querySelector('#hud-topleft');
  const topRight = document.querySelector('#hud-topright');
  const bottomLeft = document.querySelector('#hud-bottomleft');
  if (!topLeft || !topRight || !bottomLeft) throw new Error('[hud] Required HUD roots are missing.');
  buildIdentity(topLeft);
  buildRouteMap(topRight);
  buildDirectionCue(bottomLeft);
  routePoint = { x: 0, y: 0 };
  initialized = true;
  setIdentity(state.activeCarIndex, true);
}

export function update(dt) {
  if (!initialized) return;
  if (state.activeCarIndex !== renderedCarIndex) setIdentity(state.activeCarIndex);
  routeProject(pointAt(state.progress, routeWorldPoint), routePoint);
  const x = Math.round(routePoint.x * 100) / 100;
  const y = Math.round(routePoint.y * 100) / 100;
  if (x !== writtenRouteX || y !== writtenRouteY) {
    writtenRouteX = x;
    writtenRouteY = y;
    routeMarker.setAttribute('transform', `translate(${x} ${y})`);
  }
  updateDirectionCue(Math.max(0, Math.min(Number(dt) || 0, 0.1)));
}
