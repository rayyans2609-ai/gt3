/**
 * hub.js — the Grand Tour Hub (SPEC §5, §25), Hub redesign candidate (owner brief 2026-11-26).
 *
 * GT3's own circuit, drawn as an architectural plan through the Grand Tour camera's eyes, is the
 * hero. Two equal primary actions sit with it: START RACE (dive onto the road, hubPlan.zoom) and
 * SHOWCASE (the Hub becomes the Collection: the circuit grows, manufacturer emblems float at their
 * checkpoints and a checkered flag in the middle opens the Full Showcase). Cars is no longer on
 * the main Hub; its selector survives as the `?collection=cars` alternative inside the Collection.
 *
 * Review variants (none selected; owner review):
 *   ?layout=horizontal (default) START RACE bottom left, SHOWCASE bottom right
 *   ?layout=vertical             SHOWCASE top centre, START RACE bottom centre
 *   ?loader=checker (default)    both checkered underlines fill from real loading progress
 *   ?loader=circuit              the circuit illuminates from the start line with real progress
 *   ?loader=strip                one checker strip spans START RACE→SHOWCASE, its middle drops out
 *   ?collection=emblems (default) | cars   (the preserved Cars selector inside the Collection)
 *
 * The player is the global edge drawer (edgeDrawer.js); the Hub only makes room for it: on
 * `gt3:drawer` the circuit frame narrows/widens in step with the drawer. The Hub→Tour dive
 * measures the plan's resting slot when it starts, so its alignment holds in every layout and
 * drawer state. Motion is GSAP ticked by main.js's one RAF (motion.js).
 */

import { state, subscribe } from '../core/state.js';
import { CARS } from '../data/cars.js';
import { gsap, reducedMotion, SplitText } from './motion.js';
import * as plan from './hubPlan.js';
import * as collection from './hubCollection.js';
import { applyCarColor } from './carIdentity.js';

const params = new URLSearchParams(window.location.search);
const pick = (key, options, fallback) => {
  const value = (params.get(key) || '').toLowerCase();
  return options.find((option) => option === value || option[0] === value) ?? fallback;
};
export const LAYOUT = pick('layout', ['horizontal', 'vertical'], 'horizontal');
export const LOADER = pick('loader', ['checker', 'circuit', 'strip'], 'checker');
export const COLLECTION = pick('collection', ['emblems', 'cars'], 'emblems');
const PROGRESS_SMOOTH_MS = 260;

let root = null;
let field;
let frame;
let planSvg = null;
let mark;
let back;
let status;
let runway;
let fullLabel;
let emblemLabel;
let carsWrap;
let carsToggle;
let carsName;
let emblemKeys = [];
let ticks = [];
let resistTl = null;
let resisted = [];
let stagePieces = [];
const actions = {};
let ready = false;
let progress = 0;
let shown = 0;
let shownFrame = 0;
let shownAt = 0;
let runwayCollapsed = false;
let onStart = null;
let onLanding = null;
let onShowcase = null;
let presence = -1;
let interactive = null;
let revealed = false;
let view = 'hub';
let viewTl = null;
let lastReadiness = '';
let revealTl = null;
let drawerSpace = 0;
let frameTween = null;
const insets = { top: 0, right: 0, bottom: 0, left: 0 };
let planCamera = { yawDeg: 75, pitchDeg: 52 };
let hoverHit = null;
const html = document.documentElement;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------------------------------------------------------------------------------------------
// Layout: the circuit frame is computed here (not CSS) so it can move continuously between the
// Hub, the Collection and the drawer states while the plan relayouts every frame.

function targetInsets(forView = view) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const side = Math.max(48, W * 0.07);
  const drawer = drawerSpace * 0.92;
  if (forView === 'collection') {
    return { top: Math.max(118, H * 0.17), bottom: Math.max(64, H * 0.12), left: side * 1.05, right: side * 1.05 + drawer };
  }
  // The Hub view measures its neighbours (layout boxes, not transforms) so the circuit always
  // fills exactly the space between the centred GT3 / SHOWCASE above and the actions below.
  const below = (node) => (node ? node.offsetTop + node.offsetHeight : 0);
  const gap = Math.max(22, H * 0.035);
  if (LAYOUT === 'vertical' && actions.show) {
    return { top: below(actions.show.wrap) + gap, bottom: H - actions.start.wrap.offsetTop + gap, left: side, right: side + drawer };
  }
  const top = mark ? below(mark) + gap : H * 0.13;
  const bottom = actions.start ? H - actions.start.wrap.offsetTop + gap : H * 0.33;
  return { top, bottom, left: side * 0.9, right: side * 0.9 + drawer };
}

function applyInsets() {
  frame.style.top = `${insets.top}px`;
  frame.style.right = `${insets.right}px`;
  frame.style.bottom = `${insets.bottom}px`;
  frame.style.left = `${insets.left}px`;
  plan.relayoutPlan();
  if (LOADER === 'circuit') placeCircuitStatus();
}

function moveFrame({ duration = 0, ease = 'gt3.out', forView = view } = {}) {
  frameTween?.kill();
  const to = targetInsets(forView);
  if (!duration || reducedMotion.matches) {
    Object.assign(insets, to);
    applyInsets();
    frameTween = null;
    return null;
  }
  frameTween = gsap.to(insets, { ...to, duration, ease, onUpdate: applyInsets, onComplete: () => { frameTween = null; } });
  return frameTween;
}

// ---------------------------------------------------------------------------------------------
// Checkers: square cells from the action's type size; the strip loader adds filler cells between
// (or beside) the two underlines and drops them once the route is ready.

function cellSize() {
  const size = parseFloat(getComputedStyle(actions.start.button).fontSize) || 100;
  return Math.max(6, Math.round(size * 0.108));
}

