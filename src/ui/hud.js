/**
 * Sparse Grand Tour HUD.
 *
 * The frame loop is owned by main.js. This module only reflects route position
 * and active-car state; the marker uses an SVG transform attribute so it never
 * causes layout work while the route is moving.
 *
 * Top-left is one consolidated car-identity block (name + headline + spec in a
 * single two-slot crossfade). Top-right is the circuit map with a directional
 * arrow and a completed-route trail. Bottom-left stays empty (a later phase's
 * spinning-car home). The direction cue lives bottom-centre and teaches only
 * the reverse gesture once the car is moving forward.
 */

import * as THREE from 'three';
import { state } from '../core/state.js';
import { getCar } from '../data/cars.js';
import { CHECKPOINT_T, pointAt } from '../scene/trackCurve.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// Keep in step with .hud-route in hud.css (170 px, ~15 % over the original 148).
const MAP_SIZE = 170;
const MAP_PADDING = 9;
const MAP_SAMPLES = 160;
const DIRECTION_DEAD_ZONE = 0.035;
// "Scroll up to reverse" shows once the car moves forward, then retires.
const CUE_HIDE_DELAY = 3000;
// Completed-route trail: strongest right behind the car, easing over this lap
// fraction back to a quiet base opacity.
const TRAIL_FADE_SPAN = 0.22;
const TRAIL_BASE_OPACITY = 0.38;
// Route-tangent probe for the minimap arrow (forward tangent always).
const TANGENT_EPSILON = 0.002;

let initialized = false;
let identitySlots = [];
let visibleIdentitySlot = 0;
let renderedCarIndex = -1;
let routeProject;
let routePointA;
let routePointB;
const routeWorldA = new THREE.Vector3();
const routeWorldB = new THREE.Vector3();
let routeMarker;
let trailSegs = [];
const trailState = []; // last written per-segment state: 'h' (hidden) or opacity string
let lastTrailProgress = NaN;
let writtenRouteX = NaN;
let writtenRouteY = NaN;
let writtenRouteAngle = NaN;
let directionRoot;
let directionTimer = 0;
let cueShown = false;
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

/**
 * Top-left consolidated identity block. Each of the two crossfade slots holds
 * the car name plus the car info (editorial headline + one factual line built
 * only from existing roster data), so name and info always swap in the same
 * pass. "(BoP-dependent)" compresses to "· BoP", which keeps the qualifier;
 * nothing is invented or rounded.
 */
function buildIdentity(root) {
  const copy = element('div', 'hud-identity__copy');
  for (let i = 0; i < 2; i++) {
    const slot = element('div', `hud-identity__slot${i === 0 ? ' is-visible' : ''}`);
    // The inactive slot is only hidden via opacity (the cross-fade needs both slots
    // painted at once), so assistive tech needs aria-hidden kept in sync separately.
    slot.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
    const name = element('div', 'hud-identity__name');
    const headline = element('div', 'hud-identity__headline');
    const spec = element('div', 'hud-identity__spec');
    slot.append(name, headline, spec);
    copy.append(slot);
    identitySlots.push({ slot, name, headline, spec });
  }
  root.classList.add('hud-identity');
  root.append(copy);
}

function specLine(car) {
  const power = car.engine.power;
  const bop = /\s*\(BoP-dependent\)/.test(power);
  const figure = power.replace(/\s*\(BoP-dependent\)/, '');
  return `${car.engine.configuration} · ${figure}${bop ? ' · BoP' : ''}`;
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
  // Completed-route trail: one short segment per map sample, drawn over the
  // base route at the same stroke width. Per-frame work only touches inline
  // opacity/visibility, and only when progress actually changed.
  const done = svgElement('g', { class: 'hud-route__done' });
  for (let i = 0; i < MAP_SAMPLES; i++) {
    const a = routeProject(points[i], { x: 0, y: 0 });
    const b = routeProject(points[i + 1], { x: 0, y: 0 });
    const seg = svgElement('path', {
      class: 'hud-route__done-seg',
      d: `M${a.x.toFixed(2)} ${a.y.toFixed(2)}L${b.x.toFixed(2)} ${b.y.toFixed(2)}`,
    });
    seg.style.visibility = 'hidden';
    done.append(seg);
    trailSegs.push(seg);
  }
  svg.append(done);
  for (const t of CHECKPOINT_T) {
    const projected = routeProject(pointAt(t), { x: 0, y: 0 });
    svg.append(svgElement('circle', { class: 'hud-route__checkpoint', cx: projected.x.toFixed(2), cy: projected.y.toFixed(2), r: 1.35 }));
  }
  // Direction arrow: a small filled chevron (~8 px long in map units) pointing
  // along the route's forward tangent. It lives in a <g> so position and
  // rotation compose in one transform attribute update per frame.
  routeMarker = svgElement('g', { class: 'hud-route__marker' });
  routeMarker.append(svgElement('path', { class: 'hud-route__marker-shape', d: 'M0 -4.6L3.1 3.6L0 1.7L-3.1 3.6Z' }));
  svg.append(routeMarker);
  root.classList.add('hud-route');
  root.append(svg);
}

