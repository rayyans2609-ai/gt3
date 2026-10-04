/**
 * scrollDrive.js — the scroll -> drive mapping. (SPEC §4)
 *
 * OWNED BY THE MANAGER. This module is the single source of truth for how far along
 * the track the car is. No other module may read window.scrollY.
 *
 * Responsibilities:
 *   - read raw scroll position -> state.targetProgress (0 at start line, 1 at finish)
 *   - each frame, ease state.progress toward the target (never map raw scroll to render)
 *   - derive a signed scroll velocity and a smoothed 0..1 speed intensity that the
 *     camera (FOV), post-processing (motion blur), track markings and grass streaking
 *     all read from, so "how hard you scroll" is felt everywhere
 *   - own the scroll lock used by the montage, the fullscreen card and Showcase Mode
 *   - fire the one-time "first scroll" that dismisses the start screen and opens the
 *     browser's audio autoplay gate
 */

import { state, set } from '../core/state.js';
import { TRACK_LENGTH } from '../scene/trackCurve.js';
import { createBoundedModel } from './boundedPace.js';

const REFERENCE_LENGTH = 3472.646166835742;

// ---------------------------------------------------------------------------
// Tuning. These numbers are the feel of the whole experience — change carefully.
// ---------------------------------------------------------------------------
const TUNE = {
  // Fraction of the remaining gap closed per frame at 60fps. Lower = heavier car.
  // 0.075 gives a weighty glide that still tracks the wheel without feeling laggy.
  damping: 0.075,

  // Progress-per-second that counts as "flat out". A full route is 1.0 of progress,
  // so 0.09 means roughly eleven seconds of sustained hard scrolling end to end.
  velocityFullScale: 0.09 * REFERENCE_LENGTH / TRACK_LENGTH,

  // Rise/fall smoothing for speed01. Speed builds a little faster than it decays so
  // acceleration reads instantly but the scene settles gracefully when you stop.
  speedAttack: 0.14,
  speedRelease: 0.055,

  // Below this the car is treated as stopped — kills 1-pixel jitter on trackpads.
  idleEpsilon: 0.00004,

  // Total scroll spacer height in viewport heights. Must match #scroll-spacer in CSS.
  spacerVh: 1200 * TRACK_LENGTH / REFERENCE_LENGTH,
};

// ---------------------------------------------------------------------------
// ?scroll= pace candidates (SPEC §14 "Bounded pace"). Independent URL parameter: this module
// reads only `scroll`, never `comp`/`cam`/`gate`, and no other module reads it. No param (or an
// unknown value) = the default law below, unchanged.
//   ?scroll=cap   capped glide: bounded lead, hard speed ceiling, bounded acceleration
//   ?scroll=pace  input intensity sets pace through a compressive curve into a narrow band
//
// Alignment contract for the candidates (the default mode is untouched):
//   - The page scrollbar is only an INPUT DEVICE. Each frame update() reads window.scrollY and
//     feeds the delta since `lastY` to the model. Every programmatic scrollTo this module makes
//     (re-sync, seekTo, unlock, reset) is followed by `lastY = window.scrollY`, so our own
//     re-syncs can never be read back as input; the 'scroll' event is not an input path here.
//   - Wheel, trackpad, keyboard (arrows/PageUp/PageDown/Home/End) and scrollbar drag all arrive as
//     scrollY deltas and are bounded identically; none is converted to anything else.
//   - The page position can run ahead of the car (excess input is discarded, not banked). When
//     input is idle (>= RESYNC_IDLE_S) the page is re-synced to the car's target (position+credit);
//     if the page is pinned against an end while the car is not, the re-sync happens sooner
//     (STRANDED_IDLE_S) so the user can always keep scrolling in both directions. A re-sync never
//     happens during active input/momentum, nor while a classic scrollbar thumb is held.
// ---------------------------------------------------------------------------
function readScrollMode() {
  try {
    const v = new URLSearchParams(globalThis.location?.search || '').get('scroll');
    return v === 'cap' || v === 'pace' ? v : 'default';
  } catch { return 'default'; }
}
export const scrollMode = readScrollMode();
const bounded = scrollMode === 'default' ? null : createBoundedModel(scrollMode, TRACK_LENGTH);
const RESYNC_IDLE_S = 0.14;
const STRANDED_IDLE_S = 0.05;
let lastY = 0;               // page scrollY already accounted for (candidates only)
let thumbHeld = false;       // classic-scrollbar drag in progress (candidates only)

let rawTarget = 0;      // undamped progress straight from the scrollbar
let lastProgress = 0;   // previous frame's damped progress, for velocity
let smoothedSpeed = 0;  // eased 0..1 intensity
let lockedScrollY = 0;  // scroll position frozen at the moment of locking
let hasStarted = false;
let swallowersAttached = false;

const firstScrollHandlers = [];

// ---------------------------------------------------------------------------
// Scroll reading
// ---------------------------------------------------------------------------

function maxScroll() {
  return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
}