function buildColumns(container, count, parityOffset = 0) {
  container.replaceChildren();
  const columns = [];
  for (let i = 0; i < count; i++) {
    const column = el('span', 'hub-checker__column');
    column.dataset.p = String((i + parityOffset) % 2);
    column.append(el('i'), el('i'));
    container.append(column);
    columns.push(column);
  }
  return columns;
}

function layoutCheckers() {
  if (!actions.start) return;
  const cell = cellSize();
  root.style.setProperty('--cell', `${cell}px`);
  for (const action of Object.values(actions)) {
    const width = action.word.getBoundingClientRect().width;
    action.count = Math.max(8, Math.floor(width / cell));
    action.checker.style.width = `${action.count * cell}px`;
  }
  actions.start.columns = buildColumns(actions.start.checker, actions.start.count);
  // Fillers, measured after the underlines exist.
  runway.replaceChildren();
  runway.fillers = [];
  if (LOADER === 'strip' && !runwayCollapsed) {
    const a = actions.start.checker.getBoundingClientRect();
    if (LAYOUT === 'horizontal') {
      const b = actions.show.checker.getBoundingClientRect();
      const gap = b.left - a.right;
      const count = Math.max(1, Math.round(gap / cell));
      const filler = el('span', 'hub-checker hub-runway__fill');
      Object.assign(filler.style, { left: `${a.right}px`, top: `${a.top}px`, width: `${gap}px` });
      filler.columns = buildColumns(filler, count, actions.start.count);
      runway.append(filler);
      runway.fillers.push({ el: filler, from: 'center', order: 1 });
      actions.show.columns = buildColumns(actions.show.checker, actions.show.count, actions.start.count + count);
    } else {
      const left = Math.max(24, insets.left);
      const right = window.innerWidth - Math.max(24, insets.right);
      const lw = a.left - left;
      const rw = right - a.right;
      const lc = Math.max(1, Math.round(lw / cell));
      const rc = Math.max(1, Math.round(rw / cell));
      const l = el('span', 'hub-checker hub-runway__fill');
      Object.assign(l.style, { left: `${a.left - lc * cell}px`, top: `${a.top}px`, width: `${lc * cell}px` });
      l.columns = buildColumns(l, lc, lc % 2);
      const r = el('span', 'hub-checker hub-runway__fill');
      Object.assign(r.style, { left: `${a.right}px`, top: `${a.top}px`, width: `${rc * cell}px` });
      r.columns = buildColumns(r, rc, actions.start.count);
      runway.append(l, r);
      runway.fillers.push({ el: l, from: 'start', order: 0 }, { el: r, from: 'end', order: 2 });
      actions.show.columns = buildColumns(actions.show.checker, actions.show.count);
    }
  } else {
    actions.show.columns = buildColumns(actions.show.checker, actions.show.count);
  }
  paintCheckers(shown);
}

function fill(columns, value) {
  const filled = Math.floor(value * columns.length + 1e-6);
  columns.forEach((column, index) => column.classList.toggle('is-filled', index < filled));
}

function paintCheckers(value) {
  if (!actions.start?.columns) return;
  if (LOADER === 'circuit') {
    // The circuit carries the progress; the underlines complete in one sweep at ready.
    fill(actions.start.columns, ready ? value : 0);
    fill(actions.show.columns, ready ? value : 0);
    return;
  }
  if (LOADER === 'strip' && runway.fillers?.length && !runwayCollapsed) {
    const sequence = LAYOUT === 'horizontal'
      ? [actions.start.columns, runway.fillers[0].el.columns, actions.show.columns]
      : [runway.fillers[0].el.columns, actions.start.columns, runway.fillers[1].el.columns];
    const total = sequence.reduce((sum, columns) => sum + columns.length, 0);
    let remaining = value * total;
    for (const columns of sequence) {
      fill(columns, Math.min(1, Math.max(0, remaining / columns.length)));
      remaining -= columns.length;
    }
    if (LAYOUT === 'vertical') fill(actions.show.columns, value);
    return;
  }
  fill(actions.start.columns, value);
  fill(actions.show.columns, value);
}

function stepChecker(now) {
  const dt = Math.min(64, Math.max(0, now - shownAt));
  shownAt = now;
  const target = ready ? 1 : progress;
  const remaining = target - shown;
  if (remaining <= 0.0005) {
    shown = target;
    paintCheckers(shown);
    shownFrame = 0;
    if (ready) onCheckersComplete();
    return;
  }
  // The circuit loader's underlines finish in one quick sweep once the route is ready.
  const tau = LOADER === 'circuit' && ready ? 90 : PROGRESS_SMOOTH_MS;
  shown = Math.min(target, shown + remaining * (1 - Math.exp(-dt / tau)) + (ready ? 0.004 : 0));
  paintCheckers(shown);
  shownFrame = requestAnimationFrame(stepChecker);
}

function renderProgress({ snap = false } = {}) {
  if (snap || reducedMotion.matches) {
    if (shownFrame) cancelAnimationFrame(shownFrame);
    shownFrame = 0;
    shown = ready ? 1 : progress;
    paintCheckers(shown);
    if (ready) onCheckersComplete(true);
    return;
  }
  if (LOADER === 'circuit' && ready && shown >= 1) shown = 0; // sweep the underlines once
  if (!shownFrame) { shownAt = performance.now(); shownFrame = requestAnimationFrame(stepChecker); }
}

/** Strip loader: once complete, the cells between (or beside) the two underlines drop out fast. */
function onCheckersComplete(instant = false) {
  if (LOADER !== 'strip' || runwayCollapsed || !runway.fillers?.length) return;
  runwayCollapsed = true;
  const cols = runway.fillers.flatMap((f) => f.el.columns.map((c, i) => ({ c, f, i })));
  if (instant || reducedMotion.matches || !revealed) { runway.replaceChildren(); runway.fillers = []; return; }
  const tl = gsap.timeline({ delay: 0.16, onComplete: () => { runway.replaceChildren(); runway.fillers = []; } });
  for (const filler of runway.fillers) {
    tl.to(filler.el.columns, { scaleY: 0, opacity: 0, duration: 0.2, ease: 'power2.in',
      stagger: { each: 0.011, from: filler.from } }, 0);
  }
  void cols;
}

