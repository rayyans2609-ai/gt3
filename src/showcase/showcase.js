/** Dedicated inspection page. Adapted from ui/showcase's turntable, area rig,
 * editorial data and voice control; one renderer and the application's one RAF. */
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CARS, getCar } from '../data/cars.js';
import { state, subscribe } from '../core/state.js';
import { loadFullResolutionCar } from '../scene/cars.js';
import { applyCarColor } from '../ui/carIdentity.js';
import { gsap, reducedMotion } from '../ui/motion.js';
import { startAudio, playVoice, pauseVoice, resumeVoice, stopVoice, onVoiceEnded, isVoiceAvailable } from '../audio/audioManager.js';
import './showcase.css';

let renderer, onExit, root, scene, camera, turntable, composer, output, ambient, key, fill, rim;
let opened = false, closing = false, activeIndex = 0, mode = 'full', origin = null;
let generation = 0, prefetchIndex = -1, queue = Promise.resolve(), mounted = null;
let loading = false, modelError = false, detailsOpen = false, previousFocus;
let voiceStatus = 'idle', voiceGeneration = 0, voiceButton;
let yaw = -0.38, pitch = 0, velocity = 0, dragging = false, lastX = 0, lastY = 0, dragAt = 0;
let pointerX = 0, pointerY = 0, elapsed = 0, sizeKey = '', themeNight = 0, frameDelta = 1 / 60;
const fieldColor = new THREE.Color(), fieldTarget = new THREE.Color();
let fieldCSS = '';
const cache = new Map();
const pending = new Map();
const pose = { reveal: 1, shift: 0, lift: 0, detail: 0, carOpacity: 1 };
const resources = { loaded: 0, evicted: 0, disposedGeometries: 0, disposedMaterials: 0, disposedTextures: 0, peakResident: 0 };
const wrap = index => ((index % CARS.length) + CARS.length) % CARS.length;
const duration = seconds => reducedMotion.matches ? 0 : seconds;
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label, className, action, aria = label) {
  const node = el('button', className, label);
  node.type = 'button'; node.setAttribute('aria-label', aria);
  node.addEventListener('click', action);
  return node;
}
function animate(target, vars) {
  return new Promise(resolve => gsap.to(target, { ...vars, duration: duration(vars.duration ?? .4), overwrite: true, onComplete: resolve, onInterrupt: resolve }));
}

