/**
 * Shared Phase 5 Hub controller. Presenter interface (each init gets a fresh instance):
 * build(root, ctx), layout(), setReadiness(progress, status),
 * setState(next, prev) -> GSAP timeline|null, hoverStart(on), setDiscovery(Set),
 * setRoutePosition(progress), hoverCheckpoint(carIndex|null), selectCheckpoint(carIndex|null),
 * setTheme(theme), restPose(viewport) -> pose, launch(seam), returnTo(seam) -> timelines,
 * update(dt), optional render() -> boolean (true means it rendered the shared canvas), dispose().
 *
 * ctx supplies frame, field, startButton, camera orientation, core selection callbacks,
 * registerCheckpoint(carIndex, element) for core-owned keyboard/focus handling,
 * requestShowcase({carIndex}), and setPoseOverride(fn|null). Presenters own their visuals;
 * this controller owns readiness, race/cars/listening, focus, discovery and selection.
 * For a canvas presenter set root.dataset.canvasField='true'; CSS opens the opaque field.
 * No presenter starts a RAF or owns scroll, audio, persistence or experience transitions.
 */
import { state, set, subscribe } from '../../core/state.js';
import { getRestoredRouteProgress } from '../../core/session.js';
import { CARS } from '../../data/cars.js';
import { closeHubListening, getHubPlayerDebug, initHubPlayer, resetHubPlayer, updateHubPlayer } from '../hubPlayer.js';
import { gsap, reducedMotion } from '../motion.js';
import { createPresenter as createA } from './presenterA.js';
import { createPresenter as createB } from './presenterB.js';