// ---------------------------------------------------------------------------------------------
// The two actions

function buildAction(key, label, caption) {
  const wrap = el('div', `hub-action hub-action--${key}`);
  const cap = el('p', 'hub-action__caption');
  cap.append(el('span', 'hub-action__index', key === 'start' ? '01' : '02'), el('span', 'hub-action__text', caption));
  const button = el('button', 'hub-action__button');
  button.type = 'button';
  button.disabled = true;
  button.setAttribute('aria-label', label);
  const word = el('span', 'hub-action__word', label);
  const checker = el('span', 'hub-checker hub-action__checker');
  checker.setAttribute('aria-hidden', 'true');
  button.append(word, checker);
  wrap.append(cap, button);
  const action = { key, wrap, cap, button, word, checker, chars: [], split: null, leanTl: null, columns: [] };
  actions[key] = action;
  return action;
}

function splitWords() {
  for (const action of Object.values(actions)) {
    action.split?.revert();
    action.split = SplitText.create(action.word, { type: 'chars', charsClass: 'hub-action__char', mask: 'chars', aria: 'none' });
    action.chars = action.split.chars;
    if (!revealed || view !== 'hub') gsap.set(action.chars, { yPercent: 112 });
  }
  layoutCheckers();
}

function lean(action, on) {
  if (reducedMotion.matches || !action.chars.length || !ready) return;
  action.leanTl?.kill();
  const tl = gsap.timeline();
  const origin = '0% 100%';
  tl.to(action.chars, on
    ? { skewX: -9, duration: 0.3, ease: 'gt3.out', stagger: 0.012, transformOrigin: origin }
    : { skewX: 0, duration: 0.55, ease: 'gt3.out', stagger: { each: 0.01, from: 'end' } }, 0);
  tl.to(action.checker, on
    ? { skewX: -9, duration: 0.3, ease: 'gt3.out', transformOrigin: origin }
    : { skewX: 0, duration: 0.55, ease: 'gt3.out' }, 0);
  action.leanTl = tl;
}

/** Where the plan's start leader leaves the words: just past the top of the last letter. */
function leaderOrigin() {
  const chars = actions.start.chars;
  const last = chars[chars.length - 1];
  if (!last) return null;
  const r = last.getBoundingClientRect();
  if (LAYOUT === 'vertical') return { x: r.right + 14, y: r.top + r.height * 0.18 };
  return { x: r.right + 14, y: r.top + r.height * 0.18 };
}

function setCaptions() {
  const found = CARS.filter((_, index) => state.unlocked.has(index)).length;
  actions.show.cap.lastChild.textContent = `Collection  ${found} / ${CARS.length}`;
  actions.start.cap.lastChild.textContent = 'Grand Tour';
  if (fullLabel) fullLabel.lastChild.textContent = `${CARS.length} cars · ${found} discovered`;
}

// ---------------------------------------------------------------------------------------------
// Cars (preserved selector; shown only in the Collection under ?collection=cars)

function resistCar(index, target = ticks[index]) {
  resistTl?.kill();
  gsap.set(resisted, { x: 0 });
  resisted.forEach((node) => node.classList.remove('is-resisted'));
  resisted = [...new Set([ticks[index], carsName, target].filter(Boolean))];
  resisted.forEach((node) => node.classList.add('is-resisted'));
  const clear = () => resisted.forEach((node) => node.classList.remove('is-resisted'));
  if (reducedMotion.matches) { resistTl = gsap.delayedCall(0.32, clear); return; }
  resistTl = gsap.timeline({ onComplete: clear })
    .to(resisted, { x: -4, duration: 0.08, ease: 'power2.out' })
    .to(resisted, { x: 1.5, duration: 0.1, ease: 'power2.inOut' })
    .to(resisted, { x: 0, duration: 0.14, ease: 'gt3.out' });
}

function buildCars() {
  carsWrap = el('div', 'hub-cars');
  carsToggle = el('button', 'hub-cars__toggle');
  carsToggle.type = 'button';
  carsToggle.setAttribute('aria-expanded', 'true');
  carsName = el('span', 'hub-cars__name', 'Cars');
  carsToggle.append(carsName);
  const glyph = el('span', 'hub-cars__ticks');
  glyph.setAttribute('role', 'group');
  glyph.setAttribute('aria-label', 'Vehicle discoveries');
  ticks = CARS.map((car, index) => {
    const tick = el('button', 'hub-cars__bar');
    tick.type = 'button';
    tick.append(el('i'));
    applyCarColor(tick, car);
    tick.addEventListener('pointerenter', () => { if (state.unlocked.has(index)) plan.lapLight(true, { car, once: true }); });
    tick.addEventListener('click', (event) => {
      if (!state.unlocked.has(index)) { resistCar(index); return; }
      const r = tick.getBoundingClientRect();
      openShowcase(index, 'single', { x: r.left + r.width / 2, y: r.top + r.height / 2 }, event);
    });
    return glyph.appendChild(tick);
  });
  carsWrap.append(carsToggle, glyph);
  return carsWrap;
}

function renderCars() {
  const found = state.unlocked;
  ticks.forEach((tick, index) => {
    const known = found.has(index);
    tick.classList.toggle('is-found', known);
    tick.setAttribute('aria-disabled', String(!known));
    tick.setAttribute('aria-label', known ? `${CARS[index].displayName}, open its Showcase` : `${index + 1}, undiscovered`);
  });
  plan.renderDiscovery(found);
  emblemKeys.forEach((key, index) => key.setAttribute('aria-label', found.has(index)
    ? `${CARS[index].displayName}, open its Showcase` : `Undiscovered car, ${index === 0 ? 'start' : `checkpoint ${index}`}`));
  setCaptions();
}

// ---------------------------------------------------------------------------------------------
// Build

