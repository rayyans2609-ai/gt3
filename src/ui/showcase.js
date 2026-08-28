/** Fullscreen, non-interactive rotating-car presentation. */

import * as THREE from 'three';
import { state, set } from '../core/state.js';
import { getCar } from '../data/cars.js';
import { carsReady, cloneCarModel } from '../scene/cars.js';
import { renderer } from '../scene/sceneSetup.js';
import { lockScroll, unlockScroll } from '../scroll/scrollDrive.js';
import {
  isVoiceAvailable,
  onVoiceEnded,
  pauseVoice,
  playVoice,
  resumeVoice,
  stopVoice,
} from '../audio/audioManager.js';

const EXCLUSIVE_OVERLAY_EVENT = 'gt3:exclusive-overlay-open';
const ROTATION_SPEED = 0.13;
const FADE_SECONDS = 1.05;

let initialized = false;
let open = false;
let previousMode = 'race';
let ownsScrollLock = false;
let activeCarIndex = -1;
let modelRequest = 0;
let voiceRequest = 0;
let reveal = 0;

let root;
let showcaseScene;
let showcaseCamera;
let turntable;
let showcaseCar;
let fadeMaterial;
let voiceButton;
let voiceNote;
let voicePlaying = false;
let voiceEnded = false;

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

function makeSpecList(rows, className) {
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

function createContactFloor() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 28),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.42 }),
  );
  floor.name = 'showcase-contact-floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.012;
  floor.receiveShadow = true;
  return floor;
}

function createLighting() {
  const ambient = new THREE.AmbientLight(0xbec8d2, 0.2);

  const hero = new THREE.RectAreaLight(0xffdfbf, 9.5, 5.8, 3.2);
  hero.name = 'showcase-hero-key';
  hero.position.set(-4.8, 6.2, -5.4);
  hero.lookAt(0, 0.72, 0);

  const fill = new THREE.RectAreaLight(0x9eb7c9, 3.3, 4.6, 3.4);
  fill.name = 'showcase-soft-fill';
  fill.position.set(5.2, 2.7, -0.4);
  fill.lookAt(0, 0.7, 0);

  const rim = new THREE.RectAreaLight(0xffedcf, 14.5, 5.5, 2.1);
  rim.name = 'showcase-rim';
  rim.position.set(-0.8, 4.4, 6.2);
  rim.lookAt(0, 0.88, 0);

  const shadowKey = new THREE.DirectionalLight(0xffd8b5, 1.55);
  shadowKey.name = 'showcase-shadow-key';
  shadowKey.position.set(-5.5, 8, -4.5);
  shadowKey.castShadow = true;
  shadowKey.shadow.mapSize.set(2048, 2048);
  shadowKey.shadow.camera.left = -6;
  shadowKey.shadow.camera.right = 6;
  shadowKey.shadow.camera.top = 6;
  shadowKey.shadow.camera.bottom = -6;
  shadowKey.shadow.camera.near = 1;
  shadowKey.shadow.camera.far = 24;
  shadowKey.shadow.normalBias = 0.025;
  shadowKey.target.position.set(0, 0.55, 0);

  showcaseScene.add(ambient, hero, fill, rim, shadowKey, shadowKey.target);
}

