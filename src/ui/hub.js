/**
 * hub.js — the Grand Tour Hub (SPEC §5, §9, §25), Phase 5 candidate.
 *
 * Two creative directions are kept for the owner's visual review (neither is accepted):
 *  - `plan` (default): GT3's own circuit, drawn as an architectural plan through the Grand Tour
 *    camera's eyes, is the Hub's hero. It draws itself as the route prepares, previews a lap
 *    when START RACE is under the pointer, carries the Cars view on its checkpoints, and on
 *    START RACE dives onto the visitor's place on the road before the live frame takes over.
 *  - `launch` (`?hub=launch`): typographic. START RACE runs edge to edge as one kinetic word
 *    that leans toward the pointer and leaves the screen letter by letter, like a grid getting
 *    away; the field follows it out.
 * Shared here: readiness, Landing presence and reveal, the launch/return contract with main.js,
 * Cars, and the integrated player (hubPlayer.js). Motion runs on GSAP ticked by main.js's one
 * RAF (motion.js); CSS handles only hover colour and focus states.
 */

import { state, subscribe } from '../core/state.js';
import { CARS } from '../data/cars.js';
import { initHubPlayer, resetHubPlayer, updateHubPlayer } from './hubPlayer.js';
import { gsap, reducedMotion, SplitText } from './motion.js';
import * as plan from './hubPlan.js';

const params = new URLSearchParams(window.location.search);
const DIRECTION = params.get('hub') === 'launch' ? 'launch' : 'plan';

let root = null;
let field;
let frame;
let planSvg = null;
let mark;
let startButton;
let startWord;
let split = null;
let chars = [];
let status;
let carsToggle;
let ticks = [];
let roster = null;
let stagePieces = [];
let ready = false;
let progress = 0;
let onStart = null;
let presence = -1;
let interactive = null;
let revealed = false;
let carsOpen = false;
let lastReadiness = '';
let revealTl = null;
let leanTl = null;
let proximity = [];
const html = document.documentElement;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------------------------------------------------------------------------------------------
// Cars: the roster glyph (ten ticks) everywhere; names live on the plan or in a short roster.

function buildCars() {
  const wrap = el('div', 'hub-cars');
  carsToggle = el('button', 'hub-cars__toggle');
  carsToggle.type = 'button';
  carsToggle.setAttribute('aria-expanded', 'false');
  const name = el('span', 'hub-cars__name', 'Cars');
  const glyph = el('span', 'hub-cars__ticks');
  glyph.setAttribute('aria-hidden', 'true');
  ticks = CARS.map(() => glyph.appendChild(el('i')));
  carsToggle.append(name, glyph);
  wrap.append(carsToggle);
  if (DIRECTION === 'launch') {
    roster = el('ol', 'hub-roster');
    roster.id = 'hub-roster';
    roster.inert = true;
    CARS.forEach(() => roster.append(el('li', 'hub-roster__car')));
    carsToggle.setAttribute('aria-controls', roster.id);
    wrap.append(roster);
  }
  carsToggle.addEventListener('click', () => setCars(!carsOpen));
  return wrap;
}

function renderCars() {
  const found = state.unlocked;
  ticks.forEach((tick, index) => tick.classList.toggle('is-found', found.has(index)));
  const count = CARS.filter((_, index) => found.has(index)).length;
  carsToggle.setAttribute('aria-label', `Cars, ${count} of ${CARS.length} discovered`);
  if (DIRECTION === 'plan') plan.renderDiscovery(found);
  if (roster) {
    CARS.forEach((car, index) => {
      const item = roster.children[index];
      const known = found.has(index);
      item.classList.toggle('is-found', known);
      item.textContent = known ? `${car.manufacturer} ${car.model}` : '?';
    });
  }
}

function setCars(open) {
  carsOpen = open;
  carsToggle.setAttribute('aria-expanded', String(open));
  root.classList.toggle('is-cars-open', open);
  if (DIRECTION === 'plan') { plan.showCarLabels(open); return; }
  roster.inert = !open;
  gsap.killTweensOf(roster.children);
  if (reducedMotion.matches) { gsap.set(roster.children, { opacity: open ? 1 : 0, y: 0 }); return; }
  gsap.to(roster.children, open
    ? { opacity: 1, y: 0, duration: 0.42, ease: 'gt3.out', stagger: 0.03 }
    : { opacity: 0, y: -4, duration: 0.16, ease: 'gt3' });
}

