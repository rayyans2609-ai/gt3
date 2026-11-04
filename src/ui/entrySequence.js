import { state, subscribe } from '../core/state.js';
import { lockScroll, unlockScrollWhenQuiet, onFirstScroll } from '../scroll/scrollDrive.js';
import { dismissStartScreen } from './startScreen.js';

// Owner-tunable choreography. The quiet-input gate may delay arming beyond lights-out.
const HOUSING_FADE_MS = 280;
const FIRST_LAMP_DELAY_MS = 500;
const LAMP_INTERVAL_MS = 600;
const HOLD_MIN_MS = 500;
const HOLD_MAX_MS = 1300;
const GO_ENTER_MS = 140;
const GO_HOLD_MS = 520;
const GO_EXIT_MS = 320;
const CONTROL_DELAY_MS = 150;
const CONTROL_FADE_MS = 400;

let root;
let housing;
let go;
let control;
let lamps;
let current = null;

function wait(run, ms) {
  return new Promise(resolve => {
    const id = setTimeout(() => { run.timers.delete(id); resolve(true); }, ms);
    run.timers.set(id, () => resolve(false));
  });
}

function dismissControl(run) {
  if (current !== run || control.hidden || control.classList.contains('is-leaving')) return;
  control.classList.add('is-leaving');
  void wait(run, CONTROL_FADE_MS).then(alive => {
    if (!alive || current !== run) return;
    control.hidden = true;
    dismissStartScreen();
    run.cleanups.splice(0).forEach(cleanup => cleanup());
  });
}

function showControl(run) {
  if (current !== run) return;
  control.hidden = false;
  if (run.scrolled) dismissControl(run);
}

function watchFirstScroll(run) {
  const scrolled = () => {
    if (current !== run) return;
    run.scrolled = true;
    dismissControl(run);
  };
  if (!state.started) {
    onFirstScroll(scrolled);
  } else {
    // onFirstScroll is session-once. A return to the start line still needs a NEW genuine
    // scroll; mirror its trusted-input + unlocked-scroll semantics without reading scrollY.
    let inputAt = -Infinity;
    const keys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar']);
    const noteInput = event => {
      if (!event.isTrusted || state.scrollLocked || document.visibilityState === 'hidden') return;
      if (event.type === 'wheel' && event.deltaY === 0) return;
      if (event.type === 'keydown' && !keys.has(event.key)) return;
      if (event.type === 'pointerdown' && event.clientX < document.documentElement.clientWidth
        && event.clientY < document.documentElement.clientHeight) return;
      inputAt = performance.now();
    };
    const onScroll = () => {
      if (!state.scrollLocked && performance.now() - inputAt <= 1000) scrolled();
    };
    for (const event of ['wheel', 'touchmove', 'keydown', 'pointerdown']) {
      window.addEventListener(event, noteInput, { passive: true });
      run.cleanups.push(() => window.removeEventListener(event, noteInput));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    run.cleanups.push(() => window.removeEventListener('scroll', onScroll));
  }
}

/** One independent screen-space layer; it never captures the Tour's home or audio controls. */
export function initEntrySequence() {
  if (root) return;
  root = document.createElement('div');
  root.id = 'entry-sequence';
  root.hidden = true;
  root.innerHTML = `<div class="entry-housing" role="img" aria-label="Standing start lights">
    ${'<span class="entry-lamp" aria-hidden="true"></span>'.repeat(5)}
    </div><div class="entry-go" role="status" hidden>GO</div>
    <div class="entry-scroll" hidden><span class="entry-scroll__label">Scroll to race</span>
    <span class="entry-scroll__capsule" aria-hidden="true"><span class="entry-scroll__segment"></span></span></div>`;
  document.getElementById('overlay').append(root);
  housing = root.querySelector('.entry-housing');
  lamps = [...root.querySelectorAll('.entry-lamp')];
  go = root.querySelector('.entry-go');
  control = root.querySelector('.entry-scroll');
  subscribe('experience', experience => { if (experience !== 'tour') cancelEntry(); });
}

/** Cancels every delayed visual and quiet unlock; only a new entry may arm the drive. */
export function cancelEntry() {
  if (current) {
    lockScroll();
    for (const [id, cancelled] of current.timers) { clearTimeout(id); cancelled(); }
    current.cleanups.splice(0).forEach(cleanup => cleanup());
    current.resolve('cancelled');
    current = null;
  }
  if (!root) return;
  root.hidden = true;
  root.dataset.phase = 'idle';
  root.dataset.armed = 'false';
  housing.className = 'entry-housing';
  housing.hidden = true;
  go.hidden = true;
  go.className = 'entry-go';
  control.hidden = true;
  control.className = 'entry-scroll';
  lamps.forEach(lamp => lamp.classList.remove('is-on'));
}

export function isEntryRunning() {
  return !!current && !current.armed;
}

export function runEntry({ standingStart }) {
  initEntrySequence();
  cancelEntry();
  if (state.experience !== 'tour' || state.mode !== 'race' || state.transition) {
    return Promise.resolve('cancelled');
  }
  lockScroll();
  let resolve;
  const result = new Promise(done => { resolve = done; });
  const run = current = { resolve, timers: new Map(), cleanups: [], armed: false, scrolled: false };
  const showPrompt = standingStart || !document.getElementById('start-screen').classList.contains('is-prompt-only');
  if (showPrompt) watchFirstScroll(run);
  root.hidden = false;
  root.dataset.phase = standingStart ? 'reds' : 'resume';
  const arm = () => unlockScrollWhenQuiet(() => {
    if (current !== run) return;
    run.armed = true;
    root.dataset.armed = 'true';
    resolve('armed');
  });
  root.dataset.armed = 'false';
  if (!standingStart) {
    arm();
    if (showPrompt) showControl(run);
    return result;
  }
  void (async () => {
    housing.hidden = false;
    // Flush the off state so the housing has its own fade before any lamp lights.
    void housing.offsetWidth;
    housing.classList.add('is-visible');
    if (!await wait(run, HOUSING_FADE_MS + FIRST_LAMP_DELAY_MS)) return;
    for (let i = 0; i < lamps.length; i++) {
      lamps[i].classList.add('is-on');
      housing.setAttribute('aria-label', `${i + 1} of 5 start lights red`);
      if (i < lamps.length - 1 && !await wait(run, LAMP_INTERVAL_MS)) return;
    }
    if (!await wait(run, HOLD_MIN_MS + Math.random() * (HOLD_MAX_MS - HOLD_MIN_MS))) return;
    // One task removes all reds and requests the quiet unlock. No red-phase input is banked.
    lamps.forEach(lamp => lamp.classList.remove('is-on'));
    root.dataset.phase = 'go';
    housing.setAttribute('aria-label', 'Lights out');
    housing.classList.remove('is-visible');
    go.hidden = false;
    arm();
    void wait(run, CONTROL_DELAY_MS).then(alive => { if (alive) showControl(run); });
    if (!await wait(run, GO_ENTER_MS + GO_HOLD_MS)) return;
    go.classList.add('is-leaving');
    if (!await wait(run, GO_EXIT_MS)) return;
    go.hidden = true;
    housing.hidden = true;
    root.dataset.phase = 'control';
  })();
  return result;
}
