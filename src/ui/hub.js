/**
 * hub.js — the Grand Tour Hub (SPEC §5, §9, §25), Phase 5 candidate.
 *
 * One idea organises the surface: the start line. A single hairline crosses the field; START RACE
 * stands on it, the cover art rests on it, and everything secondary hangs below it. The short
 * checker strip under START RACE is the restrained checkered accent SPEC §5 allows, and it is
 * also the loading indicator (SPEC §25): it paints in column by column while the route prepares,
 * and START RACE commits only once it is complete.
 *
 * The field is two shutters meeting at the line. START RACE parts them (the upper one carries the
 * words away) to reveal the Grand Tour's opening frame underneath; the home control closes them
 * again. All motion is CSS transitions or WAAPI: no extra frame loop (ARCHITECTURE single RAF).
 *
 * Provisional review alternatives (owner's visual call): `?hub=line` (default, editorial left
 * stack) or `?hub=centre` (symmetric, continuing the Landing's centred stack); `?entry=fade`
 * restores the Phase 4 field fade for comparison; `?cars=static` shows Cars as a roster glyph
 * only (owner decision D6: what Cars does before the Phase 6 Showcase exists).
 */

import { state, subscribe } from '../core/state.js';
import { CARS } from '../data/cars.js';
import { initHubPlayer, resetHubPlayer, updateHubPlayer } from './hubPlayer.js';

const params = new URLSearchParams(window.location.search);
const LAYOUT = params.get('hub') === 'centre' ? 'centre' : 'line';
const ENTRY = params.get('entry') === 'fade' ? 'fade' : 'shutter';
const CARS_MODE = params.get('cars') === 'static' ? 'static' : 'roster';
const CHECK = 5; // px per checker square; the strip is two rows (matches --check in hub.css)
const RECEDE_MS = 300;
const OPEN_MS = 940;
const CLOSE_MS = 760;
const FADE_MS = 520;
const SETTLE_MS = 1100; // reveal length; after it, hover timings apply (hub.css is-settled)

let root = null;
let shutterTop;
let shutterBottom;
let startButton;
let startWord;
let strip;
let status;
let carsToggle;
let roster;
let ticks = [];
let ready = false;
let onStart = null;
let presence = -1;
let interactive = null;
let rosterOpen = false;
let lastReadiness = '';
let timers = [];
let settleTimer = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function later(fn, ms) {
  const id = window.setTimeout(() => {
    timers = timers.filter((t) => t !== id);
    fn();
  }, ms);
  timers.push(id);
  return id;
}

function clearTimers() {
  for (const id of timers) window.clearTimeout(id);
  timers = [];
}

function quick() {
  return ENTRY === 'fade' || reduceMotion.matches;
}

/** Keep the strip exactly as wide as the words above it, in whole checker columns. */
function measure() {
  if (!startWord) return;
  const width = startWord.getBoundingClientRect().width;
  if (!width) return;
  const columns = Math.max(8, Math.round(width / CHECK));
  root.style.setProperty('--strip-cols', String(columns));
  root.style.setProperty('--check', `${CHECK}px`);
  renderStrip(Number(root.dataset.progress || 0));
}

function renderStrip(progress) {
  const columns = Number(root.style.getPropertyValue('--strip-cols')) || 0;
  const filled = Math.round(Math.min(1, Math.max(0, progress)) * columns);
  root.style.setProperty('--strip-filled', String(filled));
}

function buildCars() {
  const wrap = el('div', 'hub-cars');
  const glyph = el('span', 'hub-cars__ticks');
  glyph.setAttribute('aria-hidden', 'true');
  ticks = CARS.map(() => glyph.appendChild(el('i')));
  const name = el('span', 'hub-cars__name', 'Cars');
  if (CARS_MODE === 'static') {
    const label = el('div', 'hub-cars__toggle is-static');
    label.append(name, glyph);
    wrap.append(label);
  } else {
    carsToggle = el('button', 'hub-cars__toggle');
    carsToggle.type = 'button';
    carsToggle.setAttribute('aria-expanded', 'false');
    carsToggle.setAttribute('aria-controls', 'hub-roster');
    carsToggle.append(name, glyph);
    roster = el('ol', 'hub-roster');
    roster.id = 'hub-roster';
    roster.inert = true;
    CARS.forEach((car, index) => {
      const item = el('li', 'hub-roster__car');
      item.style.setProperty('--i', String(index));
      roster.append(item);
    });
    carsToggle.addEventListener('click', () => setRoster(!rosterOpen));
    wrap.append(carsToggle, roster);
  }
  renderCars();
  return wrap;
}