function build() {
  root.replaceChildren();
  root.dataset.layout = LAYOUT;
  root.dataset.loader = LOADER;
  root.dataset.collection = COLLECTION;
  root.dataset.view = 'hub';
  field = el('div', 'hub-field');
  field.setAttribute('aria-hidden', 'true');
  frame = el('div', 'hub-plan-frame');
  frame.setAttribute('aria-hidden', 'true');
  mark = el('button', 'hub-mark', 'GT3');
  mark.type = 'button';
  mark.setAttribute('aria-label', 'GT3 — back to the Landing');
  back = el('button', 'hub-back');
  back.type = 'button';
  back.append(el('span', 'hub-back__arrow', '←'), el('span', 'hub-back__text', 'Hub'));
  back.setAttribute('aria-label', 'Back to the Hub');
  const start = buildAction('start', 'Start race', 'Grand Tour');
  const show = buildAction('show', 'Showcase', 'Collection');
  status = el('p', 'hub-status');
  status.setAttribute('aria-live', 'polite');
  runway = el('div', 'hub-runway');
  runway.setAttribute('aria-hidden', 'true');
  runway.fillers = [];
  fullLabel = el('button', 'hub-full');
  fullLabel.type = 'button';
  fullLabel.append(el('span', 'hub-full__title', 'Full Showcase'), el('span', 'hub-full__meta', ''));
  emblemLabel = el('div', 'hub-emblem-label');
  emblemLabel.setAttribute('aria-hidden', 'true');
  emblemLabel.append(el('span', 'hub-emblem-label__name'), el('span', 'hub-emblem-label__meta'));
  const cars = buildCars();
  // Keyboard access to the WebGL emblems: one invisible, focusable proxy per car, tracking its
  // emblem. The mouse never hits them (it raycasts the real shapes); Tab/Enter does.
  const keys = el('div', 'hub-emblem-keys');
  emblemKeys = CARS.map((car, index) => {
    const key = el('button', 'hub-emblem-key');
    key.type = 'button';
    key.addEventListener('focus', () => {
      if (view !== 'collection') return;
      collection.hoverCar(index);
      showEmblemLabel(emblemHit(index));
    });
    key.addEventListener('blur', () => { collection.hoverCar(null); showEmblemLabel(null); });
    key.addEventListener('click', () => {
      if (view !== 'collection' || !interactive) return;
      const hit = emblemHit(index);
      if (hit.locked) collection.resistEmblem(index);
      else openShowcase(index, 'single', { x: hit.x, y: hit.y });
    });
    return keys.appendChild(key);
  });
  root.append(field, frame, runway, mark, back, start.wrap, show.wrap, cars, keys, fullLabel, emblemLabel);
  // The status takes the START RACE caption slot, or the circuit's middle for the circuit loader.
  if (LOADER === 'circuit') root.append(status); else start.wrap.prepend(status);
  planSvg = plan.buildPlan(root, frame, {
    yawDeg: planCamera.yawDeg, pitchDeg: planCamera.pitchDeg,
    onLockedCar: resistCar,
    onCarSelect: (index, node) => {
      const r = node.getBoundingClientRect();
      openShowcase(index, 'single', { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    },
  });
  root.insertBefore(planSvg, runway);
  stagePieces = [mark, start.cap, show.cap, status];
  gsap.set(stagePieces, { autoAlpha: 0, y: 10 });
  gsap.set(mark, { xPercent: -50 });
  // Centred statuses keep their centring through GSAP's own transform (it owns `transform`).
  if (LOADER === 'circuit') gsap.set(status, { xPercent: -50, yPercent: -50 });
  else if (LAYOUT === 'vertical') gsap.set(status, { xPercent: -50 });
  gsap.set([back, fullLabel, carsWrap, emblemLabel], { autoAlpha: 0 });
  Object.assign(insets, targetInsets('hub'));
  applyInsets();

  start.button.addEventListener('click', () => { if (ready && interactive && view === 'hub') onStart?.(); });
  show.button.addEventListener('click', () => { if (ready && interactive && view === 'hub') enterCollection(); });
  mark.addEventListener('click', () => {
    if (!interactive) return;
    if (view === 'collection') exitCollection();
    else if (view === 'hub') onLanding?.();
  });
  back.addEventListener('click', () => { if (interactive && view === 'collection') exitCollection(); });
  fullLabel.addEventListener('click', () => {
    if (!interactive || view !== 'collection') return;
    const c = plan.circuitCentre();
    openShowcase(firstShowcaseIndex(), 'full', c);
  });
  start.button.addEventListener('pointerenter', () => {
    if (!revealed || view !== 'hub') return;
    lean(start, true); plan.startLeader(true, leaderOrigin()); plan.lapLight(true);
  });
  start.button.addEventListener('pointerleave', () => { lean(start, false); plan.startLeader(false); plan.lapLight(false); });
  start.button.addEventListener('focus', () => { if (revealed) lean(start, true); });
  start.button.addEventListener('blur', () => lean(start, false));
  show.button.addEventListener('pointerenter', () => {
    if (!revealed || view !== 'hub') return;
    lean(show, true); plan.previewDiscoveries(true, state.unlocked);
  });
  show.button.addEventListener('pointerleave', () => { lean(show, false); plan.previewDiscoveries(false, state.unlocked); });
  show.button.addEventListener('focus', () => { if (revealed) lean(show, true); });
  show.button.addEventListener('blur', () => lean(show, false));

  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerleave', () => { collection.clearCollectionPointer(); showEmblemLabel(null); });
  root.addEventListener('click', onCollectionClick);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && view === 'collection') { event.preventDefault(); exitCollection(); }
  });

  document.fonts?.ready.then(splitWords);
  splitWords();
  renderCars();
  subscribe('unlocked', renderCars);
  reducedMotion.addEventListener?.('change', () => {
    resistTl?.kill();
    gsap.set(resisted, { x: 0 });
    resisted.forEach((node) => node.classList.remove('is-resisted'));
  });
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { moveFrame(); layoutCheckers(); }, 80);
  });
  window.addEventListener('gt3:drawer', (event) => {
    const { open = false, width = 0, duration = 0.5, ease = 'gt3.out' } = event.detail || {};
    gsap.to({ v: drawerSpace }, { v: open ? width : 0, duration: reducedMotion.matches ? 0 : duration, ease,
      onUpdate() {
        drawerSpace = this.targets()[0].v;
        shiftActions();
        if (!frameTween) { Object.assign(insets, targetInsets()); applyInsets(); }
      },
      onComplete() { moveFrame(); } });
  });
}