function createFadePlane() {
  fadeMaterial = new THREE.MeshBasicMaterial({
    color: 0x050506,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
  const fade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fadeMaterial);
  fade.name = 'showcase-black-fade';
  fade.position.set(0, 0, -0.11);
  fade.scale.set(0.25, 0.25, 1);
  fade.renderOrder = 10000;
  showcaseCamera.add(fade);
}

function disposeShowcaseCar() {
  if (!showcaseCar) return;
  turntable.remove(showcaseCar);
  const materials = new Set();
  showcaseCar.traverse((object) => {
    if (!object.isMesh) return;
    if (Array.isArray(object.material)) {
      for (const material of object.material) if (material) materials.add(material);
    } else if (object.material) {
      materials.add(object.material);
    }
  });
  // Geometry and textures remain shared with the preload cache; only clone-owned
  // material instances are disposable here.
  for (const material of materials) material.dispose();
  showcaseCar = null;
}

function mountCar(carIndex, request) {
  if (!open || request !== modelRequest || carIndex !== activeCarIndex) return;
  disposeShowcaseCar();
  showcaseCar = cloneCarModel(carIndex);
  showcaseCar.name = `showcase-${getCar(carIndex).id}`;
  turntable.add(showcaseCar);
}

function requestCar(carIndex) {
  const request = ++modelRequest;
  void carsReady.then(() => mountCar(carIndex, request)).catch(() => {
    // The presentation remains usable as an editorial card if loading is unavailable.
  });
}

function updateVoiceControl() {
  if (!voiceButton || activeCarIndex < 0) return;
  const available = isVoiceAvailable(activeCarIndex);
  voiceButton.disabled = !available;
  voiceButton.classList.toggle('is-playing', available && voicePlaying);
  voiceButton.setAttribute('aria-label', !available
    ? 'Narration unavailable'
    : voicePlaying
      ? 'Pause narration'
      : voiceEnded
        ? 'Replay narration'
        : 'Play narration');
  voiceButton.setAttribute('aria-pressed', String(available && voicePlaying));
  voiceNote.textContent = available
    ? (voicePlaying ? 'Narration playing' : voiceEnded ? 'Narration complete' : 'Narration paused')
    : 'Narration unavailable';
}

async function startNarration(carIndex, request) {
  const started = await playVoice(carIndex);
  if (!open || request !== voiceRequest || carIndex !== activeCarIndex) return;
  voicePlaying = started;
  voiceEnded = false;
  updateVoiceControl();
}

function onVoiceButtonClick() {
  if (!open || activeCarIndex < 0 || !isVoiceAvailable(activeCarIndex)) return;

  if (voicePlaying) {
    pauseVoice();
    voicePlaying = false;
    voiceEnded = false;
    updateVoiceControl();
    return;
  }

  if (voiceEnded) {
    const request = ++voiceRequest;
    void startNarration(activeCarIndex, request);
    return;
  }

  void resumeVoice().then((resumed) => {
    if (!open) return;
    voicePlaying = resumed;
    updateVoiceControl();
  });
}

function makeVoiceControl() {
  const wrap = element('div', 'showcase-voice');
  voiceButton = element('button', 'showcase-voice__button');
  voiceButton.type = 'button';
  voiceButton.append(
    element('span', 'showcase-voice__pause'),
    element('span', 'showcase-voice__play'),
  );
  voiceButton.addEventListener('click', onVoiceButtonClick);
  voiceNote = element('span', 'showcase-voice__note', 'Narration unavailable');
  wrap.append(voiceButton, voiceNote);
  return wrap;
}

function renderCard(car) {
  const card = element('section', 'showcase-card');
  card.setAttribute('aria-label', `${car.displayName} showcase`);

  const identity = element('header', 'showcase-card__identity');
  identity.append(
    element('p', 'showcase-label', `${car.manufacturer} · ${car.year}`),
    element('h1', 'showcase-card__name', car.displayName),
    element('p', 'showcase-card__headline', car.showcase.headline),
    makeVoiceControl(),
  );

  const prose = element('div', 'showcase-card__prose');
  prose.append(element('h2', 'showcase-label', 'The car'));
  for (const paragraph of car.showcase.paragraphs) {
    prose.append(element('p', 'showcase-card__paragraph', paragraph));
  }

  const engine = element('section', 'showcase-card__engine');
  engine.append(
    element('h2', 'showcase-label showcase-label--gold', 'Engine / Driveline'),
    makeSpecList([
      ['Configuration', car.engine.configuration],
      ['Displacement', car.engine.displacement],
      ['Induction', car.engine.induction],
      ['Power', car.engine.power],
      ['Torque', car.engine.torque],
      ['Redline', car.engine.redline],
      ['Transmission', car.engine.transmission],
      ['Drivetrain', car.engine.drivetrain],
    ], 'showcase-specs'),
  );

  const history = element('section', 'showcase-card__history');
  const achievements = element('ol', 'showcase-achievements');
  for (const achievement of car.achievements) {
    achievements.append(element('li', 'showcase-achievements__item', achievement));
  }
  history.append(
    element('h2', 'showcase-label', 'Race achievements'),
    achievements,
  );

  card.append(identity, prose, engine, history);
  root.replaceChildren(element('div', 'showcase-atmosphere'), card);
}

function presentCar(carIndex) {
  const car = getCar(carIndex);
  activeCarIndex = car.index;
  reveal = 0;
  turntable.rotation.y = -0.42;
  renderCard(car);
  root.style.setProperty('--showcase-brand', car.brandColor);
  requestCar(car.index);

  stopVoice();
  voicePlaying = false;
  voiceEnded = false;
  updateVoiceControl();
  const request = ++voiceRequest;
  void startNarration(car.index, request);
}

function onKeyDown(event) {
  if (event.defaultPrevented || event.repeat || event.isComposing || isTypingTarget(event.target)) return;
  const isF = event.code === 'KeyF' || event.key.toLowerCase() === 'f';

  if (isF) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (open) closeShowcase();
    else openShowcase(state.activeCarIndex);
    return;
  }

  if (open && event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeShowcase();
  }
}