// ---------------------------------------------------------------------------------------------
// START RACE type

function splitStart() {
  split?.revert();
  split = SplitText.create(startWord, {
    type: 'chars', charsClass: 'hub-start__char', mask: 'chars', aria: 'none',
  });
  chars = split.chars;
  if (!revealed) gsap.set(chars, { yPercent: 112 });
  renderLoadingChars();
  if (DIRECTION === 'launch') buildProximity();
}

/** Launch direction: letters become solid as the route prepares (SPEC §25 loading). */
function renderLoadingChars() {
  if (DIRECTION !== 'launch' || !chars.length) return;
  const solid = ready ? chars.length : Math.floor(progress * chars.length);
  chars.forEach((c, i) => c.classList.toggle('is-solid', i < solid));
}

function lean(on) {
  if (reducedMotion.matches || !chars.length || !ready) return;
  leanTl?.kill();
  leanTl = gsap.to(chars, on
    ? { skewX: -9, duration: 0.3, ease: 'gt3.out', stagger: 0.012, transformOrigin: '0% 100%' }
    : { skewX: 0, duration: 0.55, ease: 'gt3.out', stagger: { each: 0.01, from: 'end' } });
}

/** Launch direction: letters near the pointer lean forward, like speed passing through them. */
function buildProximity() {
  proximity = chars.map((c) => ({
    el: c,
    skew: gsap.quickTo(c, 'skewX', { duration: 0.45, ease: 'gt3.out' }),
    lift: gsap.quickTo(c, 'yPercent', { duration: 0.5, ease: 'gt3.out' }),
  }));
}

function onPointerMove(event) {
  if (DIRECTION !== 'launch' || !revealed || !ready || reducedMotion.matches) return;
  for (const p of proximity) {
    const r = p.el.getBoundingClientRect();
    const dx = (event.clientX - (r.left + r.width / 2)) / Math.max(120, r.width * 1.4);
    const dy = Math.max(0, Math.abs(event.clientY - (r.top + r.height / 2)) - r.height * 0.6) / 260;
    const k = Math.exp(-(dx * dx) - dy * dy * 4);
    p.skew(-14 * k);
    p.lift(-4 * k);
  }
}

function relaxProximity() {
  for (const p of proximity) { p.skew(0); p.lift(0); }
}

/** Where the plan's start leader leaves the words: just past the top of the last letter. */
function leaderOrigin() {
  const last = chars[chars.length - 1];
  if (!last) return null;
  const r = last.getBoundingClientRect();
  return { x: r.right + 14, y: r.top + r.height * 0.18 };
}

// ---------------------------------------------------------------------------------------------
// Build

function build() {
  root.replaceChildren();
  root.dataset.direction = DIRECTION;
  field = el('div', 'hub-field');
  field.setAttribute('aria-hidden', 'true');
  frame = el('div', 'hub-plan-frame');
  frame.setAttribute('aria-hidden', 'true');
  mark = el('span', 'hub-mark', 'GT3');
  mark.setAttribute('aria-hidden', 'true');
  const startWrap = el('div', 'hub-start-wrap');
  startButton = el('button', 'hub-start');
  startButton.type = 'button';
  startButton.disabled = true;
  startButton.setAttribute('aria-label', 'Start race');
  startWord = el('span', 'hub-start__word', 'Start race');
  startButton.append(startWord);
  status = el('p', 'hub-status');
  status.setAttribute('aria-live', 'polite');
  startWrap.append(status, startButton);
  const cars = buildCars();
  const playerSlot = el('div', 'hub-player-slot');
  root.append(field, frame, mark, cars, playerSlot, startWrap);
  initHubPlayer(playerSlot, { shape: DIRECTION === 'plan' ? 'row' : 'column' });
  if (DIRECTION === 'plan') {
    planSvg = plan.buildPlan(root, frame, { yawDeg: planCamera.yawDeg, pitchDeg: planCamera.pitchDeg });
    root.insertBefore(planSvg, mark);
  }
  stagePieces = [mark, cars, playerSlot, status];
  gsap.set(stagePieces, { autoAlpha: 0, y: 10 });

  startButton.addEventListener('click', () => { if (ready && interactive) onStart?.(); });
  startButton.addEventListener('pointerenter', () => {
    if (!revealed) return;
    if (DIRECTION === 'plan') { lean(true); plan.startLeader(true, leaderOrigin()); plan.lapLight(true); }
  });
  startButton.addEventListener('pointerleave', () => {
    if (DIRECTION === 'plan') { lean(false); plan.startLeader(false); plan.lapLight(false); }
  });
  startButton.addEventListener('focus', () => { if (revealed && DIRECTION === 'plan') lean(true); });
  startButton.addEventListener('blur', () => { if (DIRECTION === 'plan') lean(false); });
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerleave', relaxProximity);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && carsOpen) { setCars(false); carsToggle.focus(); }
  });

  document.fonts?.ready.then(splitStart);
  splitStart();
  renderCars();
  subscribe('unlocked', renderCars);
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { if (DIRECTION === 'plan') plan.relayoutPlan(); }, 80);
  });
}