/** The open drawer narrows the stage: the actions scale down with it and SHOWCASE moves clear. */
function shiftActions() {
  const W = window.innerWidth;
  const d = drawerSpace;
  const k = Math.max(0.6, (W - d) / W);
  const { start, show } = actions;
  if (LAYOUT === 'vertical') {
    for (const action of [start, show]) {
      action.wrap.style.transform = d ? `translateX(calc(-50% - ${(d / 2).toFixed(1)}px)) scale(${k.toFixed(4)})` : '';
      action.wrap.style.transformOrigin = action === start ? '50% 100%' : '50% 0%';
    }
    return;
  }
  start.wrap.style.transform = d ? `scale(${k.toFixed(4)})` : '';
  start.wrap.style.transformOrigin = '0% 100%';
  show.wrap.style.transform = d ? `translateX(${(-d).toFixed(1)}px) scale(${k.toFixed(4)})` : '';
  show.wrap.style.transformOrigin = '100% 100%';
}

/** The Hub's actions leave the focus order while the Collection owns the stage. */
function setActionsInert(on) {
  for (const action of Object.values(actions)) action.wrap.inert = on;
}

function firstShowcaseIndex() {
  return 0;
}

export function initHub({ onStartRace, onLanding: returnToLanding, onShowcase: openShowcaseView, camera, renderer } = {}) {
  root = document.getElementById('hub');
  if (!root) throw new Error('Expected #hub');
  onStart = onStartRace;
  onLanding = returnToLanding;
  onShowcase = openShowcaseView;
  if (camera) planCamera = camera;
  if (renderer) collection.initCollection(renderer);
  collection.placeCollection({
    anchors: (offset) => plan.checkpointAnchors(offset),
    centre: () => plan.circuitCentre(),
  });
  build();
  root.inert = true;
}

// ---------------------------------------------------------------------------------------------
// Readiness, presence, reveal

function placeCircuitStatus() {
  if (LOADER !== 'circuit' || !status) return;
  const c = plan.circuitCentre();
  status.style.left = `${c.x}px`;
  status.style.top = `${c.y}px`;
}

/** Mirror the one Tour readiness decision (main.js) on both actions and the loaders. */
export function setHubReadiness(readiness) {
  if (!root) return;
  const loading = readiness.status === 'loading';
  const failed = readiness.status === 'failed';
  progress = loading ? readiness.progress : failed ? 0 : 1;
  const percent = Math.round(progress * 100);
  const key = `${readiness.status}:${percent}`;
  if (key === lastReadiness) return;
  const wasReady = ready;
  lastReadiness = key;
  ready = !loading && !failed;
  for (const action of Object.values(actions)) {
    action.button.disabled = !ready;
    action.button.setAttribute('aria-busy', String(loading));
  }
  root.dataset.readiness = loading ? 'loading' : failed ? 'failed' : 'ready';
  status.textContent = failed ? 'Route unavailable. Reload the page to try again.'
    : loading ? `Preparing the grid ${String(percent).padStart(2, '0')}%` : '';
  renderProgress({ snap: !loading && !wasReady && !revealed });
  if (LOADER === 'circuit') {
    plan.setLoadingHead(loading && revealed);
    if (revealed) plan.drawToProgress(progress);
  }
}

function reveal() {
  revealed = true;
  revealTl?.kill();
  plan.setRoutePosition(state.progress > 0 ? state.progress : null);
  moveFrame();
  layoutCheckers();
  const chars = Object.values(actions).flatMap((action) => action.chars);
  const drawTarget = LOADER === 'circuit' ? progress : 1;
  if (LOADER === 'circuit') plan.setLoadingHead(!ready);
  if (reducedMotion.matches) {
    gsap.set(stagePieces, { autoAlpha: 1, y: 0 });
    gsap.set(chars, { yPercent: 0, x: 0, skewX: 0, autoAlpha: 1 });
    plan.drawToProgress(drawTarget, { animate: false });
    return;
  }
  revealTl = gsap.timeline();
  revealTl.fromTo(actions.start.chars, { yPercent: 112, skewX: 0, autoAlpha: 1 },
    { yPercent: 0, duration: 0.9, ease: 'gt3.out', stagger: 0.032 }, 0.12);
  revealTl.fromTo(actions.show.chars, { yPercent: 112, skewX: 0, autoAlpha: 1 },
    { yPercent: 0, duration: 0.9, ease: 'gt3.out', stagger: 0.032 }, LAYOUT === 'vertical' ? 0.05 : 0.2);
  revealTl.to(stagePieces, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'gt3.out', stagger: 0.07 }, 0.32);
  revealTl.add(() => plan.drawToProgress(drawTarget), 0);
  if (LOADER === 'strip' && ready) revealTl.add(() => onCheckersComplete(), 0.5);
}

function unreveal() {
  revealed = false;
  revealTl?.kill();
  Object.values(actions).forEach((action) => action.leanTl?.kill());
  const chars = Object.values(actions).flatMap((action) => action.chars);
  gsap.to(stagePieces, { autoAlpha: 0, y: 10, duration: 0.18, ease: 'gt3' });
  gsap.to(chars, { yPercent: 112, skewX: 0, duration: 0.22, ease: 'gt3' });
  plan.startLeader(false);
  plan.lapLight(false);
  plan.showCarLabels(false);
  plan.setLoadingHead(false);
  // Erase once the field has given way, so the next arrival draws the circuit again.
  gsap.delayedCall(0.3, () => { if (!revealed) plan.eraseDrawing(); });
}

