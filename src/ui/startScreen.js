import { state } from '../core/state.js';
import { onFirstScroll } from '../scroll/scrollDrive.js';
import { preloadCars } from '../scene/cars.js';
import { preloadAudio } from '../audio/audioManager.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DISMISS_DURATION = 1300;

let initialized = false;
let dismissed = false;
let dismissTimer = 0;
let root = null;
let progressFill = null;
let progressValue = null;
let progressLabel = null;
let modelProgress = 0;
let audioProgress = 0;
let modelTotal = 10;
let audioTotal = 6;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeIdentityMark() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'start-mark');
  svg.setAttribute('viewBox', '0 0 224 44');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'GT3 route mark');

  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = 'GT3 route mark';

  const route = document.createElementNS(SVG_NS, 'path');
  route.setAttribute('d', 'M1 22H63C75 22 78 7 91 7H132C144 7 147 37 160 37H223');
  route.setAttribute('class', 'start-mark__route');

  const inner = document.createElementNS(SVG_NS, 'path');
  inner.setAttribute('d', 'M21 28H67C81 28 83 13 95 13H127C137 13 142 31 153 31H203');
  inner.setAttribute('class', 'start-mark__inner');

  for (const [cx, cy] of [[1, 22], [112, 13], [223, 37]]) {
    const point = document.createElementNS(SVG_NS, 'circle');
    point.setAttribute('cx', String(cx));
    point.setAttribute('cy', String(cy));
    point.setAttribute('r', '1.6');
    point.setAttribute('class', 'start-mark__point');
    svg.append(point);
  }

  svg.prepend(title, route, inner);
  return svg;
}

function combinedProgress() {
  const models = Math.round(modelProgress * modelTotal);
  const audio = Math.round(audioProgress * audioTotal);
  return (models + audio) / Math.max(1, modelTotal + audioTotal);
}

function renderProgress() {
  if (!progressFill || !progressValue || !progressLabel) return;

  const progress = Math.min(1, Math.max(0, combinedProgress()));
  const percent = Math.round(progress * 100);
  progressFill.style.transform = `scaleX(${progress.toFixed(4)})`;
  progressValue.textContent = `${String(percent).padStart(2, '0')}%`;
  progressValue.setAttribute('aria-valuenow', String(percent));

  if (progress >= 1) {
    root.classList.add('is-ready');
    progressLabel.textContent = 'Route ready';
  }
}

function buildScreen() {
  root.className = 'start-screen';
  root.hidden = false;
  root.setAttribute('aria-label', 'GT3: A Grand Tour introduction');
  root.setAttribute('aria-hidden', 'false');

  const panel = element('section', 'start-screen__panel');
  const eyebrow = element('p', 'start-screen__eyebrow', 'Ten machines · one continuous route');
  const title = element('h1', 'start-screen__title', 'GT3: A Grand Tour');
  const explanation = element(
    'p',
    'start-screen__explanation',
    'Collect each coin to unlock a new GT3 machine and transform the car beneath you.',
  );

  const loading = element('div', 'start-loading');
  const loadingMeta = element('div', 'start-loading__meta');
  progressLabel = element('span', 'start-loading__label', 'Preparing the grid');
  progressValue = element('span', 'start-loading__value', '00%');
  progressValue.setAttribute('role', 'progressbar');
  progressValue.setAttribute('aria-label', 'Car model and audio loading progress');
  progressValue.setAttribute('aria-valuemin', '0');
  progressValue.setAttribute('aria-valuemax', '100');
  progressValue.setAttribute('aria-valuenow', '0');
  loadingMeta.append(progressLabel, progressValue);

  const loadingTrack = element('div', 'start-loading__track');
  progressFill = element('span', 'start-loading__fill');
  loadingTrack.append(progressFill);
  loading.append(loadingMeta, loadingTrack);

  panel.append(eyebrow, makeIdentityMark(), title, explanation, loading);

  const prompt = element('div', 'start-prompt');
  const promptLabel = element('span', 'start-prompt__label', 'Scroll to Race');
  const cue = element('span', 'start-prompt__cue');
  cue.setAttribute('aria-hidden', 'true');
  cue.append(element('span', 'start-prompt__line'));
  prompt.append(promptLabel, cue);

  root.replaceChildren(panel, prompt);
}

function beginPreload() {
  const models = preloadCars((loaded, total, fraction) => {
    modelTotal = Math.max(1, Number(total) || 10);
    modelProgress = Number.isFinite(fraction) ? fraction : loaded / modelTotal;
    renderProgress();
  });

  const audio = preloadAudio((fraction, loaded, total) => {
    audioTotal = Math.max(1, Number(total) || 6);
    audioProgress = Number.isFinite(fraction) ? fraction : loaded / audioTotal;
    renderProgress();
  });

  void Promise.allSettled([models, audio]).then(() => {
    modelProgress = 1;
    audioProgress = 1;
    renderProgress();
  });
}

/** Fade the introduction away once. The live canvas is never replaced. */
export function dismissStartScreen() {
  if (dismissed) return;
  dismissed = true;

  if (!root) root = document.getElementById('start-screen');
  if (!root) return;

  root.classList.add('is-leaving');
  root.setAttribute('aria-hidden', 'true');
  window.clearTimeout(dismissTimer);
  dismissTimer = window.setTimeout(() => {
    if (root) root.hidden = true;
  }, DISMISS_DURATION);
}

/** Populate the existing start-screen root and begin shared asset preloading. */
export function initStartScreen() {
  if (initialized) return;

  root = document.getElementById('start-screen');
  if (!root) throw new Error('[start-screen] Required #start-screen root is missing.');

  initialized = true;
  buildScreen();
  beginPreload();

  onFirstScroll(() => {
    dismissStartScreen();
  });

  if (state.started) dismissStartScreen();
}