let planCamera = { yawDeg: 75, pitchDeg: 52 };

export function initHub({ onStartRace, camera } = {}) {
  root = document.getElementById('hub');
  if (!root) throw new Error('Expected #hub');
  onStart = onStartRace;
  if (camera) planCamera = camera;
  build();
  root.inert = true;
}

// ---------------------------------------------------------------------------------------------
// Readiness, presence, reveal

/** Mirror the one Tour readiness decision (main.js) on START RACE and the loading drawing. */
export function setHubReadiness(readiness) {
  if (!root) return;
  const loading = readiness.status === 'loading';
  const failed = readiness.status === 'failed';
  progress = loading ? readiness.progress : failed ? 0 : 1;
  const percent = Math.round(progress * 100);
  const key = `${readiness.status}:${percent}`;
  if (key === lastReadiness) return;
  lastReadiness = key;
  ready = !loading && !failed;
  startButton.disabled = !ready;
  startButton.setAttribute('aria-busy', String(loading));
  root.dataset.readiness = loading ? 'loading' : failed ? 'failed' : 'ready';
  status.textContent = failed ? 'Route unavailable. Reload the page to try again.'
    : loading ? `Preparing the grid ${String(percent).padStart(2, '0')}%` : '';
  renderLoadingChars();
  if (revealed && DIRECTION === 'plan') plan.drawToProgress(progress);
}

function reveal() {
  revealed = true;
  revealTl?.kill();
  if (DIRECTION === 'plan') {
    plan.setRoutePosition(state.progress > 0 ? state.progress : null);
    plan.relayoutPlan();
  }
  if (reducedMotion.matches) {
    gsap.set(stagePieces, { autoAlpha: 1, y: 0 });
    gsap.set(chars, { yPercent: 0, x: 0, skewX: 0, autoAlpha: 1 });
    if (DIRECTION === 'plan') plan.drawToProgress(progress, { animate: false });
    return;
  }
  revealTl = gsap.timeline();
  revealTl.fromTo(chars, { yPercent: 112, x: 0, skewX: 0, autoAlpha: 1 },
    { yPercent: 0, duration: DIRECTION === 'launch' ? 1.05 : 0.9, ease: 'gt3.out', stagger: 0.032 }, 0.12);
  revealTl.to(stagePieces, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'gt3.out', stagger: 0.07 }, 0.32);
  // The circuit draws itself on arrival from the Landing; after a Tour return it is already drawn.
  if (DIRECTION === 'plan') revealTl.add(() => plan.drawToProgress(progress), 0);
}

function unreveal() {
  revealed = false;
  revealTl?.kill();
  leanTl?.kill();
  relaxProximity();
  gsap.to(stagePieces, { autoAlpha: 0, y: 10, duration: 0.18, ease: 'gt3' });
  gsap.to(chars, { yPercent: 112, skewX: 0, duration: 0.22, ease: 'gt3' });
  if (DIRECTION === 'plan') {
    plan.startLeader(false);
    plan.lapLight(false);
    plan.showCarLabels(false);
    // Erase once the field has given way, so the next arrival draws the circuit again.
    gsap.delayedCall(0.3, () => { if (!revealed) plan.eraseDrawing(); });
  }
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
      reveal();
    } else {
      if (carsOpen) setCars(false);
      resetHubPlayer();
      if (revealed) unreveal();
    }
  }
}

/** Per frame from main.js while the Hub is on screen. */
export function updateHub() {
  if (root && !root.hidden && presence > 0) updateHubPlayer();
}