/**
 * Field coverage from the Landing transition (0..1). The composition is revealed only once the
 * Hub is at rest; scrolling back up un-reveals it as the field gives way to the paint (SPEC §4).
 */
export function setHubPresence(value, canInteract) {
  if (!root) return;
  const next = Math.round(value * 1000) / 1000;
  if (next !== presence) {
    presence = next;
    root.style.opacity = String(next);
    root.hidden = next <= 0;
    if (next > 0) delete html.dataset.boot;
  }
  if (canInteract !== interactive) {
    interactive = canInteract;
    root.inert = !canInteract;
    root.classList.toggle('is-interactive', canInteract);
    if (canInteract) {
      html.classList.remove('is-hub-covering');
      if (view === 'hub') reveal();
    } else {
      if (view === 'collection') settleHubView();
      if (revealed) unreveal();
    }
  }
}

/** Per frame from main.js while the Hub is on screen. */
export function updateHub(dt) {
  if (!root || root.hidden) return;
  collection.updateCollection(dt);
  if (view === 'collection') {
    if (collection.collectionRendered() && field.style.opacity !== '0') field.style.opacity = '0';
    placeCollectionDom();
  }
}

/** Restore a settled field after an interrupted handoff, including cached DOM state. */
export function resetHub(value, canInteract) {
  gsap.killTweensOf([field, planSvg, root]);
  gsap.set([field, planSvg].filter(Boolean), { clearProps: 'opacity,clipPath' });
  if (view !== 'hub') settleHubView();
  plan.resetPlanView();
  html.classList.remove('is-hub-covering');
  root.style.transition = '';
  presence = -1;
  interactive = null;
  revealed = false;
  setHubPresence(value, canInteract);
}

/** Call before the world switches to the Tour, so its HUD never shows over the closed field. */
export function prepareLeave() {
  html.classList.add('is-hub-covering');
}

// ---------------------------------------------------------------------------------------------
// The Collection (SHOWCASE)

function sizesForCollection() {
  const { w, h } = plan.circuitSize();
  const base = Math.max(48, Math.min(84, Math.min(w, h) * 0.11));
  return { badge: base, flagSize: Math.max(120, Math.min(220, h * 0.36)), offset: base * 0.95 };
}

function emblemHit(index) {
  const s = sizesForCollection();
  const a = plan.checkpointAnchors(s.offset).find((item) => item.car === index);
  return { type: 'car', car: index, locked: !state.unlocked.has(index), x: a?.x ?? 0, y: a?.y ?? 0, size: s.badge };
}

function placeCollectionDom() {
  const c = plan.circuitCentre();
  const s = sizesForCollection();
  collection.placeCollection(s);
  for (const a of plan.checkpointAnchors(s.offset)) {
    const key = emblemKeys[a.car];
    if (!key) continue;
    key.style.left = `${a.x}px`;
    key.style.top = `${a.y}px`;
    key.style.width = key.style.height = `${s.badge * 1.1}px`;
  }
  fullLabel.style.left = `${c.x}px`;
  fullLabel.style.top = `${c.y + s.flagSize * 0.42}px`;
  if (hoverHit?.type === 'car') {
    const a = plan.checkpointAnchors(s.offset).find((item) => item.car === hoverHit.car);
    if (a) {
      // The label sits on the emblem's outer side, away from the road, aligned to that side.
      const gap = s.badge * 0.62 + 12;
      const side = Math.abs(a.nx) > 0.6;
      emblemLabel.style.left = `${a.x + a.nx * gap}px`;
      emblemLabel.style.top = `${a.y + a.ny * gap}px`;
      emblemLabel.style.justifyItems = side ? (a.nx > 0 ? 'start' : 'end') : 'center';
      emblemLabel.style.translate = side ? `${a.nx > 0 ? '0' : '-100%'} -50%` : `-50% ${a.ny > 0 ? '0' : '-100%'}`;
    }
  }
}

function showEmblemLabel(hit) {
  const previous = hoverHit;
  hoverHit = hit;
  if (previous?.type === 'car' && (!hit || hit.car !== previous.car)) plan.highlightCheckpoint(previous.car, false);
  root.classList.toggle('is-pointing', Boolean(hit && !(hit.type === 'car' && hit.locked)));
  fullLabel.classList.toggle('is-hover', hit?.type === 'full');
  if (!hit || hit.type !== 'car') { gsap.to(emblemLabel, { autoAlpha: 0, duration: 0.16, ease: 'gt3' }); return; }
  if (previous?.type === 'car' && previous.car === hit.car) return;
  const car = CARS[hit.car];
  const [name, meta] = emblemLabel.children;
  const checkpoint = hit.car === 0 ? 'Start' : `Checkpoint ${String(hit.car).padStart(2, '0')}`;
  if (hit.locked) {
    emblemLabel.classList.remove('car-identity');
    emblemLabel.classList.add('is-locked');
    name.textContent = 'Undiscovered';
    meta.textContent = checkpoint;
  } else {
    applyCarColor(emblemLabel, car);
    emblemLabel.classList.remove('is-locked');
    name.textContent = car.displayName;
    meta.textContent = `${checkpoint} · ${car.year}`;
    plan.highlightCheckpoint(hit.car, true);
    plan.lapLight(true, { car, once: true });
  }
  placeCollectionDom();
  gsap.fromTo(emblemLabel, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.28, ease: 'gt3.out' });
}

function onPointerMove(event) {
  if (view !== 'collection' || !interactive || COLLECTION === 'cars') return;
  if (event.target.closest?.('button')) { collection.clearCollectionPointer(); if (hoverHit) showEmblemLabel(null); return; }
  const hit = collection.pointCollection(event.clientX, event.clientY);
  const same = hit && hoverHit && hit.type === hoverHit.type && hit.car === hoverHit.car;
  if (!same) showEmblemLabel(hit);
}