function readScroll() {
  const y = window.scrollY || window.pageYOffset || 0;
  return Math.min(1, Math.max(0, y / maxScroll()));
}

function onScroll() {
  if (state.scrollLocked) {
    // Locked: pin the viewport. Anything that slipped through (momentum fling,
    // find-in-page, a stray keypress) is snapped straight back.
    if (Math.abs(window.scrollY - lockedScrollY) > 0.5) {
      window.scrollTo(0, lockedScrollY);
    }
    return;
  }

  if (bounded) {
    // Candidates: input is polled per frame in update(); the event only dismisses the start screen.
    if (!hasStarted && (window.scrollY || 0) > 0) startDrive();
    return;
  }

  rawTarget = readScroll();
  set('targetProgress', rawTarget);

  if (!hasStarted && rawTarget > 0) startDrive();
}

function startDrive() {
  hasStarted = true;
  set('started', true);
  for (const fn of firstScrollHandlers) fn();
  firstScrollHandlers.length = 0;
}

/** Candidates: place the page at route progress `t` and mark that scroll position as accounted for. */
function syncPageTo(t) {
  const y = Math.min(1, Math.max(0, t)) * maxScroll();
  if (Math.abs((window.scrollY || 0) - y) > 0.5) window.scrollTo(0, y);
  lastY = window.scrollY || 0;
}

function pointerDown(e) {
  const root = document.documentElement;
  if (e.clientX >= root.clientWidth || e.clientY >= root.clientHeight) thumbHeld = true;
}
function pointerUp() { thumbHeld = false; }

// While locked we swallow the input events themselves, so the page never even
// begins to move. passive:false is required for preventDefault to be honoured.
const SCROLL_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar',
]);