function onExclusiveOverlay(event) {
  if (open && event.detail?.owner !== 'showcase') closeShowcase();
}

function onNarrationEnded(carIndex) {
  if (!open || carIndex !== activeCarIndex) return;
  voicePlaying = false;
  voiceEnded = true;
  updateVoiceControl();
}

/** Build the dedicated Showcase scene and its DOM layer. Safe to call repeatedly. */
export function initShowcase() {
  if (initialized) return { scene: showcaseScene, camera: showcaseCamera };

  root = document.getElementById('showcase-layer');
  if (!root) throw new Error('[showcase] Required #showcase-layer root is missing.');
  root.setAttribute('aria-hidden', 'true');

  showcaseScene = new THREE.Scene();
  showcaseScene.background = new THREE.Color(0x050506);
  showcaseScene.fog = new THREE.FogExp2(0x050506, 0.012);
  showcaseCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  // The card owns the bottom 46vh, so the car has to sit clear of it rather than
  // being bisected by it. Camera and target are translated down by the same 1.32
  // units, which is a pure translation: the view direction is unchanged, the car
  // simply rides higher in frame.
  showcaseCamera.position.set(6.5, 1.73, -7.6);
  showcaseCamera.lookAt(0, -0.56, 0);
  showcaseScene.add(showcaseCamera);

  turntable = new THREE.Group();
  turntable.name = 'showcase-turntable';
  turntable.scale.setScalar(1.12);
  showcaseScene.add(turntable, createContactFloor());
  createLighting();
  createFadePlane();

  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener(EXCLUSIVE_OVERLAY_EVENT, onExclusiveOverlay);
  onVoiceEnded(onNarrationEnded);
  initialized = true;
  return { scene: showcaseScene, camera: showcaseCamera };
}

/** Open Showcase Mode for a roster index without changing race progress. */
export function openShowcase(carIndex) {
  initShowcase();
  const car = getCar(carIndex);

  if (open) {
    presentCar(car.index);
    renderShowcase();
    return true;
  }

  window.dispatchEvent(new CustomEvent(EXCLUSIVE_OVERLAY_EVENT, {
    detail: { owner: 'showcase' },
  }));

  previousMode = state.mode;
  ownsScrollLock = !state.scrollLocked;
  lockScroll();
  set('mode', 'showcase');
  open = true;
  document.body.classList.add('gt3-showcase-open');
  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  presentCar(car.index);
  renderShowcase();
  return true;
}

/** Close Showcase Mode, restoring the mode and only the scroll lock it acquired. */
export function closeShowcase() {
  // Remove this defensively before every return so a stale class can never hide
  // the race HUD after Showcase has already closed.
  document.body.classList.remove('gt3-showcase-open');
  if (!open) return false;
  open = false;
  modelRequest += 1;
  voiceRequest += 1;
  stopVoice();
  voicePlaying = false;
  voiceEnded = false;
  root.classList.remove('is-open');
  root.setAttribute('aria-hidden', 'true');
  disposeShowcaseCar();

  // A montage may finish while covered. In that case its newer mode is authoritative.
  const restoreMode = state.mode === 'showcase' ? previousMode : state.mode;
  set('mode', restoreMode);
  if (ownsScrollLock) unlockScroll();
  ownsScrollLock = false;
  activeCarIndex = -1;
  return true;
}

export function isShowcaseOpen() {
  return open;
}

/** Advance the constant-rate turntable from the application's single RAF loop. */
export function updateShowcase(dt) {
  if (!open) return;
  const frameTime = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
  turntable.rotation.y += ROTATION_SPEED * frameTime;
  reveal = Math.min(1, reveal + frameTime / FADE_SECONDS);
  fadeMaterial.opacity = 1 - reveal;
}

/** Render the dedicated scene with the already-created shared WebGL renderer. */
export function renderShowcase() {
  if (!open || !renderer || !showcaseScene || !showcaseCamera) return false;
  const canvas = renderer.domElement;
  const width = Math.max(1, canvas.clientWidth || window.innerWidth);
  const height = Math.max(1, canvas.clientHeight || window.innerHeight);
  const aspect = width / height;
  if (Math.abs(showcaseCamera.aspect - aspect) > 0.0001) {
    showcaseCamera.aspect = aspect;
    showcaseCamera.updateProjectionMatrix();
  }
  renderer.setRenderTarget(null);
  renderer.render(showcaseScene, showcaseCamera);
  return true;
}