function onCollectionClick(event) {
  if (view !== 'collection' || !interactive || event.target.closest?.('button')) return;
  const hit = collection.pointCollection(event.clientX, event.clientY);
  if (!hit) return;
  if (hit.type === 'full') { openShowcase(firstShowcaseIndex(), 'full', { x: hit.x, y: hit.y }); return; }
  if (hit.locked) { collection.resistEmblem(hit.car); return; }
  openShowcase(hit.car, 'single', { x: hit.x, y: hit.y });
}

function enterCollection() {
  if (view !== 'hub') return;
  view = 'collection';
  viewTl?.kill();
  setActionsInert(true);
  plan.startLeader(false);
  plan.lapLight(false);
  plan.previewDiscoveries(false, state.unlocked);
  Object.values(actions).forEach((action) => action.leanTl?.kill());
  root.dataset.view = 'collection';
  const chars = Object.values(actions).flatMap((action) => action.chars);
  const checkers = Object.values(actions).map((action) => action.checker);
  const tl = gsap.timeline();
  viewTl = tl;
  const quick = reducedMotion.matches;
  tl.to(chars, { yPercent: 112, skewX: 0, duration: quick ? 0 : 0.42, ease: 'power3.in', stagger: quick ? 0 : 0.016 }, 0);
  tl.to(checkers, { scaleX: 0, duration: quick ? 0 : 0.4, ease: 'power3.in', transformOrigin: '50% 50%' }, 0.08);
  tl.to([actions.start.cap, actions.show.cap, status], { autoAlpha: 0, y: -6, duration: quick ? 0 : 0.24, ease: 'gt3' }, 0);
  tl.add(() => { moveFrame({ duration: quick ? 0 : 1.05, ease: 'gt3.out' }); }, quick ? 0 : 0.16);
  if (COLLECTION === 'emblems') {
    placeCollectionDom();
    tl.add(() => collection.showCollection(true), quick ? 0 : 0.5);
  } else {
    tl.add(() => { collection.showCollection(true); plan.showCarLabels(true); }, quick ? 0 : 0.6);
    tl.to(carsWrap, { autoAlpha: 1, duration: quick ? 0 : 0.5, ease: 'gt3' }, quick ? 0 : 0.7);
  }
  tl.to(back, { autoAlpha: 1, duration: quick ? 0 : 0.5, ease: 'gt3' }, quick ? 0 : 0.7);
  tl.to(fullLabel, { autoAlpha: 1, duration: quick ? 0 : 0.6, ease: 'gt3' }, quick ? 0 : 1.0);
}

function exitCollection({ instant = false } = {}) {
  if (view !== 'collection') return null;
  view = 'hub';
  setActionsInert(false);
  viewTl?.kill();
  showEmblemLabel(null);
  const quick = instant || reducedMotion.matches;
  const tl = gsap.timeline();
  viewTl = tl;
  tl.to([back, fullLabel, carsWrap], { autoAlpha: 0, duration: quick ? 0 : 0.2, ease: 'gt3' }, 0);
  if (COLLECTION === 'cars') plan.showCarLabels(false);
  tl.add(collection.showCollection(false), 0);
  tl.add(() => {
    field.style.opacity = '';
    root.dataset.view = 'hub';
    moveFrame({ duration: quick ? 0 : 0.95, ease: 'gt3.out' });
  }, quick ? 0 : 0.28);
  const checkers = Object.values(actions).map((action) => action.checker);
  tl.to(checkers, { scaleX: 1, duration: quick ? 0 : 0.5, ease: 'gt3.out' }, quick ? 0 : 0.6);
  for (const action of Object.values(actions)) {
    tl.fromTo(action.chars, { yPercent: 112 }, { yPercent: 0, duration: quick ? 0 : 0.8, ease: 'gt3.out', stagger: quick ? 0 : 0.03 }, quick ? 0 : 0.62);
  }
  tl.to([actions.start.cap, actions.show.cap, status], { autoAlpha: 1, y: 0, duration: quick ? 0 : 0.5, ease: 'gt3.out' }, quick ? 0 : 0.8);
  return tl;
}

/** Snap back to the Hub view without choreography (leaving the Hub, interrupted handoffs). */
function settleHubView() {
  viewTl?.kill();
  view = 'hub';
  setActionsInert(false);
  root.dataset.view = 'hub';
  showEmblemLabel(null);
  collection.showCollection(false).progress(1);
  field.style.opacity = '';
  gsap.set([back, fullLabel, carsWrap, emblemLabel], { autoAlpha: 0 });
  gsap.set(Object.values(actions).map((action) => action.checker), { scaleX: 1 });
  plan.showCarLabels(false);
  moveFrame();
}

function openShowcase(index, mode, origin) {
  if (!interactive || !onShowcase) return;
  showEmblemLabel(null);
  onShowcase({ index, mode, origin });
}

/**
 * Collection → Showcase: the chosen emblem (or the flag) rises while everything else recedes; the
 * Hub stays mounted underneath so the return is immediate. Resolves when the Showcase may cover.
 */
export function leaveToShowcase(index, mode) {
  interactive = false;
  root.inert = true;
  root.classList.remove('is-interactive');
  const tl = gsap.timeline();
  tl.add(collection.focusEmblem(mode === 'full' ? 'full' : index), 0);
  // GT3 stays: the Showcase's mark sits exactly where the Hub's does, so it never blinks.
  tl.to([back, fullLabel, carsWrap, emblemLabel], { autoAlpha: 0, duration: 0.3, ease: 'gt3' }, 0);
  tl.to(planSvg, { opacity: 0.25, duration: 0.45, ease: 'gt3' }, 0.05);
  return new Promise((resolve) => tl.eventCallback('onComplete', resolve));
}

