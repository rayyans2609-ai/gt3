import { state, set, subscribe } from '../core/state.js';
import { CARS, getCar } from '../data/cars.js';
import { playFinish } from '../audio/audioManager.js';
import { lockScroll, resetToStart, unlockScroll } from '../scroll/scrollDrive.js';

const FINISH_THRESHOLD = 0.995;

const CREDIT_GROUPS = Object.freeze([
  {
    artist: 'Dave Love',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    models: [
      ['2023 Lamborghini Huracán GT3 EVO2', 'https://skfb.ly/pM9HZ'],
      ['2024 Porsche 992 GT3 R', 'https://skfb.ly/pMLAu'],
      ['2018 Lexus RC F GT3', 'https://skfb.ly/pMF76'],
      ['2020 McLaren 720S GT3', 'https://skfb.ly/pMLAv'],
      ['Mercedes-AMG GT3 EVO', 'https://skfb.ly/pMLAw'],
      ['2020 Audi R8 LMS Evo', ''],
      ['2016 BMW M6 GT3', 'https://skfb.ly/pLpYC'],
      ['2018 Nissan GT-R NISMO GT3', 'https://skfb.ly/pMKvA'],
    ],
  },
  {
    artist: 'OUTPISTON',
    license: 'CC BY-NC-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    models: [
      ['2018 Ferrari 488 GT3', 'https://skfb.ly/pDs8X'],
      ['2013 Aston Martin Vantage GT3', ''],
    ],
  },
]);

let initialized = false;
let visible = false;
let runFinished = false;
let finishSoundPlayed = false;
let replayHandler = null;
let unsubscribeProgress = null;
let root = null;
let recapGrid = null;
let recapCount = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function appendModelCredit(parent, model, index, total) {
  const [title, url] = model;
  const node = url ? element('a', 'finish-credit__link', `“${title}”`) : document.createTextNode(`“${title}”`);
  if (url) {
    node.href = url;
    node.target = '_blank';
    node.rel = 'noreferrer';
  }
  parent.append(node);
  if (index < total - 1) parent.append(document.createTextNode(', '));
}

function buildCredits() {
  const credits = element('p', 'finish-credit');
  credits.append(document.createTextNode('Sketchfab models — '));

  CREDIT_GROUPS.forEach((group, groupIndex) => {
    credits.append(document.createTextNode(`${group.artist}: `));
    group.models.forEach((model, index) => appendModelCredit(credits, model, index, group.models.length));
    credits.append(document.createTextNode(' ('), (() => {
      const license = element('a', 'finish-credit__link', group.license);
      license.href = group.licenseUrl;
      license.target = '_blank';
      license.rel = 'noreferrer';
      return license;
    })(), document.createTextNode(')'));
    if (groupIndex < CREDIT_GROUPS.length - 1) credits.append(document.createTextNode('; '));
  });

  credits.append(document.createTextNode('.'));
  return credits;
}

function renderRecap() {
  if (!recapGrid || !recapCount) return;
  const unlocked = state.unlocked instanceof Set ? state.unlocked : new Set();
  recapCount.textContent = `${String(unlocked.size).padStart(2, '0')} / ${String(CARS.length).padStart(2, '0')} discovered`;

  const fragment = document.createDocumentFragment();
  for (let index = 0; index < CARS.length; index += 1) {
    const car = getCar(index);
    const collected = unlocked.has(index);
    const tile = element('div', `finish-badge${collected ? ' is-unlocked' : ''}`);
    tile.style.setProperty('--badge-color', car.brandColor);
    tile.setAttribute('aria-label', collected ? `${car.displayName} discovered` : `Car slot ${index + 1} not discovered`);

    if (collected) {
      const marque = element('span', 'finish-badge__marque', car.manufacturer);
      const name = element('span', 'finish-badge__name', car.displayName);
      tile.append(marque, name);
    }
    fragment.append(tile);
  }
  recapGrid.replaceChildren(fragment);
}

