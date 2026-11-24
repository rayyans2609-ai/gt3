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
  for (let i = 0; i <= SAMPLES; i++) {
    const p = planAt(i / SAMPLES, lateral);
    d += `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    if (bounds) {
      bounds.minX = Math.min(bounds.minX, p.x); bounds.maxX = Math.max(bounds.maxX, p.x);
      bounds.minY = Math.min(bounds.minY, p.y); bounds.maxY = Math.max(bounds.maxY, p.y);
    }
  }
  return `${d}Z`;
}

function writeView(v = view) {
  const c = Math.cos(v.r) * v.s;
  const s = Math.sin(v.r) * v.s;
  world.setAttribute('transform', `matrix(${c} ${s} ${-s} ${c} ${v.x} ${v.y})`);
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
  const s0 = screenOf(startMark.at, v);
  startMark.el.setAttribute('transform', `translate(${s0.x.toFixed(1)} ${s0.y.toFixed(1)}) rotate(${startMark.deg.toFixed(2)})`);
  if (routeT !== null) {
    const h = screenOf(planAt(routeT), v);
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
  edgeL = node('path', { class: 'hub-plan__edge', d: pathFor(-HALF_WIDTH_M) }, world);
  edgeR = node('path', { class: 'hub-plan__edge', d: pathFor(HALF_WIDTH_M) }, world);
  lap = node('path', { class: 'hub-plan__lap', d: pathFor(0) }, world);

  // Checkpoint ticks: car i+1 is discovered at CHECKPOINT_ROUTE_T[i] (Lexus starts the Tour).
  ticks = CHECKPOINT_ROUTE_T.map((t, i) => {
    const a = planAt(t, -HALF_WIDTH_M - TICK_OUT_M);
    const b = planAt(t, HALF_WIDTH_M + TICK_OUT_M);
    const el = node('path', { class: 'hub-plan__tick', d: `M${a.x} ${a.y}L${b.x} ${b.y}` }, world);
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
  startMark = { el: g, at: s0, deg: Math.atan2(s1.y - s0.y, s1.x - s0.x) * 180 / Math.PI };

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
 * A hairline from the START RACE words to the start line: "it starts here". `from` is the
 * screen point at the end of the words; the line bends once and lands on the start mark.
 */
export function startLeader(on, from) {
  leaderTween?.kill();
  if (reducedMotion.matches || drawn < 1) { gsap.set(leader, { opacity: 0 }); return; }
  if (on && from) {
    const s0 = screenOf(startMark.at);
    const elbowY = Math.max(s0.y + 24, from.y - 40);
    leader.setAttribute('d', `M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${from.x.toFixed(1)} ${elbowY.toFixed(1)}L${s0.x.toFixed(1)} ${(s0.y + 9).toFixed(1)}`);
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

/**
 * Least-squares similarity (scale, rotation, translation) taking plan points onto the
 * projected screen points of the same route positions. The plan already shares the camera's
 * orientation, so the rotation stays near zero; perspective is absorbed by the fit.
 */
function fit(planPts, screenPts) {
  const n = planPts.length;
  let px = 0; let py = 0; let qx = 0; let qy = 0;
  for (let i = 0; i < n; i++) { px += planPts[i].x; py += planPts[i].y; qx += screenPts[i].x; qy += screenPts[i].y; }
  px /= n; py /= n; qx /= n; qy /= n;
  let a = 0; let b = 0; let d = 0;
  for (let i = 0; i < n; i++) {
    const ux = planPts[i].x - px; const uy = planPts[i].y - py;
    const vx = screenPts[i].x - qx; const vy = screenPts[i].y - qy;
    a += ux * vx + uy * vy; b += ux * vy - uy * vx; d += ux * ux + uy * uy;
  }
  const s = Math.hypot(a, b) / d;
  const r = Math.atan2(b, a);
  const c = Math.cos(r) * s; const sn = Math.sin(r) * s;
  return { s, r, x: qx - (c * px - sn * py), y: qy - (sn * px + c * py) };
}

/** Sample route positions around the visitor's place for the fit. */
export function fitSamples(progress) {
  const t0 = routeTAt(progress);
  const out = [];
  for (let k = -3; k <= 8; k++) out.push({ t: ((t0 + k * 0.004) % 1 + 1) % 1, lateral: 0 });
  out.push({ t: t0, lateral: -HALF_WIDTH_M }, { t: t0, lateral: HALF_WIDTH_M });
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
export function zoom({ samples, projected, progress, direction = 1, duration = 1.6, ease = 'gt3.launch' }) {
  zoomTween?.kill();
  zoomTween = null;
  layout(); // the Hub is on screen now, so its resting slot can be measured
  const planPts = samples.map(({ t, lateral }) => planAt(t, lateral));
  const target = fit(planPts, projected);
  const focus = planAt(routeTAt(progress));
  const proxy = { z: direction > 0 ? 0 : 1 };
  if (direction < 0) { view = { ...target }; writeView(); }
  zoomTween = gsap.to(proxy, {
    z: direction > 0 ? 1 : 0,
    duration,
    ease,
    onUpdate: () => { view = zoomPose(rest, target, focus, proxy.z); writeView(); },
    onComplete: () => { zoomTween = null; if (direction < 0) { view = { ...rest }; writeView(); } },
  });
  return zoomTween;
}

export function resetPlanView() {
  zoomTween?.kill();
  zoomTween = null;
  layout();
  view = { ...rest };
  writeView();
}