/** The Showcase owns the screen: hide the Hub in place, keeping its Collection state. */
export function suspendHub() {
  root.hidden = true;
  presence = 0;
  interactive = false;
  root.inert = true;
  root.classList.remove('is-interactive');
}

/** Showcase → Collection (or Hub): the Hub is still mounted; restore it in the requested view. */
export function returnFromShowcase({ to = 'collection' } = {}) {
  root.hidden = false;
  root.style.opacity = '1';
  gsap.set(planSvg, { opacity: 1 });
  gsap.set(mark, { autoAlpha: 1 });
  if (view !== 'collection') {
    // Entered without the Collection (review URL): the next frame reveals the Hub as usual.
    presence = -1;
    interactive = null;
    return;
  }
  presence = 1;
  interactive = true;
  root.inert = false;
  root.classList.add('is-interactive');
  if (to === 'hub') {
    exitCollection();
    return;
  }
  collection.showCollection(true);
  gsap.to([back, fullLabel], { autoAlpha: 1, duration: 0.5, ease: 'gt3' });
  if (COLLECTION === 'cars') gsap.to(carsWrap, { autoAlpha: 1, duration: 0.5, ease: 'gt3' });
}

export function hubView() { return view; }

// ---------------------------------------------------------------------------------------------
// Hub -> Grand Tour and back

function hideHub() {
  root.hidden = true;
  presence = 0;
  root.style.opacity = '0';
  revealed = false;
  gsap.set([field, planSvg].filter(Boolean), { clearProps: 'opacity,clipPath' });
  gsap.set(stagePieces, { autoAlpha: 0, y: 10 });
  gsap.set(Object.values(actions).flatMap((action) => action.chars), { yPercent: 112, x: 0, skewX: 0 });
  plan.showCarLabels(false);
  plan.resetPlanView();
  html.classList.remove('is-hub-covering');
}

function fadeOut(resolve) {
  gsap.timeline({ onComplete: () => { hideHub(); resolve(); } })
    .to(root, { opacity: 0, duration: 0.52, ease: 'gt3' })
    .add(() => html.classList.remove('is-hub-covering'), 0.26);
}

/**
 * Hub -> Grand Tour. `tour` (from main.js) gives the live frame's geometry: `progress` and
 * `project(samples)` → screen points of route positions in the Tour camera, already settled
 * under the field. Resolves when the Tour is fully uncovered.
 */
export function leaveHub(tour = {}) {
  return new Promise((resolve) => {
    interactive = false;
    root.inert = true;
    root.classList.remove('is-interactive');
    if (view !== 'hub') settleHubView();
    revealTl?.kill();
    Object.values(actions).forEach((action) => action.leanTl?.kill());
    plan.startLeader(false); plan.lapLight(false); plan.showCarLabels(false); plan.setLoadingHead(false);
    plan.previewDiscoveries(false, state.unlocked);
    if (reducedMotion.matches || !tour.project) { fadeOut(resolve); return; }
    const tl = gsap.timeline({ onComplete: () => { hideHub(); resolve(); } });
    tl.to(stagePieces, { autoAlpha: 0, y: -6, duration: 0.26, ease: 'gt3', stagger: 0.03 }, 0);
    const samples = plan.fitSamples(tour.progress ?? 0);
    const projected = tour.project(samples);
    tl.to(actions.start.chars, { yPercent: -112, skewX: -10, duration: 0.5, ease: 'power3.in', stagger: 0.022 }, 0.02);
    tl.to(actions.show.chars, { yPercent: 112, duration: 0.42, ease: 'power3.in', stagger: 0.018 }, 0.0);
    tl.to(Object.values(actions).map((action) => action.checker), { scaleX: 0, duration: 0.42, ease: 'power3.in', transformOrigin: '0% 50%' }, 0.06);
    tl.add(plan.zoom({ samples, projected, project: tour.project, progress: tour.progress ?? 0, direction: 1, duration: 1.55 }), 0.22);
    tl.to(field, { opacity: 0, duration: 0.5, ease: 'gt3' }, 1.32);
    tl.add(() => html.classList.remove('is-hub-covering'), 1.45);
    tl.to(planSvg, { opacity: 0, duration: 0.5, ease: 'gt3' }, 1.62);
  });
}

/**
 * Grand Tour -> Hub: the same move backwards. Resolves once the field covers the Tour; the
 * composition reveals itself when main.js hands the screen to the Hub.
 */
export function coverHub(tour = {}) {
  return new Promise((resolve) => {
    interactive = false;
    revealed = false;
    root.inert = true;
    root.classList.remove('is-interactive');
    root.hidden = false;
    root.style.opacity = '1';
    html.classList.add('is-hub-covering');
    gsap.set(stagePieces, { autoAlpha: 0, y: 10 });
    gsap.set(Object.values(actions).flatMap((action) => action.chars), { yPercent: 112, x: 0, skewX: 0 });
    gsap.set(Object.values(actions).map((action) => action.checker), { scaleX: 1 });
    const done = () => { presence = 1; resolve(); };
    if (reducedMotion.matches || !tour.project) {
      gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.52, ease: 'gt3', onComplete: done });
      return;
    }
    const tl = gsap.timeline({ onComplete: done });
    moveFrame();
    const samples = plan.fitSamples(tour.progress ?? 0);
    const projected = tour.project(samples);
    plan.setRoutePosition(tour.progress > 0 ? tour.progress : null);
    plan.drawToProgress(1, { animate: false });
    gsap.set(field, { opacity: 0 });
    gsap.set(planSvg, { opacity: 0 });
    tl.to(planSvg, { opacity: 1, duration: 0.3, ease: 'gt3' }, 0);
    tl.to(field, { opacity: 1, duration: 0.45, ease: 'gt3' }, 0.18);
    tl.add(plan.zoom({ samples, projected, project: tour.project, progress: tour.progress ?? 0, direction: -1, duration: 1.35, ease: 'gt3.out' }), 0.5);
  });
}
