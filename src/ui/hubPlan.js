/**
 * hubPlan.js — the Grand Tour circuit as the Hub's hero object (direction "plan").
 *
 * GT3's own circuit, drawn like an architect's plan: two hairline road edges, the start line,
 * nine checkpoint ticks. It is an orthographic projection through the Grand Tour camera's own
 * axes (fixed yaw/pitch, ARCHITECTURE "Grand Tour systems"), so the drawing already sees the
 * circuit the way the Tour will. That makes the START RACE moment literal: the plan dives onto
 * the visitor's place on the route, its two lines land on the real road edges, and the live
 * frame takes over underneath (SPEC §25 "transitions the Hub composition into the Grand Tour's
 * opening camera position"). Returning plays the same move backwards.
 *
 * The drawing doubles as the loading indicator (SPEC §25): it is drawn as far as the route is
 * ready. Checkpoints carry the Cars view (SPEC §5, §26): discovered cars by name, the rest `?`.
 *
 * Geometry and screen projection only. No WebGL; the SVG costs nothing at rest.
 */

import { CHECKPOINT_ROUTE_T, offsetPointAt, routeTAt } from '../scene/trackCurve.js';
import { CARS } from '../data/cars.js';
import { gsap, reducedMotion } from './motion.js';
import { fitSimilarity, perspectiveMix, preparePerspective, perspectivePoint, perspectivePath } from './hubPlanProjection.js';

const SVG = 'http://www.w3.org/2000/svg';
const SAMPLES = 900;
const HALF_WIDTH_M = 8; // nominal road half-width for the drawing (the real road varies)
const TICK_OUT_M = 9; // checkpoint ticks reach past the road edges

let svg;
let world;
let labels;
let edgeL;
let edgeR;
let lap;
let ticks = [];
let startMark;
let here;
let carLabels = [];
let leader;
let leaderTween = null;
let basis = null;
let bounds = null;
let frameEl = null;
let rest = { s: 1, r: 0, x: 0, y: 0 };
let view = { s: 1, r: 0, x: 0, y: 0 };
let drawn = 0;
let drawTween = null;
let lapTween = null;
let zoomTween = null;
let labelsOn = false;
let routeT = null;
let shapes = [];
let perspective = null;
let pathsDeformed = false;
const pathScratch = { x: 0, y: 0 };

function node(tag, attrs = {}, parent) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.append(el);
  return el;
}

function makeBasis(yawDeg, pitchDeg) {
  const yaw = yawDeg * Math.PI / 180;
  const pitch = pitchDeg * Math.PI / 180;
  return {
    right: [Math.cos(yaw), 0, Math.sin(yaw)],
    up: [Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch)],
  };
}

/** World point → plan coordinates (metres in the camera's image plane, y down). */
function toPlan(p) {
  return {
    x: p.x * basis.right[0] + p.y * basis.right[1] + p.z * basis.right[2],
    y: -(p.x * basis.up[0] + p.y * basis.up[1] + p.z * basis.up[2]),
  };
}

// The same route geometry main.js projects through the live camera (offsetPointAt).
function planAt(t, lateral = 0) {
  return toPlan(offsetPointAt(t, lateral, 0));
}

