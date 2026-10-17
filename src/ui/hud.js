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
 * spinning-car home).
 */

import * as THREE from 'three';
import { UNLOCKED } from '../core/renderProfile.js';
import { state } from '../core/state.js';
import { formatLapTime } from '../core/lapTimer.js';
import { getCar } from '../data/cars.js';
import { CHECKPOINT_ROUTE_T, GRID_T, GRID_GAP, routeTAt, pointAt } from '../scene/trackCurve.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// Keep in step with .hud-route in hud.css (170 px, ~15 % over the original 148).
const MAP_SIZE = 170;
const MAP_PADDING = 9;
const MAP_SAMPLES = 160;
// Completed-route trail: strongest right behind the car, easing over this lap
// fraction back to a quiet base opacity. Each local SVG gradient is interpolated
// along its own route tangent, never across the map as a screen-space gradient.
const TRAIL_FADE_SPAN = 0.22;
const TRAIL_GRADIENT_STEPS = 48;
const TRAIL_BASE_OPACITY = 0.38;
// Route-tangent probe for the minimap arrow (forward tangent always).
const TANGENT_EPSILON = 0.002;

let timerElement;
let writtenTimer = '';
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
const trailState = [];
let trailBaseBeforeGantry;
let trailBaseAfterGantry;
let trailBaseWholeRoute;
const trailGradientSegs = [];
const trailWorldA = new THREE.Vector3();
const trailWorldB = new THREE.Vector3();
const trailPointA = { x: 0, y: 0 };
const trailPointB = { x: 0, y: 0 };
let lastTrailProgress = NaN;
let writtenRouteX = NaN;
let writtenRouteY = NaN;
let writtenRouteAngle = NaN;
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
  // The completed-route base uses dash intervals on continuous paths. This keeps
  // the yellow section crisp at fractional progress without the accumulated caps
  // and overlap bands caused by one independently stroked path per map sample.
  const done = svgElement('g', { class: 'hud-route__done' });
  if (UNLOCKED) {
    const completedPath = className => {
      const path = svgElement('path', {
        class: className, d, pathLength: '1', 'stroke-dasharray': '0 1',
      });
      path.style.visibility = 'hidden';
      done.append(path);
      return path;
    };
    trailBaseBeforeGantry = completedPath('hud-route__done-base');
    trailBaseAfterGantry = completedPath('hud-route__done-base');
    trailBaseWholeRoute = completedPath('hud-route__done-base');

    // SVG has no path-length gradient paint server. A small, fixed pool of local
    // gradients solves that without rebuilding DOM: every gradient follows one
    // short tangent and interpolates alpha continuously into the next one.
    const defs = svgElement('defs');
    for (let i = 0; i < TRAIL_GRADIENT_STEPS; i++) {
      const gradient = svgElement('linearGradient', {
        id: `hud-route-trail-gradient-${i}`, gradientUnits: 'userSpaceOnUse',
      });
      const from = svgElement('stop', { offset: '0%', class: 'hud-route__trail-stop' });
      const to = svgElement('stop', { offset: '100%', class: 'hud-route__trail-stop' });
      gradient.append(from, to);
      defs.append(gradient);
      const segment = svgElement('path', {
        class: 'hud-route__trail-gradient', stroke: `url(#hud-route-trail-gradient-${i})`,
      });
      segment.style.visibility = 'hidden';
      done.append(segment);
      trailGradientSegs.push({ segment, gradient, from, to });
    }
    svg.append(defs);
  } else {
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
  }
  svg.append(done);
  for (const t of CHECKPOINT_ROUTE_T) {
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

function setTrailInterval(path, start, end) {
  const length = end - start;
  if (length <= 0) {
    path.style.visibility = 'hidden';
    return;
  }
  path.setAttribute('stroke-dasharray', `${length} ${1 - length}`);
  path.setAttribute('stroke-dashoffset', `${-start}`);
  path.style.visibility = 'visible';
}

function updateLockedTrail(progress) {
  if (progress === lastTrailProgress) return;
  lastTrailProgress = progress;
  const count = trailSegs.length;
  for (let i = 0; i < count; i++) {
    const segEnd = (i + 1) / count;
    // Most recent visit of this lap segment along the unwrapped Tour.
    const end = GRID_T + progress * (1 + GRID_GAP);
    const visit = segEnd + Math.floor(end - segEnd);
    const behind = visit < GRID_T ? -1 : (end - visit) / (1 + GRID_GAP);
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

function updateTrail(progress) {
  if (!UNLOCKED) return updateLockedTrail(progress);
  if (progress === lastTrailProgress) return;
  lastTrailProgress = progress;
  const travelled = Math.max(0, Math.min(1, progress));
  // Keep the grid approach and post-gantry lap as separate route intervals.
  // Near completion they meet, at which point one full-route path avoids painting
  // the shared GRID_T..finish section twice.
  const routeEnd = GRID_T + travelled * (1 + GRID_GAP);
  const afterGantry = routeEnd - 1;
  if (routeEnd <= 1) {
    setTrailInterval(trailBaseBeforeGantry, GRID_T, routeEnd);
    setTrailInterval(trailBaseAfterGantry, 0, 0);
    setTrailInterval(trailBaseWholeRoute, 0, 0);
  } else if (afterGantry < GRID_T) {
    setTrailInterval(trailBaseBeforeGantry, GRID_T, 1);
    setTrailInterval(trailBaseAfterGantry, 0, afterGantry);
    setTrailInterval(trailBaseWholeRoute, 0, 0);
  } else {
    setTrailInterval(trailBaseBeforeGantry, 0, 0);
    setTrailInterval(trailBaseAfterGantry, 0, 0);
    setTrailInterval(trailBaseWholeRoute, 0, 1);
  }

  if (travelled <= 0) {
    for (const { segment } of trailGradientSegs) segment.style.visibility = 'hidden';
    return;
  }

  const fadeStart = Math.max(0, travelled - TRAIL_FADE_SPAN);
  const fadeLength = travelled - fadeStart;
  for (let i = 0; i < trailGradientSegs.length; i++) {
    const aTravel = fadeStart + fadeLength * i / trailGradientSegs.length;
    const bTravel = fadeStart + fadeLength * (i + 1) / trailGradientSegs.length;
    routeProject(pointAt(routeTAt(aTravel), trailWorldA), trailPointA);
    routeProject(pointAt(routeTAt(bTravel), trailWorldB), trailPointB);
    const fromOpacity = smoothstep01(1 - (travelled - aTravel) / TRAIL_FADE_SPAN);
    const toOpacity = smoothstep01(1 - (travelled - bTravel) / TRAIL_FADE_SPAN);
    const { segment, gradient, from, to } = trailGradientSegs[i];
    gradient.setAttribute('x1', trailPointA.x);
    gradient.setAttribute('y1', trailPointA.y);
    gradient.setAttribute('x2', trailPointB.x);
    gradient.setAttribute('y2', trailPointB.y);
    from.setAttribute('stop-opacity', fromOpacity);
    to.setAttribute('stop-opacity', toOpacity);
    segment.setAttribute('d', `M${trailPointA.x} ${trailPointA.y}L${trailPointB.x} ${trailPointB.y}`);
    segment.style.visibility = 'visible';
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
  timerElement = element('div', 'hud-lap-timer', formatLapTime(state.lapElapsedMs));
  timerElement.setAttribute('aria-label', 'Tour elapsed time');
  document.querySelector('#hud').append(timerElement);
  routePointA = { x: 0, y: 0 };
  routePointB = { x: 0, y: 0 };
  initialized = true;
  setIdentity(state.activeCarIndex, true);
}

export function update() {
  if (!initialized) return;
  const timerText = formatLapTime(state.lapElapsedMs);
  if (timerText !== writtenTimer) { timerElement.textContent = timerText; writtenTimer = timerText; }
  if (state.activeCarIndex !== renderedCarIndex) setIdentity(state.activeCarIndex);
  routeProject(pointAt(routeTAt(state.progress), routeWorldA), routePointA);
  let ahead = routeTAt(state.progress) + TANGENT_EPSILON;
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
}