/** Full-res files are independent of Tour/Landing. Dispose each unique resource once. */
function disposeModel(model) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
  model.removeFromParent();
  model.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of [].concat(node.material || [])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const uniform of Object.values(material.uniforms || {})) if (uniform?.value?.isTexture) textures.add(uniform.value);
    }
    node.skeleton?.dispose();
  });
  for (const texture of textures) {
    if (texture.source?.data?.close) images.add(texture.source.data);
    texture.dispose();
  }
  for (const image of images) image.close();
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
  resources.evicted++; resources.disposedGeometries += geometries.size;
  resources.disposedMaterials += materials.size; resources.disposedTextures += textures.size;
}
function touch(index) {
  const model = cache.get(index);
  if (model) { cache.delete(index); cache.set(index, model); }
  return model;
}
function trim(limit) {
  for (const [index, model] of cache) {
    if (cache.size <= limit) break;
    if (model === mounted) continue;
    cache.delete(index); disposeModel(model);
  }
}
function progress(index, event) {
  if (!opened || index !== activeIndex || !loading) return;
  const label = root.querySelector('.sc-loading__label');
  const checker = root.querySelector('.sc-checker');
  if (event.total > 0) {
    const fraction = Math.min(1, event.loaded / event.total);
    checker.style.setProperty('--progress', fraction);
    label.textContent = fraction === 1 ? 'Preparing · resolving materials' : `Preparing · ${Math.floor(fraction * 100)}%`;
    root.querySelector('.sc-loading').setAttribute('aria-valuenow', String(Math.floor(fraction * 100)));
  } else label.textContent = `Preparing · ${(event.loaded / 1048576).toFixed(1)} MB`;
}
function ensureModel(index) {
  if (cache.has(index)) return Promise.resolve(touch(index));
  if (pending.has(index)) return pending.get(index);
  // Serial downloads/decode: rapid browsing cannot leave ten full models in flight.
  const task = queue.then(async () => {
    if (!opened || !state.unlocked.has(index) || (index !== activeIndex && index !== prefetchIndex)) return null;
    trim(2); // reserve the third slot before the next full-res allocation
    const model = await loadFullResolutionCar(index, event => progress(index, event));
    resources.loaded++;
    if (!opened || (index !== activeIndex && index !== prefetchIndex)) { disposeModel(model); return null; }
    cache.set(index, model); resources.peakResident = Math.max(resources.peakResident, cache.size);
    trim(3);
    return model;
  });
  pending.set(index, task);
  queue = task.catch(() => {}).finally(() => pending.delete(index));
  return task;
}
function prefetch(direction) {
  prefetchIndex = wrap(activeIndex + direction);
  if (state.unlocked.has(prefetchIndex)) void ensureModel(prefetchIndex).catch(() => {});
}
function haltVoice() { ++voiceGeneration; stopVoice(); voiceStatus = 'idle'; paintVoice(); }
function paintVoice() {
  if (!voiceButton) return;
  voiceButton.textContent = voiceStatus === 'unavailable' ? 'Narration unavailable' : voiceStatus === 'playing' ? 'Ⅱ  Pause narration' : voiceStatus === 'loading' ? 'Preparing narration…' : voiceStatus === 'paused' ? '▷  Resume narration' : voiceStatus === 'ended' ? '↺  Replay narration' : '▷  Listen to the story';
  voiceButton.disabled = voiceStatus === 'loading' || voiceStatus === 'unavailable';
  voiceButton.setAttribute('aria-pressed', String(voiceStatus === 'playing'));
}
/** Play this car's narration. Only ever called from the Listen button (explicit playback only). */
async function narrate() {
  const index = activeIndex, request = ++voiceGeneration;
  if (!opened || closing || !state.unlocked.has(index)) return;
  voiceStatus = 'loading'; paintVoice();
  if (!state.audioReady) await startAudio();
  if (!opened || request !== voiceGeneration || index !== activeIndex) return;
  const started = await playVoice(index);
  if (!opened || request !== voiceGeneration || index !== activeIndex) return;
  voiceStatus = started ? 'playing' : state.audioReady && !isVoiceAvailable(index) ? 'unavailable' : 'idle'; paintVoice();
}
async function toggleVoice() {
  if (voiceStatus === 'playing') { pauseVoice(); voiceStatus = 'paused'; paintVoice(); return; }
  if (voiceStatus === 'paused') {
    const request = voiceGeneration;
    const resumed = await resumeVoice();
    if (request !== voiceGeneration || !opened) return;
    if (resumed) { voiceStatus = 'playing'; paintVoice(); return; }
  }
  void narrate();
}
function setDetails(open) {
  detailsOpen = open;
  const panel = root.querySelector('.sc-details');
  panel.dataset.open = String(open); panel.inert = !open;
  panel.setAttribute('aria-hidden', String(!open));
  root.querySelector('.sc-read')?.setAttribute('aria-expanded', String(open));
  root.classList.toggle('has-details', open);
  void animate(pose, { detail: open ? 1 : 0, duration: .4, ease: 'gt3.out' });
}
function specSection(title, data) {
  const section = el('section', 'sc-spec-section'); section.append(el('h3', 'sc-micro', title));
  const list = el('dl', 'sc-specs');
  for (const [key, value] of Object.entries(data)) {
    list.append(el('dt', '', key.replace(/([A-Z])/g, ' $1')), el('dd', '', value));
  }
  section.append(list); return section;
}
function buildDetails(car) {
  const panel = root.querySelector('.sc-details');
  panel.replaceChildren();
  const head = el('div', 'sc-details__head');
  head.append(el('span', 'sc-micro', 'The story / technical archive'), button('Close ×', 'sc-text-button', () => { setDetails(false); root.querySelector('.sc-read').focus(); }));
  panel.append(head, el('h2', 'sc-details__title', car.showcase.headline));
  car.showcase.paragraphs.forEach(text => panel.append(el('p', 'sc-prose', text)));
  panel.append(specSection('Engine / driveline', car.engine), specSection('Chassis', car.chassis));
  const history = el('section', 'sc-spec-section'); history.append(el('h3', 'sc-micro', 'Race achievements'));
  const list = el('ul', 'sc-achievements'); car.achievements.forEach(text => list.append(el('li', '', text)));
  history.append(list); panel.append(history);
  if (car.images.length) {
    const gallery = el('section', 'sc-gallery'); gallery.append(el('h3', 'sc-micro', 'In the field'));
    car.images.forEach(photo => {
      const figure = el('figure'); const image = el('img');
      image.src = photo.src; image.alt = photo.title; image.loading = 'lazy'; image.width = photo.width; image.height = photo.height;
      const caption = el('figcaption'); const link = el('a', '', `${photo.author} · ${photo.licence}`);
      link.href = photo.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; caption.append(link);
      figure.append(image, caption); gallery.append(figure);
    }); panel.append(gallery);
  }
}
function paintEditorial() {
  const unlocked = state.unlocked.has(activeIndex);
  const content = root.querySelector('.sc-editorial'); content.replaceChildren();
  root.classList.toggle('is-locked', !unlocked);
  root.classList.remove('car-identity'); root.style.removeProperty('--car-color'); root.style.removeProperty('--car-color-night');
  root.querySelector('.sc-position').textContent = `${String(activeIndex + 1).padStart(2, '0')} / 10`;
  root.querySelector('.sc-slot').textContent = String(activeIndex + 1).padStart(2, '0');
  root.querySelectorAll('.sc-dot').forEach((dot, i) => { dot.classList.toggle('is-current', i === activeIndex); dot.setAttribute('aria-current', i === activeIndex ? 'true' : 'false'); });
  voiceButton = null;
  setDetails(false); root.querySelector('.sc-details').replaceChildren();
  if (!unlocked) {
    content.append(el('div', 'sc-mystery', '?'), el('p', 'sc-locked-title', 'Undiscovered'), el('p', 'sc-locked-note', 'Found on the Grand Tour.'));
    root.querySelector('.sc-hint').textContent = 'A story still to discover';
    return;
  }
  const car = getCar(activeIndex); applyCarColor(root, car);
  const identity = el('header', 'sc-identity');
  identity.append(el('p', 'sc-micro sc-manufacturer', `${car.manufacturer} · ${car.year}`), el('h1', 'sc-name', car.displayName));
  const story = el('div', 'sc-story');
  story.append(el('h2', 'sc-headline', car.showcase.headline));
  const controls = el('div', 'sc-story__controls');
  voiceButton = button('', 'sc-text-button sc-voice', toggleVoice);
  const read = button('Explore the story ↗', 'sc-text-button sc-read', () => setDetails(!detailsOpen));
  read.setAttribute('aria-controls', 'sc-details'); read.setAttribute('aria-expanded', 'false');
  controls.append(voiceButton, read); story.append(controls); content.append(identity, story);
  root.querySelector('.sc-hint').textContent = 'Drag to inspect'; paintVoice(); buildDetails(car);
}
function buildDOM() {
  root = document.getElementById('showcase');
  if (!root) throw new Error('[showcase] Required #showcase root is missing');
  root.setAttribute('aria-label', 'Vehicle Showcase'); root.setAttribute('aria-hidden', 'true'); root.inert = true;
  const header = el('header', 'sc-header');
  header.append(button('GT3', 'sc-mark', () => onExit({ to: 'hub' }), 'GT3 — return to Hub'), button('← Collection', 'sc-back sc-text-button', () => onExit({ to: 'collection' })), el('p', 'sc-micro sc-page-label', 'The collection / Showcase'), el('span', 'sc-slot sc-micro'));
  const drag = el('div', 'sc-orbit'); drag.setAttribute('aria-label', 'Drag horizontally to orbit the vehicle, vertically to adjust the viewing angle');
  drag.addEventListener('pointerdown', event => {
    if (!mounted || loading || closing || event.button !== 0) return;
    dragging = true; lastX = event.clientX; lastY = event.clientY; velocity = 0; dragAt = performance.now(); drag.setPointerCapture(event.pointerId); drag.classList.add('is-dragging');
  });
  drag.addEventListener('pointermove', event => {
    pointerX = event.clientX / innerWidth - .5; pointerY = event.clientY / innerHeight - .5;
    if (!dragging) return;
    const delta = event.clientX - lastX, now = performance.now();
    yaw += delta * .007; pitch = THREE.MathUtils.clamp(pitch + (event.clientY - lastY) * .002, -.12, .2);
    velocity = THREE.MathUtils.clamp(delta * .007 / Math.max(.008, (now - dragAt) / 1000), -2, 2);
    lastX = event.clientX; lastY = event.clientY; dragAt = now;
  });
  const release = () => { dragging = false; drag.classList.remove('is-dragging'); };
  drag.addEventListener('pointerup', release); drag.addEventListener('pointercancel', release); drag.addEventListener('lostpointercapture', release);
  const editorial = el('section', 'sc-editorial'); editorial.setAttribute('aria-live', 'polite');
  const panel = el('aside', 'sc-details t-panel-slide'); panel.id = 'sc-details'; panel.dataset.open = 'false'; panel.inert = true;
  const nav = el('nav', 'sc-nav'); nav.setAttribute('aria-label', 'Browse collection');
  const dots = el('div', 'sc-dots');
  CARS.forEach((_, index) => dots.append(button('', 'sc-dot', () => { void present(index, index >= activeIndex ? 1 : -1); }, `Vehicle ${index + 1}`)));
  nav.append(button('←', 'sc-arrow', () => browse(-1), 'Previous vehicle'), el('span', 'sc-position sc-micro'), dots, button('→', 'sc-arrow', () => browse(1), 'Next vehicle'));
  const loader = el('div', 'sc-loading'); loader.setAttribute('role', 'progressbar'); loader.setAttribute('aria-label', 'Preparing vehicle'); loader.setAttribute('aria-valuemin', '0'); loader.setAttribute('aria-valuemax', '100');
  loader.append(el('div', 'sc-shutter sc-shutter--left'), el('div', 'sc-shutter sc-shutter--right'));
  const loadText = el('div', 'sc-loading__content'); loadText.append(el('div', 'sc-checker'), el('p', 'sc-loading__label sc-micro', 'Preparing'));
  loader.append(loadText);
  root.append(header, drag, editorial, panel, nav, el('span', 'sc-hint sc-micro', 'Drag to inspect'), loader);
  window.addEventListener('keydown', event => {
    if (!opened || closing || event.defaultPrevented || event.isComposing || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onExit({ to: 'collection' });
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); browse(event.key === 'ArrowRight' ? 1 : -1); }
  });
}
function showLoader(show) {
  const loader = root.querySelector('.sc-loading');
  loader.classList.toggle('is-loading', show); root.setAttribute('aria-busy', String(show));
  if (show) {
    gsap.killTweensOf(loader.querySelectorAll('.sc-shutter'));
    gsap.set(loader.querySelectorAll('.sc-shutter'), { xPercent: 0 });
    gsap.set(loader.querySelector('.sc-loading__content'), { opacity: 1 });
    root.querySelector('.sc-checker').style.setProperty('--progress', 0);
    root.querySelector('.sc-loading__label').textContent = 'Preparing'; loader.setAttribute('aria-valuenow', '0');
  }
}
async function revealLoader(request) {
  const loader = root.querySelector('.sc-loading');
  root.querySelector('.sc-checker').style.setProperty('--progress', 1); loader.setAttribute('aria-valuenow', '100');
  await Promise.all([
    animate(loader.querySelector('.sc-shutter--left'), { xPercent: -100, duration: .65, ease: 'gt3.out' }),
    animate(loader.querySelector('.sc-shutter--right'), { xPercent: 100, duration: .65, ease: 'gt3.out' }),
    animate(loader.querySelector('.sc-loading__content'), { opacity: 0, duration: .2 }),
  ]);
  if (request === generation) showLoader(false);
}
async function present(index, direction = 1, entry = false) {
  if (!opened || closing) return;
  const request = ++generation;
  activeIndex = wrap(index); prefetchIndex = -1; modelError = false;
  haltVoice(); dragging = false; velocity = 0; pitch = 0; yaw = -.38;
  mounted?.removeFromParent(); mounted = null;
  loading = state.unlocked.has(activeIndex) && !cache.has(activeIndex);
  paintEditorial(); showLoader(loading);
  gsap.killTweensOf(pose); pose.detail = 0; pose.carOpacity = reducedMotion.matches ? 1 : 0; pose.reveal = reducedMotion.matches ? 1 : .96; pose.shift = reducedMotion.matches ? 0 : entry && origin ? (origin.x / innerWidth - .5) * 5 : direction * .14;
  pose.lift = !reducedMotion.matches && entry && origin ? (.5 - origin.y / innerHeight) * 5 : 0;
  if (loading || state.unlocked.has(activeIndex)) {
    try {
      const model = await ensureModel(activeIndex);
      if (!opened || request !== generation || closing) return;
      if (model && state.unlocked.has(activeIndex)) { mounted = model; turntable.add(model); }
    } catch (error) {
      if (request !== generation || !opened) return;
      modelError = true; root.querySelector('.sc-hint').textContent = 'Vehicle unavailable · browse to try another';
      console.warn('[showcase] Vehicle could not be prepared', error);
    }
  }
  if (!opened || request !== generation || closing) return;
  const wasLoading = loading; loading = false;
  await Promise.all([
    wasLoading ? revealLoader(request) : Promise.resolve(),
    animate(pose, { reveal: 1, shift: 0, lift: 0, carOpacity: 1, duration: .55, ease: 'gt3.out' }),
    animate(root.querySelector('.sc-editorial'), { opacity: 1, startAt: { opacity: 0 }, duration: .4 }),
  ]);
  if (!opened || request !== generation || closing) return;
  // Narration never starts by itself (owner, Phase 6 §4): only the Listen button plays it.
  if (mounted) prefetch(direction);
}
function browse(direction) { if (!closing) void present(activeIndex + direction, direction); }

function buildScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, .1, 60);
  camera.position.set(5.1, 2.25, -6.2); camera.lookAt(0, .62, 0);
  turntable = new THREE.Group(); turntable.name = 'showcase-turntable'; scene.add(turntable);
  RectAreaLightUniformsLib.init();
  ambient = new THREE.HemisphereLight(0xd9e8ff, 0xb3ad9e, 1.6);
  key = new THREE.RectAreaLight(0xfff1df, 4.5, 6, 4); key.position.set(-4, 6, -5); key.lookAt(0, .5, 0);
  fill = new THREE.RectAreaLight(0xd3e6ff, 2.6, 5, 3); fill.position.set(5, 3, -1); fill.lookAt(0, .7, 0);
  rim = new THREE.RectAreaLight(0xffffff, 6, 6, 2); rim.position.set(0, 4, 5); rim.lookAt(0, .8, 0);
  scene.add(ambient, key, fill, rim);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, .04).texture; room.dispose(); pmrem.dispose();
  // Full-quality inspection has its own multisampled target, never a second renderer.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, target);
  const render = new RenderPass(scene, camera);
  render.clearColor = new THREE.Color(0); render.clearAlpha = 0;
  composer.addPass(render);
  output = new OutputPass();
  // Composite the literal CSS field AFTER the car's tone mapping, before sRGB output.
  // Otherwise ACES grades the pale Day field and makes the page/panel visibly disagree.
  output.uniforms.fieldColor = { value: fieldColor };
  output.uniforms.carOpacity = { value: 1 };
  output.material.fragmentShader = output.material.fragmentShader
    .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse; uniform vec3 fieldColor; uniform float carOpacity;')
    .replace('// tone mapping', 'gl_FragColor.rgb /= max(gl_FragColor.a, 0.0001);\n // tone mapping')
    .replace('// color space', 'gl_FragColor.rgb = mix(fieldColor, gl_FragColor.rgb, gl_FragColor.a * carOpacity); gl_FragColor.a = 1.0;\n // color space');
  composer.addPass(output);
}
function update(dt) {
  if (!opened) return;
  const delta = Math.min(.05, Math.max(0, dt)); frameDelta = delta; elapsed += delta;
  const targetNight = state.theme === 'night' ? 1 : 0;
  themeNight = reducedMotion.matches ? targetNight : THREE.MathUtils.damp(themeNight, targetNight, 5, delta);
  if (!dragging) {
    yaw += (reducedMotion.matches ? 0 : .055 + velocity) * delta;
    velocity *= Math.exp(-4.2 * delta);
  }
  const float = reducedMotion.matches ? 0 : Math.sin(elapsed * .72) * .035;
  turntable.rotation.set(0, yaw, 0); // pitch is camera elevation: the underside never tips into view
  turntable.position.set(pose.shift - pose.detail * 1.7, .07 + float + pose.lift, 0);
  turntable.scale.setScalar(pose.reveal);
  // Closer than the legacy framing (owner: the vehicle dominates); pitch stays camera elevation.
  camera.position.y = 2.25 + pitch * 6.4 + (reducedMotion.matches ? 0 : pointerY * .06);
  camera.position.x = 5.1 + (reducedMotion.matches ? 0 : pointerX * .07);
  camera.lookAt(0, .62, 0);
  scene.environmentIntensity = THREE.MathUtils.lerp(.9, .65, themeNight);
  ambient.intensity = THREE.MathUtils.lerp(1.6, .55, themeNight);
  key.intensity = THREE.MathUtils.lerp(4.5, 4, themeNight);
  fill.intensity = THREE.MathUtils.lerp(2.6, 2.8, themeNight);
  rim.intensity = THREE.MathUtils.lerp(6, 7, themeNight);
}
export function initShowcase(options) {
  if (renderer) return;
  renderer = options.renderer; onExit = options.onExit;
  options.registerUpdate(update);
  onVoiceEnded(index => { if (opened && index === activeIndex) { voiceStatus = 'ended'; paintVoice(); } });
  // The DOM, environment and inspection targets are lazy. No full models at boot.
  subscribe('unlocked', () => { if (opened && !closing) void present(activeIndex); });
}
export async function openShowcase({ index = activeIndex, mode: nextMode = 'full', origin: nextOrigin = null } = {}) {
  if (!renderer) throw new Error('[showcase] initShowcase must run first');
  if (closing) return;
  if (!root) { buildDOM(); buildScene(); }
  if (!opened) previousFocus = document.activeElement;
  mode = nextMode === 'single' ? 'single' : 'full';
  origin = nextOrigin && Number.isFinite(nextOrigin.x) && Number.isFinite(nextOrigin.y) ? nextOrigin : null;
  opened = true; themeNight = state.theme === 'night' ? 1 : 0; sizeKey = ''; fieldCSS = '';
  fieldColor.set(getComputedStyle(root).getPropertyValue('--field').trim());
  root.inert = false; root.classList.add('is-open'); root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('showcase-active');
  gsap.set(root, { opacity: 1 });
  const request = generation + 1;
  await present(Number.isInteger(index) ? index : 0, 1, true);
  if (opened && !closing && request === generation) root.querySelector('.sc-back').focus({ preventScroll: true, focusVisible: false });
}
export async function closeShowcase() {
  if (!opened || closing) return;
  closing = true; ++generation; prefetchIndex = -1; haltVoice(); root.inert = true;
  await Promise.all([
    animate(root, { opacity: 0, duration: .3, ease: 'gt3' }),
    animate(pose, { reveal: .96, carOpacity: 0, shift: !reducedMotion.matches && origin ? (origin.x / innerWidth - .5) * 5 : 0, lift: !reducedMotion.matches && origin ? (.5 - origin.y / innerHeight) * 5 : 0, duration: .35, ease: 'gt3' }),
  ]);
  opened = false; closing = false; loading = false;
  mounted?.removeFromParent(); mounted = null;
  root.classList.remove('is-open'); root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('showcase-active');
  previousFocus?.focus?.({ preventScroll: true });
}
export function isShowcaseOpen() { return opened; }
export function renderShowcase() {
  if (!opened || !composer) return false;
  const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  const nextSize = `${w}/${h}/${dpr}`;
  if (sizeKey !== nextSize) {
    sizeKey = nextSize; camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    renderer.domElement.style.transform = ''; renderer.domElement.style.clipPath = '';
    composer.setPixelRatio(dpr); composer.setSize(w, h);
  }
  const nextField = getComputedStyle(root).getPropertyValue('--field').trim();
  if (nextField !== fieldCSS) { fieldCSS = nextField; fieldTarget.set(nextField); }
  fieldColor.lerp(fieldTarget, reducedMotion.matches ? 1 : 1 - Math.exp(-7 * frameDelta));
  output.uniforms.carOpacity.value = pose.carOpacity;
  const exposure = renderer.toneMappingExposure, tone = renderer.toneMapping;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = THREE.MathUtils.lerp(1.05, .9, themeNight);
  renderer.setScissorTest(false); renderer.setRenderTarget(null);
  try { composer.render(); } finally { renderer.toneMappingExposure = exposure; renderer.toneMapping = tone; }
  return true;
}
/** Read-only review snapshot; identities of locked slots never enter the DOM or model loader. */
export function showcaseState() {
  return { open: opened, index: activeIndex, mode, locked: !state.unlocked.has(activeIndex), loading, modelError, detailsOpen, voiceStatus,
    cache: [...cache.keys()], pending: [...pending.keys()], resources: { ...resources }, memory: { ...renderer?.info.memory },
    modelVisible: Boolean(mounted), pitch, yaw };
}
