/** Compact, transient car-unlock card. */

import { CARS, getCar } from '../data/cars.js';

const HOLD_SECONDS = 6.5;

let root = null;
let currentCarIndex = 0;
let remaining = 0;
let visible = false;
let expandHandler = null;

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function initPanel() {
  if (root) return root;
  root = document.querySelector('#spec-panel');
  if (!root) throw new Error('[spec-panel] Required #spec-panel root is missing.');
  root.setAttribute('aria-hidden', 'true');
  return root;
}

function imageSource(image) {
  if (typeof image === 'string') return image;
  if (image && typeof image === 'object') return image.src || image.url || '';
  return '';
}

function renderPanel(car) {
  root.replaceChildren();
  root.style.setProperty('--spec-brand', car.brandColor);

  const card = makeElement('section', 'spec-card');
  card.setAttribute('aria-label', `${car.displayName} unlocked`);

  const eyebrow = makeElement('div', 'spec-card__eyebrow');
  eyebrow.append(
    makeElement('span', 'hud-label', 'Race unlock'),
    makeElement('span', 'spec-card__sequence', `${String(car.index + 1).padStart(2, '0')} / ${String(CARS.length).padStart(2, '0')}`),
  );
  const title = makeElement('h2', 'spec-card__title', car.displayName);
  const brandRule = makeElement('div', 'spec-card__brand-rule');
  card.append(eyebrow, title, brandRule);

  const fields = [
    ['Manufacturer', car.manufacturer, false],
    ['Model', car.model, false],
    ['Engine', car.engine.configuration, false],
    ['Power', car.engine.power, true],
    ['Drivetrain', car.engine.drivetrain, false],
    ['Series', car.series, false],
    ['Aero', car.chassis.aeroFeature, false],
    ['Fact', car.fact, false],
  ];
  const list = makeElement('dl', 'spec-card__fields');
  for (const [label, value, numeric] of fields) {
    const row = makeElement('div', 'spec-card__row');
    const term = makeElement('dt', 'spec-card__label', label);
    const description = makeElement('dd', `spec-card__value${numeric ? ' spec-card__value--mono' : ''}`, value);
    description.title = value;
    row.append(term, description);
    list.append(row);
  }
  card.append(list);

  const images = Array.isArray(car.images)
    ? car.images.map((image) => ({ image, src: imageSource(image) })).filter(({ src }) => src).slice(0, 2)
    : [];
  if (images.length > 0) {
    const gallery = makeElement('div', `spec-card__images spec-card__images--${images.length}`);
    for (const { image, src } of images) {
      const thumbnail = document.createElement('img');
      thumbnail.className = 'spec-card__image';
      thumbnail.src = src;
      thumbnail.alt = typeof image === 'object' && image.alt ? image.alt : `${car.displayName} race car`;
      thumbnail.decoding = 'async';
      gallery.append(thumbnail);
    }
    card.append(gallery);
  }

  const footer = makeElement('div', 'spec-card__footer');
  const expand = makeElement('button', 'spec-card__expand', '+ Expand');
  expand.type = 'button';
  expand.setAttribute('aria-label', `Expand details for ${car.displayName}`);
  expand.addEventListener('click', () => {
    if (typeof expandHandler === 'function') expandHandler(currentCarIndex);
  });
  footer.append(expand);
  card.append(footer);
  root.append(card);
}

/** Inject the fullscreen-card owner. The handler receives the active car index. */
export function setExpandHandler(fn) {
  if (fn !== null && fn !== undefined && typeof fn !== 'function') {
    throw new TypeError('[spec-panel] Expand handler must be a function or null.');
  }
  expandHandler = fn || null;
}

/** Show a car's unlock card and restart its full hold period. */
export function showSpecPanel(carIndex) {
  initPanel();
  const car = getCar(carIndex);
  currentCarIndex = car.index;
  remaining = HOLD_SECONDS;
  visible = true;
  renderPanel(car);
  root.classList.add('is-visible');
  root.setAttribute('aria-hidden', 'false');
}

/** Begin the card's eased exit. */
export function hideSpecPanel() {
  remaining = 0;
  visible = false;
  if (!root) return;
  root.classList.remove('is-visible');
  root.setAttribute('aria-hidden', 'true');
}

/** Advance the hold timer from main.js's frame loop. */
export function update(dt) {
  if (!visible) return;
  const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
  remaining -= safeDt;
  if (remaining <= 0) hideSpecPanel();
}