function swallow(e) {
  if (state.scrollLocked) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function swallowKeys(e) {
  if (state.scrollLocked && SCROLL_KEYS.has(e.key)) {
    e.preventDefault();
  }
}

function attachSwallowers() {
  if (swallowersAttached) return;
  window.addEventListener('wheel', swallow, { passive: false });
  window.addEventListener('touchmove', swallow, { passive: false });
  swallowersAttached = true;
}

function detachSwallowers() {
  if (!swallowersAttached) return;
  window.removeEventListener('wheel', swallow, { passive: false });
  window.removeEventListener('touchmove', swallow, { passive: false });
  swallowersAttached = false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Freeze the drive. The car holds its exact position on the spline and the page
 * cannot be scrolled. Used by the montage, the fullscreen card and Showcase Mode.
 */
export function lockScroll() {
  if (state.scrollLocked) {
    attachSwallowers();
    return;
  }
  lockedScrollY = window.scrollY;
  set('scrollLocked', true);
  attachSwallowers();
}

/**
 * Release the drive exactly where it was frozen — the race resumes from the same
 * point, with no jump, because rawTarget was never allowed to drift while locked.
 */
export function unlockScroll() {
  if (!state.scrollLocked) {
    detachSwallowers();
    return;
  }
  set('scrollLocked', false);
  detachSwallowers();
  if (bounded) {
    // Nothing received while locked is banked: the page goes to the car, the model starts at rest.
    bounded.reset(state.progress * TRACK_LENGTH);
    syncPageTo(state.progress);
    rawTarget = state.progress;
    set('targetProgress', state.progress);
    return;
  }
  window.scrollTo(0, lockedScrollY);
  rawTarget = readScroll();
  set('targetProgress', rawTarget);
}

/** Register a callback for the very first scroll input (start screen, audio gate). */
export function onFirstScroll(fn) {
  if (hasStarted) fn();
  else firstScrollHandlers.push(fn);
}

/** Jump the drive back to the start line — the "Replay route" control. */
export function resetToStart() {
  set('scrollLocked', false);
  detachSwallowers();
  window.scrollTo(0, 0);
  rawTarget = 0;
  lastProgress = 0;
  smoothedSpeed = 0;
  lockedScrollY = 0;
  if (bounded) { bounded.reset(0); lastY = window.scrollY || 0; }
  set('targetProgress', 0);
  set('progress', 0);
  set('velocity', 0);
  set('speed01', 0);
}

/**
 * Scroll the page so that the drive sits at `t`. Used by the finish sequence and
 * anything that needs to place the car without the user having to scroll there.
 */
export function seekTo(t, { instant = false } = {}) {
  const clamped = Math.min(1, Math.max(0, t));
  window.scrollTo(0, clamped * maxScroll());
  rawTarget = clamped;
  set('targetProgress', clamped);
  if (bounded) {
    lastY = window.scrollY || 0;
    // Instant: no banked credit, no glide, no speed. Otherwise a speed-limited glide to `t`.
    if (instant) bounded.reset(clamped * TRACK_LENGTH);
    else bounded.seek(clamped * TRACK_LENGTH);
  }
  if (instant) {
    lastProgress = clamped;
    set('progress', clamped);
    set('velocity', 0);
    set('speed01', 0);
  }
}

// ---------------------------------------------------------------------------
// Frame update
// ---------------------------------------------------------------------------

/**
 * Called once per frame from main.js's single rAF loop.
 * Writes state.progress, state.velocity and state.speed01.
 */
export function update(dt) {
  if (bounded) return updateBounded(dt);
  // Frame-rate independent damping. The naive `t += (target - t) * k` is tied to
  // frame rate; this gives the same feel at 60, 120 and 144 Hz.
  const k = 1 - Math.pow(1 - TUNE.damping, dt * 60);

  const target = state.scrollLocked ? state.progress : rawTarget;
  let p = state.progress + (target - state.progress) * k;

  // Snap when we're within a hair of the target so the car actually comes to rest.
  if (Math.abs(target - p) < TUNE.idleEpsilon) p = target;
  p = Math.min(1, Math.max(0, p));

  // Signed velocity in progress-per-second, normalised so 1 is flat out.
  // Negative when scrolling back up — the drive reverses smoothly.
  const dp = p - lastProgress;
  const rawVelocity = dt > 0 ? dp / dt / TUNE.velocityFullScale : 0;
  const velocity = Math.max(-1.6, Math.min(1.6, rawVelocity));

  // Intensity is unsigned: reversing hard should streak the world just as much as
  // driving hard forward does.
  const targetSpeed = Math.min(1, Math.abs(velocity));
  const sk = targetSpeed > smoothedSpeed ? TUNE.speedAttack : TUNE.speedRelease;
  smoothedSpeed += (targetSpeed - smoothedSpeed) * (1 - Math.pow(1 - sk, dt * 60));
  if (smoothedSpeed < 0.0015) smoothedSpeed = 0;

  lastProgress = p;
  set('progress', p);
  set('velocity', velocity);
  set('speed01', smoothedSpeed);
}

function updateBounded(dt) {
  const locked = state.scrollLocked;
  if (locked) {
    // Frozen: anything the page did while locked is discarded, the model sits at rest on the car.
    lastY = window.scrollY || 0;
    bounded.reset(state.progress * TRACK_LENGTH);
  } else {
    const y = window.scrollY || 0;
    const dy = y - lastY;
    lastY = y;
    if (dy !== 0) bounded.addInput(dy, TRACK_LENGTH / maxScroll());
  }
  bounded.step(dt);

  const p = Math.min(1, Math.max(0, bounded.p / TRACK_LENGTH));
  const targetP = Math.min(1, Math.max(0, bounded.targetMeters() / TRACK_LENGTH));
  rawTarget = targetP;
  set('targetProgress', targetP);

  if (!locked && !thumbHeld) {
    const max = maxScroll();
    const y = window.scrollY || 0;
    const wantY = targetP * max;
    const stranded = (y <= 1 && wantY > 1) || (y >= max - 1 && wantY < max - 1);
    if (Math.abs(y - wantY) > 1 && bounded.idle >= (stranded ? STRANDED_IDLE_S : RESYNC_IDLE_S)) {
      window.scrollTo(0, wantY);
      lastY = window.scrollY || 0;
    }
  }

  const dp = p - lastProgress;
  const velocity = Math.max(-1.6, Math.min(1.6, dt > 0 ? dp / dt / TUNE.velocityFullScale : 0));
  const targetSpeed = Math.min(1, Math.abs(velocity));
  const sk = targetSpeed > smoothedSpeed ? TUNE.speedAttack : TUNE.speedRelease;
  smoothedSpeed += (targetSpeed - smoothedSpeed) * (1 - Math.pow(1 - sk, dt * 60));
  if (smoothedSpeed < 0.0015) smoothedSpeed = 0;

  lastProgress = p;
  set('progress', p);
  set('velocity', velocity);
  set('speed01', smoothedSpeed);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function onResize() {
  // Page height changed: re-place the page on the car so px<->metre mapping stays aligned.
  if (bounded && !state.scrollLocked) syncPageTo(state.progress);
  onScroll();
}

export function initScrollDrive() {
  const spacer = document.getElementById('scroll-spacer');
  if (spacer && !spacer.style.height) spacer.style.height = `${TUNE.spacerVh}vh`;

  // The browser restores scroll position on reload; that would drop the user into
  // the middle of the route with the start screen still up.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('keydown', swallowKeys, { passive: false });
  window.addEventListener('resize', onResize);
  if (bounded) {
    // Passive listeners only (SPEC §27): used to tell a held scrollbar thumb from a stray idle.
    window.addEventListener('pointerdown', pointerDown, { passive: true });
    window.addEventListener('pointerup', pointerUp, { passive: true });
    window.addEventListener('pointercancel', pointerUp, { passive: true });
    window.addEventListener('blur', pointerUp, { passive: true });
    lastY = window.scrollY || 0;
  }
  if (window.__gt3) window.__gt3.scrollMode = scrollMode;

  onScroll();
  return { update };
}

export const scrollTuning = TUNE;