let root, field, frame, startButton, status, carsToggle, playerSlot, chrome, presenter;
let ready = false, readinessProgress = 0, presence = -1, interactive = null, revealed = false;
let uiState = 'race', stateBeforeListening = 'race', selected = null, hovered = null, onStart, requestShowcase;
let routeEstablished = false, focusOnReveal = false;
let discovery = new Set(), ticks = [], revealTl, edgeTl;
const html = document.documentElement;
const debug = { lastDive: null, variant: 'a', state: 'race', selected: null, hovered: null };
const checkpointElements = new Map();
const el = (tag, className, text) => {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const savedProgress = () => !routeEstablished && getRestoredRouteProgress() !== null
  ? getRestoredRouteProgress() : state.progress;

function setUIState(next) {
  if (!['race', 'cars', 'listening'].includes(next)) return;
  const prev = uiState; uiState = next; debug.state = next;
  root.dataset.state = next;
  root.dataset.hubState = next;
  root.classList.toggle('is-cars-open', next === 'cars');
  carsToggle.setAttribute('aria-expanded', String(next === 'cars'));
  presenter.setState(next, prev);
}
function hoverCheckpoint(index) {
  hovered = index; debug.hovered = index; presenter.hoverCheckpoint(index);
}
function selectCheckpoint(index) {
  if (!interactive || uiState !== 'cars' || !Number.isInteger(index) || index < 0 || index >= CARS.length) return;
  selected = index; debug.selected = index;
  set('showcaseCarIndex', index);
  presenter.selectCheckpoint(index);
  const result = requestShowcase({ carIndex: index });
  if (!result.available) status.textContent = 'Showcase coming later.';
  return result;
}
function resetUI() {
  setUIState('race'); hoverCheckpoint(null); selected = null; debug.selected = null;
  presenter.selectCheckpoint(null); presenter.hoverStart(false); resetHubPlayer();
  if (ready) status.textContent = '';
}
function renderDiscovery() {
  for (const i of state.unlocked) discovery.add(i);
  presenter.setDiscovery(new Set(discovery));
  ticks.forEach((tick, i) => tick.classList.toggle('is-found', discovery.has(i)));
  carsToggle.setAttribute('aria-label', `Cars, ${discovery.size} of ${CARS.length} discovered`);
}
export function initHub({ onStartRace, camera, requestShowcase: showcase, setPoseOverride } = {}) {
  root = document.getElementById('hub');
  if (!root) throw new Error('Expected #hub');
  presenter?.dispose(); root.replaceChildren(); checkpointElements.clear();
  onStart = onStartRace;
  requestShowcase = showcase ?? (() => ({ available: false, reason: 'phase-6' }));
  const params = new URLSearchParams(window.location.search);
  const variant = params.get('hub') === 'b' ? 'b' : 'a';
  debug.variant = variant; root.dataset.variant = variant;
  field = el('div', 'hub-field'); field.setAttribute('aria-hidden', 'true');
  frame = el('div', 'hub-plan-frame'); frame.setAttribute('aria-hidden', 'true');
  const mark = el('span', 'hub-mark', 'GT3');
  const cars = el('div', 'hub-cars');
  carsToggle = el('button', 'hub-cars__toggle'); carsToggle.type = 'button';
  carsToggle.append(el('span', 'hub-cars__name', 'Cars'));
  const glyph = el('span', 'hub-cars__ticks'); glyph.setAttribute('aria-hidden', 'true');
  ticks = CARS.map(() => glyph.appendChild(el('i', ''))); carsToggle.append(glyph); cars.append(carsToggle);
  playerSlot = el('div', 'hub-player-slot');
  const startWrap = el('div', 'hub-start-wrap');
  status = el('p', 'hub-status'); status.setAttribute('aria-live', 'polite');
  startButton = el('button', 'hub-start'); startButton.type = 'button'; startButton.disabled = true;
  startButton.setAttribute('aria-label', 'Start race'); startButton.append(el('span', 'hub-start__word', 'Start race'));
  startWrap.append(status, startButton); root.append(field, frame);
  presenter = (variant === 'a' ? createA : createB)();
  presenter.build(root, { field, frame, startButton, camera, debug, playerSlot,
    setDebug: fields => Object.assign(debug, fields),
    worldDive: import.meta.env.DEV && params.get('dive') === 'world', setPoseOverride, hoverCheckpoint, selectCheckpoint,
    registerCheckpoint: (index, node) => checkpointElements.set(index, node),
    requestShowcase: ({ carIndex }) => selectCheckpoint(carIndex) ?? { available: false, reason: 'phase-6' },
    emit: (event, detail) => {
      if (event === 'listen') {
        stateBeforeListening = uiState === 'listening' ? stateBeforeListening : uiState;
        setUIState('listening');
      }
      if (event === 'close-listening') setUIState(stateBeforeListening);
      return detail;
    } });
  root.append(mark, cars, playerSlot, startWrap);
  initHubPlayer(playerSlot, { variant, onEvent: (event, detail) => {
    if (event === 'listen') { stateBeforeListening = uiState; setUIState('listening'); }
    if (event === 'close-listening') setUIState(stateBeforeListening);
    return detail;
  } });
  chrome = [mark, cars, playerSlot, startWrap];
  gsap.set(chrome, { autoAlpha: 0, y: 10 });
  carsToggle.addEventListener('click', event => {
    setUIState(uiState === 'cars' ? 'race' : 'cars');
    if (uiState === 'cars' && event.detail === 0) checkpointElements.get(selected ?? 0)?.focus();
  });
  startButton.addEventListener('click', () => { if (ready && interactive) onStart?.(); });
  for (const event of ['pointerenter', 'focus']) startButton.addEventListener(event, () => { if (revealed) presenter.hoverStart(true); });
  for (const event of ['pointerleave', 'blur']) startButton.addEventListener(event, () => presenter.hoverStart(false));
  root.addEventListener('keydown', event => {
    const checkpoint = [...checkpointElements].find(([, node]) => node === event.target)?.[0];
    if (uiState === 'cars' && checkpoint !== undefined) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCheckpoint(checkpoint); }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        checkpointElements.get((checkpoint + (event.key === 'ArrowRight' ? 1 : CARS.length - 1)) % CARS.length)?.focus();
      }
    }
    if (event.key === 'Escape' && uiState === 'listening') {
      closeHubListening(); event.preventDefault(); return;
    }
    if (event.key === 'Escape' && uiState !== 'race') {
      const target = uiState === 'cars' ? carsToggle : startButton;
      resetUI(); target?.focus(); event.preventDefault();
    }
  });
  let resizeTimer;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => presenter.layout(), 80);
  });
  subscribe('unlocked', renderDiscovery);
  subscribe('theme', theme => presenter.setTheme(theme));
  subscribe('transition', transition => { if (transition) resetUI(); });
  // themeToggle mounts later in boot. Its stable hook keeps Hub automation and
  // assistive discovery independent from the presentation that visually hosts it.
  const hookThemeControl = () => document.querySelector('.theme-segmented')?.setAttribute('data-control', 'theme');
  hookThemeControl();
  new MutationObserver(hookThemeControl).observe(document.body, { childList: true, subtree: true });
  presenter.setTheme(state.theme); renderDiscovery(); resetUI();
  presenter.setRoutePosition(savedProgress()); root.inert = true;
  if (import.meta.env.DEV) window.__gt3.hub = {
    debug: () => {
      const marker = presenter.debug?.marker ?? {};
      const draw = presenter.debug?.drawStats ?? {};
      return { variant, state: uiState, player: getHubPlayerDebug(),
        markerScreen: { x: marker.x ?? 0, y: marker.y ?? 0 },
        checkpointsScreen: [...checkpointElements].map(([car, node]) => {
          const box = node.getBoundingClientRect(); return { car, x: box.x, y: box.y };
        }), drawsLastFrame: draw.frames ?? 0, renderedFramesLastSecond: draw.frames ?? 0 };
    },
    get lastDive() { return debug.lastDive; },
    get pose() { return presenter.debug?.pose; },
    snapshot: () => ({ variant, uiState, selected, hovered, presence, interactive,
      marker: { ...presenter.debug?.marker }, drawStats: { ...presenter.debug?.drawStats } }),
  };
}
export function setHubReadiness(readiness) {
  if (!root) return;
  const loading = readiness.status === 'loading', failed = readiness.status === 'failed';
  readinessProgress = loading ? readiness.progress : failed ? 0 : 1;
  ready = !loading && !failed;
  root.dataset.readiness = loading ? 'loading' : failed ? 'failed' : 'ready';
  startButton.disabled = !ready; startButton.setAttribute('aria-busy', String(loading));
  status.textContent = failed ? 'Route unavailable. Reload the page to try again.'
    : loading ? `Preparing the grid ${String(Math.round(readinessProgress * 100)).padStart(2, '0')}%` : '';
  presenter.setReadiness(revealed ? readinessProgress : 0, readiness.status);
}
function reveal() {
  revealed = true; resetUI(); presenter.layout(); presenter.setRoutePosition(savedProgress());
  presenter.setReadiness(readinessProgress, root.dataset.readiness);
  revealTl?.kill();
  revealTl = gsap.timeline().to(chrome, { autoAlpha: 1, y: 0, duration: reducedMotion.matches ? 0 : 0.65, ease: 'gt3.out', stagger: 0.06 });
  if (focusOnReveal) {
    focusOnReveal = false;
    revealTl.eventCallback('onComplete', () => { if (interactive) startButton.focus({ preventScroll: true }); });
  }
}
export function setHubPresence(value, canInteract) {
  if (!root) return;
  const next = Math.round(value * 1000) / 1000;
  if (next !== presence) {
    presence = next; root.style.opacity = String(next); root.hidden = next <= 0;
    if (next > 0) delete html.dataset.boot;
  }
  if (canInteract !== interactive) {
    interactive = canInteract; root.inert = !canInteract; root.classList.toggle('is-interactive', canInteract);
    if (canInteract) { document.querySelector('.theme-segmented')?.setAttribute('data-control', 'theme'); html.classList.remove('is-hub-covering'); reveal(); }
    else {
      resetUI(); revealTl?.kill(); revealed = false;
      gsap.to(chrome, { autoAlpha: 0, y: 10, duration: 0.18 });
      presenter.setReadiness(0, root.dataset.readiness);
    }
  }
}
export function updateHub(dt) {
  if (!root || root.hidden || presence <= 0) return;
  updateHubPlayer(); presenter.update(dt);
}
export function renderHub() { return presenter?.render?.() ?? false; }
export function resetHub(value, canInteract) {
  edgeTl?.kill(); presenter.reset?.(); resetUI();
  gsap.killTweensOf(root); root.style.transition = '';
  html.classList.remove('is-hub-covering'); presence = -1; interactive = null; revealed = false;
  setHubPresence(value, canInteract);
}
export function prepareLeave() { html.classList.add('is-hub-covering'); }
function freeze() {
  interactive = false; root.inert = true; root.classList.remove('is-interactive');
  revealTl?.kill(); resetUI();
  // Resetting state can produce a labels timeline; its own targets stay inside the presenter.
}
export function leaveHub(seam = {}) {
  return new Promise(resolve => {
    routeEstablished = true;
    freeze(); presenter.setReadiness(1, 'ready');
    gsap.to(chrome, { autoAlpha: 0, y: -6, duration: 0.25 });
    edgeTl = presenter.launch(seam);
    edgeTl.eventCallback('onComplete', ((previous) => () => {
      previous?.(); root.hidden = true; presence = 0; revealed = false; root.style.opacity = '0';
      html.classList.remove('is-hub-covering'); resolve();
    })(edgeTl.eventCallback('onComplete')));
  });
}
export function coverHub(seam = {}) {
  return new Promise(resolve => {
    routeEstablished = true; focusOnReveal = true;
    freeze(); root.hidden = false; root.style.opacity = '1'; presence = 1; revealed = false;
    html.classList.add('is-hub-covering'); gsap.set(chrome, { autoAlpha: 0, y: 10 });
    presenter.setReadiness(1, 'ready'); presenter.setRoutePosition(seam.progress ?? state.progress);
    edgeTl = presenter.returnTo(seam);
    edgeTl.eventCallback('onComplete', ((previous) => () => {
      previous?.(); presence = 1;
      // reveal() restores focus after main.js restores experience/scroll ownership.
      resolve();
    })(edgeTl.eventCallback('onComplete')));
  });
}