/**
 * Bottom-centre reverse hint. The start screen already owns the "Scroll to
 * race" prompt, so this cue teaches only the remaining gesture: once the car
 * is moving forward it shows "Scroll up to reverse" for a few seconds, then
 * retires for the session. Reversing before it ever shows retires it unseen.
 */
function buildDirectionCue(root) {
  directionRoot = element('div', 'hud-direction');
  directionRoot.setAttribute('aria-label', 'Scroll up to reverse');
  directionRoot.append(
    element('span', 'hud-direction__arrow', '↑'),
    element('span', 'hud-direction__copy', 'Scroll up to reverse'),
  );
  root.append(directionRoot);
}

function setIdentity(index, immediate = false) {
  const start = `gt3:hudIdentity:start:${++identityMeasureId}`;
  const end = `gt3:hudIdentity:end:${identityMeasureId}`;
  performance.mark(start);
  const car = getCar(index);
  const nextIndex = immediate ? visibleIdentitySlot : 1 - visibleIdentitySlot;
  identitySlots[nextIndex].name.textContent = car.displayName;
  // Car info is written in the same pass as the name (never waits on morph
  // completion, which does not fire on cancellation), so retargets/reversals
  // stay in step — and both live in the same slot, so they fade as one block.
  identitySlots[nextIndex].headline.textContent = car.showcase.headline;
  identitySlots[nextIndex].spec.textContent = specLine(car);
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

function smoothstep01(x) {
  const clamped = x < 0 ? 0 : x > 1 ? 1 : x;
  return clamped * clamped * (3 - 2 * clamped);
}

function updateTrail(progress) {
  if (progress === lastTrailProgress) return;
  lastTrailProgress = progress;
  const count = trailSegs.length;
  for (let i = 0; i < count; i++) {
    const segEnd = (i + 1) / count;
    const behind = progress - segEnd;
    // Strongest right behind the car, easing to the quiet base further back. Only segments whose
    // state changed are written (most sit hidden or at the base opacity), keeping DOM writes per
    // frame to the few segments near the car.
    const state = behind < 0 ? 'h'
      : (TRAIL_BASE_OPACITY + (1 - TRAIL_BASE_OPACITY)
        * smoothstep01(1 - behind / TRAIL_FADE_SPAN)).toFixed(2);
    if (trailState[i] === state) continue;
    const seg = trailSegs[i];
    if (state === 'h') seg.style.visibility = 'hidden';
    else {
      seg.style.opacity = state;
      if (trailState[i] === 'h' || trailState[i] === undefined) seg.style.visibility = 'visible';
    }
    trailState[i] = state;
  }
}

function updateDirectionCue(dt) {
  if (cueUsed || !directionRoot) return;
  const velocity = Number(state.velocity) || 0;
  if (!cueShown) {
    if (velocity < -DIRECTION_DEAD_ZONE) {
      cueUsed = true;
      directionRoot.classList.add('is-dismissed');
      return;
    }
    if (velocity <= DIRECTION_DEAD_ZONE) return;
    cueShown = true;
    directionTimer = 0;
    directionRoot.classList.add('is-visible');
    return;
  }
  directionTimer += dt;
  if (directionTimer >= CUE_HIDE_DELAY / 1000) {
    cueUsed = true;
    directionRoot.classList.remove('is-visible');
    directionRoot.classList.add('is-dismissed');
  }
}

export function initHUD() {
  if (initialized) return;
  const hud = document.querySelector('#hud');
  const topLeft = document.querySelector('#hud-topleft');
  const topRight = document.querySelector('#hud-topright');
  const bottomLeft = document.querySelector('#hud-bottomleft');
  if (!hud || !topLeft || !topRight || !bottomLeft) throw new Error('[hud] Required HUD roots are missing.');
  buildIdentity(topLeft);
  buildRouteMap(topRight);
  // Bottom-centre, clear of the bottom edge row; bottom-left stays empty.
  buildDirectionCue(hud);
  routePointA = { x: 0, y: 0 };
  routePointB = { x: 0, y: 0 };
  initialized = true;
  setIdentity(state.activeCarIndex, true);
}

export function update(dt) {
  if (!initialized) return;
  if (state.activeCarIndex !== renderedCarIndex) setIdentity(state.activeCarIndex);
  routeProject(pointAt(state.progress, routeWorldA), routePointA);
  let ahead = state.progress + TANGENT_EPSILON;
  if (ahead > 1) ahead -= 1;
  routeProject(pointAt(ahead, routeWorldB), routePointB);
  const x = Math.round(routePointA.x * 100) / 100;
  const y = Math.round(routePointA.y * 100) / 100;
  const dx = routePointB.x - routePointA.x;
  const dy = routePointB.y - routePointA.y;
  let angle = writtenRouteAngle;
  if (dx * dx + dy * dy > 1e-10) {
    // The chevron is drawn pointing up (-Y), so the map angle needs +90°.
    angle = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 90) * 2) / 2;
  }
  if (x !== writtenRouteX || y !== writtenRouteY || angle !== writtenRouteAngle) {
    writtenRouteX = x;
    writtenRouteY = y;
    writtenRouteAngle = angle;
    routeMarker.setAttribute('transform', `translate(${x} ${y}) rotate(${angle})`);
  }
  updateTrail(state.progress);
  updateDirectionCue(Math.max(0, Math.min(Number(dt) || 0, 0.1)));
}
