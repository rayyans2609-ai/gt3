/** Editorial fullscreen car detail overlay. */

import { state, set } from '../core/state.js';
import { CARS, getCar } from '../data/cars.js';
import { lockScroll, unlockScroll } from '../scroll/scrollDrive.js';

const EXCLUSIVE_OVERLAY_EVENT = 'gt3:exclusive-overlay-open';

let initialized = false;
let open = false;
let previousMode = 'race';
let ownsScrollLock = false;
let activeCarIndex = -1;
let returnFocus = null;
let root;
let closeButton;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isTypingTarget(target) {
  return target instanceof Element
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
}

function imageSource(image) {
  if (typeof image === 'string') return image;
  if (image && typeof image === 'object') return image.src || image.url || '';
  return '';
}

function creditText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function makeGalleryCredit(images) {
  if (images.length === 0) return null;

  const credit = element('p', 'fullcard-credit');
  credit.append(document.createTextNode('Photographs — '));

  for (const [index, { image }] of images.entries()) {
    const author = creditText(image?.author, 'Wikimedia Commons');
    const license = creditText(image?.license, 'Licence not specified');
    const descriptionUrl = creditText(image?.descriptionUrl, '');
    const authorNode = descriptionUrl
      ? element('a', 'fullcard-credit__link', author)
      : document.createTextNode(author);

    if (descriptionUrl) {
      authorNode.href = descriptionUrl;
      authorNode.target = '_blank';
      authorNode.rel = 'noopener noreferrer';
    }

    credit.append(authorNode, document.createTextNode(` (${license})`));
    if (index < images.length - 1) credit.append(document.createTextNode(' · '));
  }

  return credit;
}

function makeDefinitionList(rows, className = 'fullcard-specs') {
  const list = element('dl', className);
  for (const [label, value] of rows) {
    const item = element('div', `${className}__item`);
    item.append(
      element('dt', `${className}__label`, label),
      element('dd', `${className}__value`, value),
    );
    list.append(item);
  }
  return list;
}

function makeGallery(car) {
  const images = Array.isArray(car.images)
    ? car.images.map((image) => ({ image, src: imageSource(image) })).filter(({ src }) => src).slice(0, 3)
    : [];
  if (images.length === 0) return null;

  const gallery = element('div', `fullcard-gallery fullcard-gallery--${images.length}`);
  for (const [index, { image, src }] of images.entries()) {
    const picture = document.createElement('img');
    picture.className = 'fullcard-gallery__image';
    picture.src = src;
    picture.alt = typeof image === 'object' && image.alt
      ? image.alt
      : `${car.displayName} race car, view ${index + 1}`;
    picture.decoding = 'async';
    picture.loading = 'eager';
    gallery.append(picture);
  }
  return { gallery, credit: makeGalleryCredit(images) };
}

function makeCloseButton(car) {
  closeButton = element('button', 'fullcard-close');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', `Close details for ${car.displayName}`);
  closeButton.append(
    element('span', 'fullcard-close__mark'),
    element('span', 'fullcard-close__label', 'Close'),
  );
  closeButton.addEventListener('click', closeFullscreenCard);
  return closeButton;
}