function replayRoute() {
  if (!runFinished) return;

  if (state.unlocked instanceof Set) state.unlocked.clear();
  set('unlocked', new Set());
  set('activeCarIndex', 0);
  set('mode', 'race');
  resetToStart();
  hideFinishScreen();

  runFinished = false;
  finishSoundPlayed = false;

  if (typeof replayHandler === 'function') {
    try {
      replayHandler();
    } catch (error) {
      console.error('[finish-screen] Replay handler failed.', error);
    }
  }
}

function buildScreen() {
  root.className = 'finish-screen';
  root.hidden = false;
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('aria-label', 'Route finish and car discovery recap');

  const panel = element('section', 'finish-screen__panel');
  const header = element('header', 'finish-screen__header');
  const eyebrow = element('p', 'finish-screen__eyebrow', 'Route complete · final classification');
  const closing = element('h2', 'finish-screen__closing', 'The circuit falls quiet. The machines remain.');
  const rule = element('span', 'finish-screen__rule');
  header.append(eyebrow, closing, rule);

  const recap = element('section', 'finish-recap');
  recap.setAttribute('aria-label', 'Cars discovered this run');
  const recapHeader = element('div', 'finish-recap__header');
  const recapLabel = element('h3', 'finish-recap__label', 'Run scorecard');
  recapCount = element('p', 'finish-recap__count', '00 / 10 discovered');
  recapHeader.append(recapLabel, recapCount);
  recapGrid = element('div', 'finish-recap__grid');
  recap.append(recapHeader, recapGrid);

  const footer = element('footer', 'finish-screen__footer');
  const replay = element('button', 'finish-replay', 'Replay route');
  replay.type = 'button';
  replay.setAttribute('aria-label', 'Replay the route from the start line');
  replay.addEventListener('click', replayRoute);
  footer.append(replay, buildCredits());

  panel.append(header, recap, footer);
  root.replaceChildren(panel);
}

function maybeFinish(progress = state.progress) {
  if (runFinished || state.mode !== 'race') return;
  if (!Number.isFinite(progress) || progress < FINISH_THRESHOLD) return;
  showFinishScreen();
}

/** Supply integration-owned coin and model resets without coupling this screen to them. */
export function setReplayHandler(fn) {
  if (fn !== null && fn !== undefined && typeof fn !== 'function') {
    throw new TypeError('[finish-screen] setReplayHandler expects a function or null.');
  }
  replayHandler = fn || null;
}

/** Populate the finish root and watch central progress for the line crossing. */
export function initFinishScreen() {
  if (initialized) return;

  root = document.getElementById('finish-screen');
  if (!root) throw new Error('[finish-screen] Required #finish-screen root is missing.');

  initialized = true;
  buildScreen();
  renderRecap();
  unsubscribeProgress = subscribe('progress', maybeFinish);
  maybeFinish();
}

/** Reveal the in-world scorecard with a slow, single eased entrance. */
export function showFinishScreen() {
  if (!initialized) initFinishScreen();
  if (visible || runFinished) return;

  visible = true;
  runFinished = true;
  renderRecap();
  lockScroll();
  set('mode', 'finish');
  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  // The frame boundary ensures the initial transform is painted before the exhale in.
  requestAnimationFrame(() => {
    if (visible && root) root.classList.add('is-visible');
  });

  if (!finishSoundPlayed) {
    finishSoundPlayed = true;
    playFinish();
  }
}

/** Hide the scorecard. Replay uses resetToStart(), which has already released scroll. */
export function hideFinishScreen() {
  if (!root || !visible) return;

  visible = false;
  root.classList.remove('is-visible');
  root.setAttribute('aria-hidden', 'true');
  if (state.mode === 'finish') set('mode', 'race');
  if (state.scrollLocked) unlockScroll();
}

/** Frame-loop fallback; the progress subscription also makes the trigger deterministic. */
export function update(dt) {
  void dt;
  if (!initialized) return;
  maybeFinish(state.progress);
}

// Retained only so hot-module teardown/debug tooling can release the subscription.
export function disposeFinishScreen() {
  unsubscribeProgress?.();
  unsubscribeProgress = null;
  initialized = false;
}
