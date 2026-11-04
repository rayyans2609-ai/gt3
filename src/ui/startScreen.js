import { state } from '../core/state.js';

const COVER_PART_MS = 900;
let initialized = false;
let root = null;
let columns = [];
let progressValue;
let progress = 0;
let readiness = 'loading';
let dismissComplete = false;
let restoredSilently = false;
let revealPromise;
const dismissCompleteHandlers = [];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderProgress() {
  if (!root) return;
  const percent = Math.round(progress * 100);
  columns.forEach((column, i) => column.classList.toggle('is-filled', i < Math.floor(progress * 40)));
  progressValue.textContent = readiness === 'failed'
    ? 'Route unavailable. Reload the page to try again.'
    : `Preparing the grid ${String(percent).padStart(2, '0')}%`;
  root.setAttribute('aria-valuenow', String(percent));
  root.dataset.readiness = readiness;
  root.classList.toggle('is-ready', readiness === 'ready' || readiness === 'degraded');
}

/** Main owns the one readiness decision used by this screen and the scroll lock. */
export function setLoadState(next) {
  progress = Math.min(1, Math.max(0, Number(next.progress) || 0));
  readiness = next.status;
  renderProgress();
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
  root.classList.add('is-leaving');
  root.setAttribute('aria-hidden', 'true');
  revealPromise = new Promise(resolve => setTimeout(() => {
    root.hidden = true;
    resolve();
  }, COVER_PART_MS));
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
  columns = Array.from({ length: 40 }, () => {
    const column = element('span', 'start-cover__column');
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
