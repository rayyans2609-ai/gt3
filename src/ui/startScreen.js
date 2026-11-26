import { state } from '../core/state.js';

const COVER_PART_MS = 900;
const CHECKER_COLUMNS = 40;
const FINAL_CHECKER_SAFETY_MS = 300;
// Checker easing follows real progress; it never runs ahead of it and snaps to
// full the moment readiness settles, so the shutter opens on a complete grid.
const PROGRESS_SMOOTH_MS = 260;
let initialized = false;
let root = null;
let columns = [];
let progressValue;
let targetProgress = 0;
let displayedProgress = 0;
let progressFrame = 0;
let lastFrameAt = 0;
let readiness = 'loading';
let dismissComplete = false;
let restoredSilently = false;
let revealPromise;
let finalCheckerPromise = Promise.resolve();
const dismissCompleteHandlers = [];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function paintState() {
  if (!root) return;
  // Accessibility reports the real state, never the eased presentation.
  root.setAttribute('aria-valuenow', String(Math.round(targetProgress * 100)));
  root.dataset.readiness = readiness;
  root.classList.toggle('is-ready', readiness === 'ready' || readiness === 'degraded');
}

function paintChecker(value, { finalSnap = false } = {}) {
  if (!root) return;
  const filled = Math.floor(value * CHECKER_COLUMNS);
  columns.forEach((column, i) => {
    const isNewlyFilled = finalSnap && i < filled && !column.classList.contains('is-filled');
    column.classList.toggle('is-final-fill', isNewlyFilled);
    column.classList.toggle('is-filled', i < filled);
  });
  progressValue.textContent = readiness === 'failed'
    ? 'Route unavailable. Reload the page to try again.'
    : `Preparing the grid ${String(Math.round(value * 100)).padStart(2, '0')}%`;
}

function stopProgressAnimation() {
  if (progressFrame) cancelAnimationFrame(progressFrame);
  progressFrame = 0;
}

/** Ease the displayed checker toward real progress, never past it. */
function stepProgress(now) {
  const dt = Math.min(64, Math.max(0, now - lastFrameAt));
  lastFrameAt = now;
  const remaining = targetProgress - displayedProgress;
  if (remaining <= 0.0005) {
    displayedProgress = targetProgress;
    paintChecker(displayedProgress);
    progressFrame = 0;
    return;
  }
  displayedProgress = Math.min(targetProgress,
    displayedProgress + remaining * (1 - Math.exp(-dt / PROGRESS_SMOOTH_MS)));
  paintChecker(displayedProgress);
  progressFrame = requestAnimationFrame(stepProgress);
}

function renderProgress() {
  paintState();
  paintChecker(displayedProgress);
}

/**
 * The shutter must follow the final cells, rather than merely racing their nominal duration.
 * A short cap protects the entry path if a browser drops or cancels a CSS animation.
 */
function waitForFinalChecker() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(safety);
      resolve();
    };
    const safety = window.setTimeout(finish, FINAL_CHECKER_SAFETY_MS);
    const observeAnimations = () => {
      if (settled) return;
      const animations = columns
        .filter((column) => column.classList.contains('is-final-fill'))
        .flatMap((column) => [...column.querySelectorAll('i')])
        .flatMap((cell) => cell.getAnimations())
        .map((animation) => animation.finished.catch(() => {}));
      if (animations.length) Promise.all(animations).then(finish);
      // CSS animation creation follows style resolution. Keep observing until that
      // happens instead of treating the first pre-style frame as an instant finish.
      else requestAnimationFrame(observeAnimations);
    };
    requestAnimationFrame(observeAnimations);
  });
}

/** Main owns the one readiness decision used by this screen and the scroll lock. */
export function setLoadState(next) {
  targetProgress = Math.min(1, Math.max(0, Number(next.progress) || 0));
  readiness = next.status;
  paintState();
  const stillLoading = readiness === 'loading';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!stillLoading || reduce) {
    // The final cells get one short shared beat, then the shutter may part.
    stopProgressAnimation();
    displayedProgress = targetProgress;
    const finalSnap = !reduce && readiness !== 'failed';
    root.classList.toggle('is-completing', finalSnap);
    paintChecker(displayedProgress, { finalSnap });
    finalCheckerPromise = finalSnap ? waitForFinalChecker() : Promise.resolve();
    return;
  }
  if (!progressFrame) {
    lastFrameAt = performance.now();
    progressFrame = requestAnimationFrame(stepProgress);
  }
}

export function onDismissComplete(fn) {
  if (restoredSilently) return;
  if (dismissComplete) fn();
  else dismissCompleteHandlers.push(fn);
}

/** Called only after the entry control's genuine-scroll dismissal has finished. */
export function dismissStartScreen() {
  if (dismissComplete || restoredSilently || !root?.classList.contains('is-ready')) return;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  dismissComplete = true;
  for (const fn of dismissCompleteHandlers.splice(0)) fn();
}

/** The cover parts automatically at readiness; dismissal-complete waits for the scroll control. */
export function revealTour() {
  if (revealPromise) return revealPromise;
  revealPromise = finalCheckerPromise.then(() => {
    root.classList.add('is-leaving');
    root.setAttribute('aria-hidden', 'true');
    return new Promise(resolve => setTimeout(() => {
      root.hidden = true;
      resolve();
    }, COVER_PART_MS));
  });
  return revealPromise;
}

/** Finished refresh: no loading cover, entry overlay or first-entry sound cue. */
export function dismissStartScreenForRestore() {
  restoredSilently = true;
  dismissCompleteHandlers.length = 0;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
}

/** The Hub owns loading; its Tour entry uses only the independent entry overlay. */
export function usePromptOnly() {
  root.classList.add('is-prompt-only');
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
}

export function initStartScreen() {
  if (initialized) return;
  root = document.getElementById('start-screen');
  if (!root) throw new Error('[start-screen] Required #start-screen root is missing.');
  initialized = true;
  root.className = 'start-screen';
  root.hidden = false;
  root.setAttribute('role', 'progressbar');
  root.setAttribute('aria-label', 'Preparing the Grand Tour');
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '100');
  root.setAttribute('aria-hidden', 'false');
  const top = element('div', 'start-cover__top');
  top.append(element('span', 'start-cover__wordmark', 'GT3'));
  const bottom = element('div', 'start-cover__bottom');
  const loading = element('div', 'start-cover__loading');
  const checker = element('div', 'start-cover__checker');
  checker.setAttribute('aria-hidden', 'true');
  columns = Array.from({ length: CHECKER_COLUMNS }, (_, i) => {
    const column = element('span', 'start-cover__column');
    column.style.setProperty('--checker-i', String(i));
    column.append(element('i'), element('i'));
    checker.append(column);
    return column;
  });
  progressValue = element('p', 'start-cover__value');
  loading.append(checker, progressValue);
  bottom.append(loading);
  root.replaceChildren(top, bottom);
  renderProgress();
  // restoreSession marks a completed route lapFrozen before the scene starts loading.
  // Finished-state refresh never paints a loading cover while assets prepare.
  if (state.experience === 'tour' && state.lapFrozen) dismissStartScreenForRestore();
}