function pathFor(lateral) {
  let d = '';
  const points = [], samples = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const p = planAt(i / SAMPLES, lateral);
    points.push(p);
    samples.push({ t: i / SAMPLES, lateral, edge: Math.sign(lateral) });
    d += `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    if (bounds) {
      bounds.minX = Math.min(bounds.minX, p.x); bounds.maxX = Math.max(bounds.maxX, p.x);
      bounds.minY = Math.min(bounds.minY, p.y); bounds.maxY = Math.max(bounds.maxY, p.y);
    }
  }
  return { d: `${d}Z`, points, samples, closed: true };
}

function addPath(lateral, className) {
  const shape = pathFor(lateral);
  shape.el = node('path', { class: className, d: shape.d }, world);
  shapes.push(shape);
  return shape.el;
}

function restorePaths() {
  if (!pathsDeformed) return;
  for (const shape of shapes) shape.el.setAttribute('d', shape.d);
  pathsDeformed = false;
}

function writeView(v = view) {
  const c = Math.cos(v.r) * v.s;
  const s = Math.sin(v.r) * v.s;
  world.setAttribute('transform', `matrix(${c} ${s} ${-s} ${c} ${v.x} ${v.y})`);
  if (perspective?.mix > 0) {
    for (const shape of shapes) {
      if (shape.el === lap) continue; // the hover lap has faded out before perspective starts
      shape.el.setAttribute('d', perspectivePath(shape.projected, perspective.mix, pathScratch, shape.closed));
    }
    pathsDeformed = true;
  } else restorePaths();
  placeLabels(v);
}

function screenOf(p, v = view) {
  const c = Math.cos(v.r) * v.s;
  const s = Math.sin(v.r) * v.s;
  return { x: c * p.x - s * p.y + v.x, y: s * p.x + c * p.y + v.y };
}

/** Labels live in screen space so type never scales with the drawing. */
function placeLabels(v = view) {
  const centre = screenOf({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }, v);
  for (const label of carLabels) {
    const outer = screenOf(label.outer, v);
    const dx = outer.x - centre.x;
    const dy = outer.y - centre.y;
    const len = Math.hypot(dx, dy) || 1;
    label.el.setAttribute('x', (outer.x + dx / len * 10).toFixed(1));
    label.el.setAttribute('y', (outer.y + dy / len * 10 + 4).toFixed(1));
    label.el.setAttribute('text-anchor', dx >= 0 ? 'start' : 'end');
  }
  let startAt = startMark.at, startAhead = startMark.ahead;
  let startVisible = true;
  if (perspective) {
    startVisible = perspectivePoint(perspective.markers, 0, perspective.mix, perspective.start);
    perspectivePoint(perspective.markers, 1, perspective.mix, perspective.ahead);
    startAt = perspective.start; startAhead = perspective.ahead;
  }
  startMark.el.setAttribute('visibility', startVisible ? 'visible' : 'hidden');
  const s0 = screenOf(startAt, v);
  const s1 = screenOf(startAhead, v);
  const deg = Math.atan2(s1.y - s0.y, s1.x - s0.x) * 180 / Math.PI;
  startMark.el.setAttribute('transform', `translate(${s0.x.toFixed(1)} ${s0.y.toFixed(1)}) rotate(${deg.toFixed(2)})`);
  if (routeT !== null) {
    let at = planAt(routeT);
    if (perspective) {
      perspectivePoint(perspective.markers, 2, perspective.mix, perspective.here);
      at = perspective.here;
    }
    const h = screenOf(at, v);
    here.setAttribute('cx', h.x.toFixed(1));
    here.setAttribute('cy', h.y.toFixed(1));
  }
}

/** Fit the plan into its frame box (the composition's slot for it). */
function layout() {
  if (!frameEl || !bounds) return;
  const box = frameEl.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return; // hidden: keep the last real layout
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const s = Math.min(box.width / w, box.height / h);
  rest = {
    s,
    r: 0,
    x: box.left + (box.width - w * s) / 2 - bounds.minX * s,
    y: box.top + (box.height - h * s) / 2 - bounds.minY * s,
  };
  svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  if (!zoomTween) { view = { ...rest }; writeView(); }
}

function renderTicks() {
  ticks.forEach((tick) => {
    tick.el.classList.toggle('is-drawn', drawn >= tick.t - 1e-4);
  });
  startMark.el.classList.toggle('is-drawn', drawn > 0);
}

function setDrawn(value) {
  drawn = value;
  const pct = `${(value * 100).toFixed(2)}%`;
  gsap.set([edgeL, edgeR], { drawSVG: `0% ${pct}` });
  renderTicks();
}

export function buildPlan(container, frame, { yawDeg = 75, pitchDeg = 52 } = {}) {
  basis = makeBasis(yawDeg, pitchDeg);
  bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  frameEl = frame;
  svg = node('svg', { class: 'hub-plan', 'aria-hidden': 'true', focusable: 'false' });
  world = node('g', { class: 'hub-plan__world' }, svg);
  labels = node('g', { class: 'hub-plan__labels' }, svg);
  shapes = [];
  pathsDeformed = false;
  edgeL = addPath(-HALF_WIDTH_M, 'hub-plan__edge');
  edgeR = addPath(HALF_WIDTH_M, 'hub-plan__edge');
  lap = addPath(0, 'hub-plan__lap');

  // Checkpoint ticks: car i+1 is discovered at CHECKPOINT_ROUTE_T[i] (Lexus starts the Tour).
  ticks = CHECKPOINT_ROUTE_T.map((t, i) => {
    const a = planAt(t, -HALF_WIDTH_M - TICK_OUT_M);
    const b = planAt(t, HALF_WIDTH_M + TICK_OUT_M);
    const d = `M${a.x} ${a.y}L${b.x} ${b.y}`;
    const el = node('path', { class: 'hub-plan__tick', d }, world);
    shapes.push({ el, d, points: [a, b], samples: [
      { t, lateral: -HALF_WIDTH_M - TICK_OUT_M, edge: -1, edgeOffset: TICK_OUT_M },
      { t, lateral: HALF_WIDTH_M + TICK_OUT_M, edge: 1, edgeOffset: TICK_OUT_M },
    ] });
    return { t, el, car: i + 1, a, b };
  });

  // Start/finish: a small checker block in screen space, aligned to the road.
  const s0 = planAt(0);
  const s1 = planAt(0.002);
  const g = node('g', { class: 'hub-plan__start' }, labels);
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 6; row++) {
      if ((col + row) % 2) continue;
      node('rect', { x: col * 3 - 3, y: row * 3 - 9, width: 3, height: 3 }, g);
    }
  }
  node('rect', { class: 'hub-plan__start-frame', x: -3, y: -9, width: 6, height: 18 }, g);
  startMark = { el: g, at: s0, ahead: s1 };

  // Car labels for the Cars view: Lexus at the start, the others at their checkpoints.
  const labelAt = (car, t) => {
    const a = planAt(t, -HALF_WIDTH_M - TICK_OUT_M);
    const b = planAt(t, HALF_WIDTH_M + TICK_OUT_M);
    return { car, t, a, b, outer: a, el: node('text', { class: 'hub-plan__car' }, labels) };
  };
  carLabels = [labelAt(0, 0), ...ticks.map((tick) => labelAt(tick.car, tick.t))];
  // Choose the tick end that points away from the circuit's middle for each label.
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  for (const label of carLabels) {
    const da = Math.hypot(label.a.x - cx, label.a.y - cy);
    const db = Math.hypot(label.b.x - cx, label.b.y - cy);
    label.outer = da > db ? label.a : label.b;
  }

  here = node('circle', { class: 'hub-plan__here', r: 3.5, cx: -10, cy: -10 }, labels);
  leader = node('path', { class: 'hub-plan__leader', d: 'M0 0' }, labels);
  container.append(svg);
  layout();
  setDrawn(0);
  gsap.set(lap, { drawSVG: '0% 0%' });
  return svg;
}

export function relayoutPlan() { layout(); }

/** Draw the circuit as far as the route is prepared (SPEC §25 loading in the hero). */
export function drawToProgress(progress, { animate = true } = {}) {
  const target = Math.min(1, Math.max(0, progress));
  drawTween?.kill();
  if (!animate || reducedMotion.matches) { setDrawn(target); return null; }
  const proxy = { v: drawn };
  drawTween = gsap.to(proxy, {
    v: target,
    duration: target >= 1 && drawn < 0.6 ? 1.7 : 0.45,
    ease: target >= 1 ? 'power2.inOut' : 'gt3',
    onUpdate: () => setDrawn(proxy.v),
  });
  return drawTween;
}

export function eraseDrawing() {
  drawTween?.kill();
  setDrawn(0);
}

/**
 * A hairline from START RACE to the saved route marker (or the grid for a fresh Tour).
 * Resolve the endpoint on every hover, after setRoutePosition has restored persisted progress.
 */
export function startLeader(on, from) {
  leaderTween?.kill();
  if (reducedMotion.matches || drawn < 1) { gsap.set(leader, { opacity: 0 }); return; }
  if (on && from) {
    const s0 = screenOf(routeT === null ? startMark.at : planAt(routeT));
    const elbowY = Math.max(s0.y + 24, from.y - 40);
    leader.setAttribute('d', `M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${from.x.toFixed(1)} ${elbowY.toFixed(1)}L${s0.x.toFixed(1)} ${s0.y.toFixed(1)}`);
    gsap.set(leader, { opacity: 1 });
    leaderTween = gsap.fromTo(leader, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: 0.42, ease: 'gt3.out' });
  } else {
    leaderTween = gsap.to(leader, { opacity: 0, duration: 0.2, ease: 'gt3' });
  }
}

/** One light lap while START RACE is under the pointer: a preview of the drive. */
export function lapLight(on) {
  if (reducedMotion.matches || drawn < 1) return;
  if (on) {
    if (lapTween) return;
    gsap.set(lap, { opacity: 1 });
    lapTween = gsap.fromTo(lap, { drawSVG: '0% 0%' }, {
      keyframes: [{ drawSVG: '0% 6%', duration: 0.25, ease: 'none' }, { drawSVG: '94% 100%', duration: 2.3, ease: 'none' },
        { drawSVG: '100% 100%', duration: 0.25, ease: 'none' }],
      repeat: -1,
    });
  } else {
    lapTween?.kill();
    lapTween = null;
    gsap.to(lap, { opacity: 0, duration: 0.3, ease: 'gt3', onComplete: () => gsap.set(lap, { drawSVG: '0% 0%' }) });
  }
}

/** Discovery on the plan (SPEC §26 monotonic): found ticks in ink, names in the Cars view. */
export function renderDiscovery(unlocked) {
  for (const tick of ticks) tick.el.classList.toggle('is-found', unlocked.has(tick.car));
  for (const label of carLabels) {
    const car = CARS[label.car];
    const found = unlocked.has(label.car);
    label.el.textContent = found ? `${car.manufacturer} ${car.model}` : '?';
    label.el.classList.toggle('is-found', found);
  }
}

export function showCarLabels(on) {
  labelsOn = on;
  const els = carLabels.map((label) => label.el);
  gsap.killTweensOf(els);
  if (reducedMotion.matches) { gsap.set(els, { opacity: on ? 1 : 0 }); return; }
  gsap.to(els, on
    ? { opacity: 1, duration: 0.36, ease: 'gt3', stagger: { each: 0.035, from: 'start' } }
    : { opacity: 0, duration: 0.16, ease: 'gt3' });
}

export function carLabelsShown() { return labelsOn; }

/** Where the visitor is on the route (progress 0..1), or null to hide the marker. */
export function setRoutePosition(progress) {
  routeT = progress === null || progress <= 0 ? null : routeTAt(progress);
  here.classList.toggle('is-shown', routeT !== null);
  placeLabels();
}

/** Sample route positions around the visitor's place for the fit. */
export function fitSamples(progress) {
  const t0 = routeTAt(progress);
  const out = [];
  for (let k = -20; k <= 20; k++) {
    const t = ((t0 + k * 0.002) % 1 + 1) % 1;
    for (const edge of [-1, 0, 1]) out.push({ t, lateral: edge * HALF_WIDTH_M, edge });
  }
  return out;
}

function zoomPose(from, to, focus, z) {
  const s = from.s * (to.s / from.s) ** z;
  let dr = to.r - from.r;
  dr = Math.atan2(Math.sin(dr), Math.cos(dr));
  const r = from.r + dr * z;
  const a = screenOf(focus, from);
  const b = screenOf(focus, to);
  const sx = a.x + (b.x - a.x) * z;
  const sy = a.y + (b.y - a.y) * z;
  const c = Math.cos(r) * s; const sn = Math.sin(r) * s;
  return { s, r, x: sx - (c * focus.x - sn * focus.y), y: sy - (sn * focus.x + c * focus.y) };
}

/**
 * Dive from the resting plan onto the road (direction 1) or rise from the road back to the
 * plan (direction -1). `samples` and `projected` are matching route positions and their
 * screen points in the live Tour frame. Returns the tween.
 */
export function zoom({ samples, projected, project, progress, direction = 1, duration = 1.6, ease = 'gt3.launch' }) {
  zoomTween?.kill();
  zoomTween = null;
  perspective = null;
  restorePaths();
  layout(); // the Hub is on screen now, so its resting slot can be measured
  drawTween?.kill();
  setDrawn(1);
  // DrawSVG's old dash lengths describe the resting path. The deformed road must stay whole.
  gsap.set([edgeL, edgeR], { clearProps: 'strokeDasharray,strokeDashoffset' });
  // Fit both edges across the visible road, avoiding behind-camera / far offscreen points.
  const visible = projected.map((p, i) => ({ p, sample: samples[i] })).filter(({ p }) =>
    (p.depth === undefined || p.depth > 0) && p.x > -window.innerWidth * 0.25 && p.x < window.innerWidth * 1.25
      && p.y > -window.innerHeight * 0.25 && p.y < window.innerHeight * 1.25);
  const fitted = visible.length >= 4 ? visible : projected.map((p, i) => ({ p, sample: samples[i] }));
  const target = fitSimilarity(fitted.map(({ sample: { t, lateral } }) => planAt(t, lateral)), fitted.map(({ p }) => p));
  const focus = planAt(routeTAt(progress));
  if (project) {
    const markerSamples = [{ t: 0, lateral: 0 }, { t: 0.002, lateral: 0 }, { t: routeTAt(progress), lateral: 0 }];
    const markerProjected = project(markerSamples);
    const depthOrigin = Math.max(1, markerProjected[2].depth);
    for (const shape of shapes) {
      if (shape.el !== lap) shape.projected = preparePerspective(shape.points, project(shape.samples), target, depthOrigin);
    }
    perspective = {
      mix: 0,
      markers: preparePerspective([startMark.at, startMark.ahead, focus], markerProjected, target, depthOrigin),
      start: { ...startMark.at }, ahead: { ...startMark.ahead }, here: { ...focus },
    };
  }
  const proxy = { z: direction > 0 ? 0 : 1 };
  const render = () => {
    if (perspective) perspective.mix = perspectiveMix(proxy.z);
    view = zoomPose(rest, target, focus, proxy.z);
    writeView();
  };
  render(); // reverse must already match the live frame during its initial fade-in
  zoomTween = gsap.to(proxy, {
    z: direction > 0 ? 1 : 0,
    duration,
    ease,
    onUpdate: render,
    onComplete: () => {
      zoomTween = null;
      if (direction < 0) { perspective = null; restorePaths(); view = { ...rest }; writeView(); }
    },
  });
  return zoomTween;
}

export function resetPlanView() {
  zoomTween?.kill();
  zoomTween = null;
  perspective = null;
  restorePaths();
  layout();
  view = { ...rest };
  writeView();
}