/** Discovery is monotonic (SPEC §26); undiscovered identities stay concealed as `?` (§11). */
function renderCars() {
  const found = state.unlocked;
  ticks.forEach((tick, index) => tick.classList.toggle('is-found', found.has(index)));
  const count = CARS.filter((_, index) => found.has(index)).length;
  const label = `Cars, ${count} of ${CARS.length} discovered`;
  if (carsToggle) carsToggle.setAttribute('aria-label', label);
  if (!roster) return;
  CARS.forEach((car, index) => {
    const item = roster.children[index];
    const known = found.has(index);
    item.classList.toggle('is-found', known);
    item.textContent = known ? `${car.manufacturer} ${car.model}` : '?';
    item.setAttribute('aria-label', known ? car.displayName || `${car.manufacturer} ${car.model}` : 'Undiscovered car');
  });
}

function setRoster(open) {
  if (!roster) return;
  rosterOpen = open;
  roster.inert = !open;
  root.classList.toggle('is-roster-open', open);
  carsToggle.setAttribute('aria-expanded', String(open));
}

function build() {
  root.replaceChildren();
  root.dataset.layout = LAYOUT;
  root.dataset.entry = ENTRY;

  shutterTop = el('div', 'hub-shutter hub-shutter--top');
  shutterBottom = el('div', 'hub-shutter hub-shutter--bottom');

  const mark = el('span', 'hub-mark', 'GT3');
  mark.setAttribute('aria-hidden', 'true');
  const startWrap = el('div', 'hub-start-wrap');
  startButton = el('button', 'hub-start');
  startButton.type = 'button';
  startButton.disabled = true;
  startWord = el('span', 'hub-start__word', 'Start race');
  startButton.append(startWord);
  startWrap.append(startButton);
  shutterTop.append(mark, startWrap);

  const line = el('span', 'hub-line');
  line.setAttribute('aria-hidden', 'true');
  strip = el('div', 'hub-strip');
  strip.setAttribute('aria-hidden', 'true');
  strip.append(el('span', 'hub-strip__base'), el('span', 'hub-strip__fill'));
  status = el('p', 'hub-status');
  status.setAttribute('aria-live', 'polite');
  shutterBottom.append(line, strip, status, buildCars());

  const playerSlot = el('div', 'hub-player-slot');
  initHubPlayer(playerSlot);

  root.append(shutterTop, shutterBottom, playerSlot);
  startButton.addEventListener('click', () => { if (ready && interactive) onStart?.(); });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && rosterOpen) {
      setRoster(false);
      carsToggle?.focus();
    }
  });

  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(startWord);
  document.fonts?.ready.then(measure);
  subscribe('unlocked', renderCars);
}

export function initHub({ onStartRace }) {
  root = document.getElementById('hub');
  if (!root) throw new Error('Expected #hub');
  onStart = onStartRace;
  build();
  root.inert = true;
  measure();
}

/** Mirror the one Tour readiness decision (main.js) on START RACE and the strip. */
export function setHubReadiness(readiness) {
  if (!root) return;
  const loading = readiness.status === 'loading';
  const failed = readiness.status === 'failed';
  const progress = loading ? readiness.progress : failed ? 0 : 1;
  const percent = Math.round(progress * 100);
  const key = `${readiness.status}:${percent}`;
  if (key === lastReadiness) return;
  lastReadiness = key;
  ready = !loading && !failed;
  startButton.disabled = !ready;
  startButton.setAttribute('aria-busy', String(loading));
  root.dataset.readiness = loading ? 'loading' : failed ? 'failed' : 'ready';
  root.dataset.progress = String(progress);
  renderStrip(progress);
  status.textContent = failed ? 'Route unavailable. Reload the page to try again.'
    : loading ? `Preparing the grid ${String(percent).padStart(2, '0')}%` : '';
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
    if (next > 0) delete document.documentElement.dataset.boot;
  }
  if (canInteract !== interactive) {
    interactive = canInteract;
    root.inert = !canInteract;
    root.classList.toggle('is-interactive', canInteract);
    root.classList.toggle('is-revealed', canInteract);
    root.classList.remove('is-settled');
    window.clearTimeout(settleTimer);
    if (canInteract) {
      document.documentElement.classList.remove('is-hub-covering');
      settleTimer = window.setTimeout(() => root.classList.add('is-settled'), SETTLE_MS);
    } else {
      setRoster(false);
      resetHubPlayer();
    }
  }
}