function renderCard(car) {
  const backdrop = element('button', 'fullcard-backdrop');
  backdrop.type = 'button';
  backdrop.tabIndex = -1;
  backdrop.setAttribute('aria-label', 'Close fullscreen car details');
  backdrop.addEventListener('click', closeFullscreenCard);

  const dialog = element('article', 'fullcard-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'fullcard-title');

  const lead = element('section', 'fullcard-lead');
  const sequence = `${String(car.index + 1).padStart(2, '0')} / ${String(CARS.length).padStart(2, '0')}`;
  lead.append(
    element('p', 'fullcard-label', `${car.manufacturer} · ${car.year}`),
    element('h1', 'fullcard-title', car.displayName),
    element('p', 'fullcard-headline', car.showcase.headline),
  );
  lead.querySelector('.fullcard-title').id = 'fullcard-title';

  const galleryContent = makeGallery(car);
  if (galleryContent) {
    lead.append(galleryContent.gallery, galleryContent.credit);
    dialog.classList.add('has-images');
  } else {
    dialog.classList.add('is-imageless');
    const editorial = element('div', 'fullcard-editorial');
    editorial.append(
      element('span', 'fullcard-editorial__sequence', sequence),
      element('p', 'fullcard-editorial__copy', car.showcase.paragraphs[0]),
    );
    lead.append(editorial);
  }

  const details = element('div', 'fullcard-details');

  const engine = element('section', 'fullcard-section fullcard-section--engine');
  engine.append(
    element('h2', 'fullcard-label fullcard-label--gold', 'Engine / Driveline'),
    makeDefinitionList([
      ['Configuration', car.engine.configuration],
      ['Displacement', car.engine.displacement],
      ['Induction', car.engine.induction],
      ['Power', car.engine.power],
      ['Torque', car.engine.torque],
      ['Redline', car.engine.redline],
      ['Transmission', car.engine.transmission],
      ['Drivetrain', car.engine.drivetrain],
    ]),
  );

  const chassis = element('section', 'fullcard-section fullcard-section--chassis');
  chassis.append(
    element('h2', 'fullcard-label', 'Chassis / Aero'),
    makeDefinitionList([
      ['Weight', car.chassis.weight],
      ['Construction', car.chassis.construction],
      ['Aero feature', car.chassis.aeroFeature],
      ['Series', car.series],
    ], 'fullcard-facts'),
  );

  const achievements = element('section', 'fullcard-section fullcard-section--results');
  const resultList = element('ol', 'fullcard-results');
  for (const [index, achievement] of car.achievements.entries()) {
    const item = element('li', 'fullcard-results__item');
    item.append(
      element('span', 'fullcard-results__number', String(index + 1).padStart(2, '0')),
      element('span', 'fullcard-results__text', achievement),
    );
    resultList.append(item);
  }
  achievements.append(
    element('h2', 'fullcard-label', 'Race achievements'),
    resultList,
  );

  const fact = element('aside', 'fullcard-fact');
  fact.append(
    element('span', 'fullcard-label', 'Endurance note'),
    element('p', 'fullcard-fact__copy', car.fact),
  );

  details.append(engine, chassis, achievements, fact);
  dialog.append(makeCloseButton(car), lead, details);
  root.replaceChildren(backdrop, dialog);
}

function onKeyDown(event) {
  if (!open || event.defaultPrevented || event.repeat || event.isComposing || isTypingTarget(event.target)) return;
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeFullscreenCard();
}

function onExclusiveOverlay(event) {
  if (open && event.detail?.owner !== 'fullcard') closeFullscreenCard();
}

/** Prepare the existing fullscreen-card root and its global exit handlers. */
export function initFullscreenCard() {
  if (initialized) return root;
  root = document.getElementById('fullscreen-card');
  if (!root) throw new Error('[fullcard] Required #fullscreen-card root is missing.');
  root.setAttribute('aria-hidden', 'true');
  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener(EXCLUSIVE_OVERLAY_EVENT, onExclusiveOverlay);
  initialized = true;
  return root;
}

/** Open the full editorial record, pausing the drive at its exact current progress. */
export function openFullscreenCard(carIndex) {
  initFullscreenCard();
  const car = getCar(carIndex);

  if (open) {
    activeCarIndex = car.index;
    renderCard(car);
    closeButton.focus({ preventScroll: true });
    return true;
  }

  window.dispatchEvent(new CustomEvent(EXCLUSIVE_OVERLAY_EVENT, {
    detail: { owner: 'fullcard' },
  }));

  previousMode = state.mode;
  ownsScrollLock = !state.scrollLocked;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  lockScroll();
  set('mode', 'fullcard');
  activeCarIndex = car.index;
  open = true;
  renderCard(car);
  root.style.setProperty('--fullcard-brand', car.brandColor);
  root.style.setProperty('--fullcard-brand-soft', car.brandColorSoft);
  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  closeButton.focus({ preventScroll: true });
  return true;
}

/** Close through any exit path, restoring mode and releasing one owned lock at most. */
export function closeFullscreenCard() {
  if (!open) return false;
  open = false;
  root.classList.remove('is-open');
  root.setAttribute('aria-hidden', 'true');

  // If a covered montage completed, its newer state supersedes the captured one.
  const restoreMode = state.mode === 'fullcard' ? previousMode : state.mode;
  set('mode', restoreMode);
  if (ownsScrollLock) unlockScroll();
  ownsScrollLock = false;
  activeCarIndex = -1;

  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
  return true;
}

export function isFullscreenCardOpen() {
  return open;
}