/** Restore a settled field after an interrupted handoff, including cached DOM state. */
export function resetHub(value, canInteract) {
  gsap.killTweensOf([field, planSvg, root]);
  gsap.set([field, planSvg].filter(Boolean), { clearProps: 'opacity,clipPath' });
  if (DIRECTION === 'plan') plan.resetPlanView();
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
// Hub -> Grand Tour and back

function hideHub() {
  root.hidden = true;
  presence = 0;
  root.style.opacity = '0';
  revealed = false;
  gsap.set([field, planSvg].filter(Boolean), { clearProps: 'opacity,clipPath' });
  gsap.set(stagePieces, { autoAlpha: 0, y: 10 });
  gsap.set(chars, { yPercent: 112, x: 0, skewX: 0 });
  if (DIRECTION === 'plan') { plan.showCarLabels(false); plan.resetPlanView(); }
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
    if (carsOpen) setCars(false);
    resetHubPlayer();
    revealTl?.kill();
    leanTl?.kill();
    relaxProximity();
    if (DIRECTION === 'plan') { plan.startLeader(false); plan.lapLight(false); plan.showCarLabels(false); }
    if (reducedMotion.matches) { fadeOut(resolve); return; }
    const tl = gsap.timeline({ onComplete: () => { hideHub(); resolve(); } });
    tl.to(stagePieces, { autoAlpha: 0, y: -6, duration: 0.26, ease: 'gt3', stagger: 0.03 }, 0);

    if (DIRECTION === 'plan' && tour.project) {
      const samples = plan.fitSamples(tour.progress ?? 0);
      const projected = tour.project(samples);
      tl.to(chars, { yPercent: -112, skewX: -10, duration: 0.5, ease: 'power3.in', stagger: 0.022 }, 0.02);
      tl.add(plan.zoom({ samples, projected, progress: tour.progress ?? 0, direction: 1, duration: 1.55 }), 0.22);
      tl.to(field, { opacity: 0, duration: 0.5, ease: 'gt3' }, 1.32);
      tl.add(() => html.classList.remove('is-hub-covering'), 1.45);
      tl.to(planSvg, { opacity: 0, duration: 0.5, ease: 'gt3' }, 1.62);
      return;
    }

    // Launch direction (and the plan's fallback without geometry): the letters get away to the
    // right one after another and the field follows them out.
    tl.to(chars, {
      x: () => window.innerWidth * 1.1, skewX: -22, duration: 0.95, ease: 'gt3.launch',
      stagger: { each: 0.045, from: 'start' },
    }, 0.04);
    tl.fromTo(field, { clipPath: 'inset(0 0 0 0%)' }, { clipPath: 'inset(0 0 0 100%)', duration: 0.95, ease: 'gt3.launch' }, 0.32);
    if (planSvg) tl.to(planSvg, { opacity: 0, duration: 0.4, ease: 'gt3' }, 0.2);
    tl.add(() => html.classList.remove('is-hub-covering'), 0.7);
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
    gsap.set(chars, { yPercent: 112, x: 0, skewX: 0 });
    const done = () => { presence = 1; resolve(); };
    if (reducedMotion.matches) {
      gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.52, ease: 'gt3', onComplete: done });
      return;
    }
    const tl = gsap.timeline({ onComplete: done });
    if (DIRECTION === 'plan' && tour.project) {
      const samples = plan.fitSamples(tour.progress ?? 0);
      const projected = tour.project(samples);
      plan.setRoutePosition(tour.progress > 0 ? tour.progress : null);
      plan.drawToProgress(1, { animate: false });
      gsap.set(field, { opacity: 0 });
      gsap.set(planSvg, { opacity: 0 });
      tl.to(planSvg, { opacity: 1, duration: 0.3, ease: 'gt3' }, 0);
      tl.to(field, { opacity: 1, duration: 0.45, ease: 'gt3' }, 0.18);
      tl.add(plan.zoom({ samples, projected, progress: tour.progress ?? 0, direction: -1, duration: 1.35, ease: 'gt3.out' }), 0.5);
      return;
    }
    if (planSvg) gsap.set(planSvg, { opacity: 0 });
    tl.fromTo(field, { clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)', duration: 0.8, ease: 'gt3.launch' }, 0);
    if (planSvg) tl.to(planSvg, { opacity: 1, duration: 0.3, ease: 'gt3' }, 0.7);
  });
}