/** Per frame from main.js while the Hub is on screen. */
export function updateHub() {
  if (root && !root.hidden && presence > 0) updateHubPlayer();
}

/** Restore a settled field after an interrupted handoff, including cached DOM state. */
export function resetHub(value, canInteract) {
  clearTimers();
  root.classList.remove('is-launching', 'is-open', 'is-instant');
  document.documentElement.classList.remove('is-hub-covering');
  root.style.transition = '';
  presence = -1;
  interactive = null;
  setHubPresence(value, canInteract);
}

/** Call before the world switches to the Tour, so its HUD never shows over the closed field. */
export function prepareLeave() {
  document.documentElement.classList.add('is-hub-covering');
}

/**
 * Hub -> Grand Tour. START RACE leans into its launch, the secondary composition steps back,
 * then the field parts along the start line onto the Tour's opening frame (already drawn
 * underneath by main.js). Resolves when the Tour is fully uncovered.
 */
export function leaveHub() {
  return new Promise((resolve) => {
    clearTimers();
    interactive = false;
    root.inert = true;
    root.classList.remove('is-interactive', 'is-settled');
    window.clearTimeout(settleTimer);
    setRoster(false);
    resetHubPlayer();
    const html = document.documentElement;
    html.classList.add('is-hub-covering');
    const finish = () => {
      root.hidden = true;
      presence = 0;
      root.style.transition = '';
      root.style.opacity = '0';
      root.classList.remove('is-launching', 'is-open', 'is-revealed');
      html.classList.remove('is-hub-covering');
      resolve();
    };
    if (quick()) {
      root.style.transition = `opacity ${FADE_MS}ms var(--ease)`;
      root.style.opacity = '0';
      later(() => { html.classList.remove('is-hub-covering'); }, FADE_MS * 0.5);
      later(finish, FADE_MS);
      return;
    }
    root.classList.add('is-launching');
    later(() => {
      root.classList.add('is-open');
      // The Tour HUD rises as the gap opens, not after it.
      later(() => html.classList.remove('is-hub-covering'), OPEN_MS * 0.45);
    }, RECEDE_MS);
    later(finish, RECEDE_MS + OPEN_MS);
  });
}

/**
 * Grand Tour -> Hub. The two halves close over the Tour and meet on the line; the Hub's
 * composition then reveals itself once main.js hands the screen to the Hub.
 */
export function coverHub() {
  return new Promise((resolve) => {
    clearTimers();
    interactive = false;
    root.inert = true;
    root.classList.remove('is-interactive', 'is-revealed');
    root.hidden = false;
    root.style.transition = 'none';
    const html = document.documentElement;
    html.classList.add('is-hub-covering');
    const done = () => {
      root.style.transition = '';
      root.classList.remove('is-open', 'is-instant');
      presence = 1;
      resolve(); // is-hub-covering stays until the Hub owns the screen (setHubPresence)
    };
    if (quick()) {
      root.style.opacity = '0';
      void root.offsetWidth;
      root.style.transition = `opacity ${FADE_MS}ms var(--ease)`;
      root.style.opacity = '1';
      later(done, FADE_MS);
      return;
    }
    // Start parted with no transition, then let the shutters travel home.
    root.classList.add('is-instant', 'is-open');
    root.style.opacity = '1';
    void root.offsetWidth;
    root.classList.remove('is-instant', 'is-open');
    later(done, CLOSE_MS);
  });
}
