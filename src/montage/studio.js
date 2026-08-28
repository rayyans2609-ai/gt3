/**
 * Shared, isolated studio and montage timeline runner.
 *
 * main.js owns the application's RAF. Register updateMontage(dt) with that loop and
 * call renderMontage() after the race render while a montage is active.
 */

import * as THREE from 'three';
import { CARS } from '../data/cars.js';
import { cloneCarModel } from '../scene/cars.js';
import { lockScroll, unlockScroll } from '../scroll/scrollDrive.js';
import { onMontageEnd, onMontageStart } from '../audio/audioManager.js';
import { set } from '../core/state.js';
import {
  BEATS,
  EASES,
  MONTAGE_DURATION,
  SHOTS,
  shotAt,
} from './choreography.js';

const DEG_TO_RAD = Math.PI / 180;
const MAX_PIXEL_RATIO = 2;

let initialized = false;
let playing = false;
let elapsed = 0;
let activeCarIndex = -1;
let studioCar = null;
let morphFired = false;
let audioStarted = false;
let audioRestored = false;
let morphHandler = null;
let expandHandler = null;

let studioScene;
let studioCamera;
let studioRenderer;
let turntable;
let backdrop;
let floor;
let layer;
let canvas;
let card;
let skipControl;

const completionHandlers = new Set();
const cameraPosition = new THREE.Vector3();
const cameraLook = new THREE.Vector3();
const outgoingPosition = new THREE.Vector3();
const outgoingLook = new THREE.Vector3();

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function beatProgress(beat, time = elapsed) {
  if (time < beat.at) return 0;
  if (!beat.duration || beat.duration <= 0) return 1;
  return clamp01((time - beat.at) / beat.duration);
}

function easedBeat(beat, time = elapsed) {
  return EASES.settle(beatProgress(beat, time));
}

function lerpNumber(from, to, amount) {
  return from + (to - from) * amount;
}

function setVectorFromRecord(target, record) {
  target.set(record.x, record.y, record.z);
  return target;
}

function sampleShot(shot, local, positionTarget, lookTarget) {
  const ease = EASES[shot.ease];
  const amount = ease ? ease(clamp01(local)) : clamp01(local);

  positionTarget.set(
    lerpNumber(shot.from.x, shot.to.x, amount),
    lerpNumber(shot.from.y, shot.to.y, amount),
    lerpNumber(shot.from.z, shot.to.z, amount),
  );
  lookTarget.set(
    lerpNumber(shot.lookFrom.x, shot.lookTo.x, amount),
    lerpNumber(shot.lookFrom.y, shot.lookTo.y, amount),
    lerpNumber(shot.lookFrom.z, shot.lookTo.z, amount),
  );

  return {
    fov: lerpNumber(shot.fov[0], shot.fov[1], amount),
    roll: lerpNumber(shot.roll?.[0] ?? 0, shot.roll?.[1] ?? 0, amount),
    turntable: lerpNumber(shot.turntable[0], shot.turntable[1], amount),
  };
}

function sampleShotEnd(shot, positionTarget, lookTarget) {
  setVectorFromRecord(positionTarget, shot.to);
  setVectorFromRecord(lookTarget, shot.lookTo);
  return {
    fov: shot.fov[1],
    roll: shot.roll?.[1] ?? 0,
    turntable: shot.turntable[1],
  };
}

function createBackdrop() {
  const geometry = new THREE.SphereGeometry(28, 64, 32);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(CARS[0].brandColorSoft) },
      uOpacity: { value: 0 },
      uRise: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vPosition;

      void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uRise;
      varying vec2 vUv;
      varying vec3 vPosition;

      void main() {
        float centreField = 1.0 - smoothstep(5.0, 25.0, length(vPosition.xz));
        float verticalShade = smoothstep(0.06, 0.74, vUv.y);
        float reveal = 1.0 - smoothstep(uRise, uRise + 0.10, vUv.y);
        vec3 low = uColor * 0.24;
        vec3 high = uColor * 0.82 + vec3(0.025);
        vec3 colour = mix(low, high, verticalShade * 0.72 + centreField * 0.28);
        gl_FragColor = vec4(colour, uOpacity * reveal);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'montage-brand-cyclorama';
  mesh.scale.set(1.35, 0.72, 1.35);
  mesh.position.y = 6;
  mesh.renderOrder = -20;
  return mesh;
}

function createFloor() {
  const geometry = new THREE.CircleGeometry(23, 96);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uColor: { value: new THREE.Color(CARS[0].brandColorSoft) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;

      void main() {
        float radius = length(vUv - 0.5) * 2.0;
        float falloff = 1.0 - smoothstep(0.20, 1.0, radius);
        vec3 colour = mix(uColor * 0.16, uColor * 0.42 + vec3(0.018), falloff);
        gl_FragColor = vec4(colour, 0.82 * (1.0 - smoothstep(0.88, 1.0, radius)));
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'montage-floor-falloff';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.018;
  mesh.receiveShadow = true;
  return mesh;
}

function createContactShadow() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vec2 centred = (vUv - 0.5) * vec2(1.0, 2.45);
        float alpha = (1.0 - smoothstep(0.05, 0.52, length(centred))) * 0.42;
        gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
      }
    `,
  });

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.0), material);
  shadow.name = 'montage-soft-contact-shadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;
  shadow.renderOrder = 3;
  return shadow;
}

function createLighting() {
  const ambient = new THREE.AmbientLight(0xe8edf0, 0.28);

  const key = new THREE.RectAreaLight(0xffe7cf, 8.5, 5.5, 2.8);
  key.name = 'montage-key';
  key.position.set(-4.8, 5.8, -4.2);
  key.lookAt(0, 0.7, 0);

  const fill = new THREE.RectAreaLight(0xb9cee0, 3.2, 4.2, 3.0);
  fill.name = 'montage-fill';
  fill.position.set(5.4, 2.8, -1.2);
  fill.lookAt(0, 0.7, 0);

  const rim = new THREE.RectAreaLight(0xfff4df, 11.5, 4.0, 2.0);
  rim.name = 'montage-rim';
  rim.position.set(1.5, 4.1, 6.0);
  rim.lookAt(0, 0.9, 0);

  const shadowKey = new THREE.DirectionalLight(0xffe8d2, 2.1);
  shadowKey.name = 'montage-shadow-key';
  shadowKey.position.set(-5.5, 8.0, -4.5);
  shadowKey.castShadow = true;
  shadowKey.shadow.mapSize.set(2048, 2048);
  shadowKey.shadow.camera.left = -7;
  shadowKey.shadow.camera.right = 7;
  shadowKey.shadow.camera.top = 7;
  shadowKey.shadow.camera.bottom = -7;
  shadowKey.shadow.camera.near = 1;
  shadowKey.shadow.camera.far = 24;
  shadowKey.shadow.bias = -0.00025;
  shadowKey.shadow.normalBias = 0.025;
  shadowKey.target.position.set(0, 0.5, 0);

  studioScene.add(ambient, key, fill, rim, shadowKey, shadowKey.target);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createDom() {
  layer = document.getElementById('montage-layer');
  if (!layer) throw new Error('[montage] Expected #montage-layer in the document.');

  layer.replaceChildren();
  layer.className = '';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.setProperty('--montage-mix', '0');

  canvas = element('canvas', 'montage-canvas');
  canvas.setAttribute('aria-hidden', 'true');

  card = element('section', 'montage-card');
  card.setAttribute('aria-label', 'Car specifications and race achievements');

  skipControl = element('button', 'montage-skip');
  skipControl.type = 'button';
  skipControl.setAttribute('aria-label', 'Skip showcase montage');
  skipControl.append(
    element('span', 'montage-skip__key', 'ESC'),
    element('span', 'montage-skip__text', 'TO SKIP'),
  );
  skipControl.addEventListener('click', skipMontage);

  layer.append(canvas, card, skipControl);
}

function createStudioRenderer() {
  studioRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
  });
  studioRenderer.outputColorSpace = THREE.SRGBColorSpace;
  studioRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  studioRenderer.toneMappingExposure = 1.08;
  studioRenderer.shadowMap.enabled = true;
  studioRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  studioRenderer.setClearColor(0x000000, 0);
}

function resizeRendererToDisplaySize() {
  if (!studioRenderer || !studioCamera) return;
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const targetWidth = Math.floor(width * pixelRatio);
  const targetHeight = Math.floor(height * pixelRatio);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    studioRenderer.setPixelRatio(pixelRatio);
    studioRenderer.setSize(width, height, false);
    studioCamera.aspect = width / height;
    studioCamera.updateProjectionMatrix();
  }
}

function makeCard(carData) {
  const identity = element('header', 'montage-card__identity');
  identity.append(
    element('p', 'montage-eyebrow', carData.manufacturer),
    element('h2', 'montage-card__name', carData.displayName),
    element('p', 'montage-card__year', `${carData.year} · ${carData.series}`),
  );
  const rule = element('span', 'montage-card__rule');
  rule.style.backgroundColor = carData.brandColor;
  identity.append(rule);

  const images = carData.images.slice(0, 3);
  if (images.length > 0) {
    const gallery = element('div', 'montage-card__gallery');
    for (const [index, source] of images.entries()) {
      const image = element('img', 'montage-card__image');
      image.src = source;
      image.alt = `${carData.displayName} reference ${index + 1}`;
      image.loading = 'eager';
      gallery.append(image);
    }
    identity.append(gallery);
    card.classList.add('has-images');
  } else {
    card.classList.remove('has-images');
  }

  const engineSection = element('section', 'montage-card__engine');
  engineSection.append(element('h3', 'montage-section-label', 'Engine / Driveline'));
  const engineGrid = element('dl', 'montage-engine-grid');
  const engineRows = [
    ['Configuration', carData.engine.configuration],
    ['Displacement', carData.engine.displacement],
    ['Induction', carData.engine.induction],
    ['Power', carData.engine.power],
    ['Redline', carData.engine.redline],
    ['Transmission', carData.engine.transmission],
    ['Drivetrain', carData.engine.drivetrain],
  ];
  for (const [label, value] of engineRows) {
    const item = element('div', 'montage-engine-grid__item');
    item.append(
      element('dt', 'montage-engine-grid__label', label),
      element('dd', 'montage-engine-grid__value', value),
    );
    engineGrid.append(item);
  }
  engineSection.append(engineGrid);

  const achievementsSection = element('section', 'montage-card__achievements');
  achievementsSection.append(element('h3', 'montage-section-label', 'Race Achievements'));
  const achievements = element('ul', 'montage-achievement-list');
  for (const achievement of carData.achievements.slice(0, 4)) {
    achievements.append(element('li', 'montage-achievement-list__item', achievement));
  }
  achievementsSection.append(achievements);

  const actions = element('div', 'montage-card__actions');
  const expand = element('button', 'montage-expand');
  expand.type = 'button';
  expand.append(
    element('span', 'montage-expand__mark', '+'),
    element('span', 'montage-expand__label', 'Expand'),
  );
  expand.addEventListener('click', () => {
    if (typeof expandHandler === 'function' && activeCarIndex >= 0) {
      expandHandler(activeCarIndex);
    }
  });
  actions.append(expand);

  card.replaceChildren(identity, engineSection, achievementsSection, actions);
  card.style.setProperty('--montage-brand', carData.brandColor);
}

function cloneGeometryInstances(root) {
  root.traverse((object) => {
    if (object.isMesh && object.geometry) object.geometry = object.geometry.clone();
  });
}

function disposeStudioCar() {
  if (!studioCar) return;
  turntable.remove(studioCar);

  const geometries = new Set();
  const materials = new Set();
  studioCar.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry) geometries.add(object.geometry);
    if (Array.isArray(object.material)) {
      for (const material of object.material) if (material) materials.add(material);
    } else if (object.material) {
      materials.add(object.material);
    }
  });

  for (const geometry of geometries) geometry.dispose();
  // Textures are deliberately shared with the preloaded race models and must survive.
  for (const material of materials) material.dispose();
  studioCar = null;
}

function setBrand(carData) {
  const soft = new THREE.Color(carData.brandColorSoft);
  backdrop.material.uniforms.uColor.value.copy(soft);
  floor.material.uniforms.uColor.value.copy(soft);
  studioScene.fog.color.copy(soft).multiplyScalar(0.52);
}

function applyCamera(time) {
  const { index, shot, local } = shotAt(time);
  const current = sampleShot(shot, local, cameraPosition, cameraLook);
  let fov = current.fov;
  let roll = current.roll;
  let turntableAngle = current.turntable;

  if (index > 0) {
    const shotElapsed = local * shot.duration;
    const blendDuration = Math.max(0, shot.blend || 0);
    if (blendDuration > 0 && shotElapsed < blendDuration) {
      const previous = sampleShotEnd(SHOTS[index - 1], outgoingPosition, outgoingLook);
      const blend = EASES.settle(clamp01(shotElapsed / blendDuration));
      cameraPosition.lerpVectors(outgoingPosition, cameraPosition, blend);
      cameraLook.lerpVectors(outgoingLook, cameraLook, blend);
      fov = lerpNumber(previous.fov, fov, blend);
      roll = lerpNumber(previous.roll, roll, blend);
      turntableAngle = lerpNumber(previous.turntable, turntableAngle, blend);
    }
  }

  studioCamera.position.copy(cameraPosition);
  studioCamera.fov = fov;
  studioCamera.updateProjectionMatrix();
  studioCamera.up.set(0, 1, 0);
  studioCamera.lookAt(cameraLook);
  studioCamera.rotateZ(roll * DEG_TO_RAD);
  turntable.rotation.y = turntableAngle * DEG_TO_RAD;
}

function fireMorph() {
  if (morphFired || activeCarIndex < 0) return;
  morphFired = true;
  if (typeof morphHandler === 'function') {
    try {
      morphHandler(activeCarIndex);
    } catch (error) {
      // An integration callback must never strand the user inside the montage.
      console.error('[montage] Morph handler failed.', error);
    }
  }
}

function startMontageAudio() {
  if (audioStarted || activeCarIndex < 0) return;
  audioStarted = true;
  onMontageStart(activeCarIndex);
}

function restoreAudio() {
  if (audioRestored) return;
  audioRestored = true;
  onMontageEnd();
}

function applyTimeline(time) {
  applyCamera(time);

  const backdropAmount = EASES.drift(beatProgress(BEATS.backdropIn, time));
  backdrop.material.uniforms.uRise.value = backdropAmount * 1.1;
  backdrop.material.uniforms.uOpacity.value = backdropAmount;

  let montageMix = easedBeat(BEATS.raceFadeOut, time);
  if (time >= BEATS.raceFadeIn.at) {
    montageMix *= 1 - easedBeat(BEATS.raceFadeIn, time);
  }
  layer.style.setProperty('--montage-mix', String(montageMix));

  let cardAmount = easedBeat(BEATS.cardIn, time);
  if (time >= BEATS.cardOut.at) cardAmount *= 1 - easedBeat(BEATS.cardOut, time);
  card.style.opacity = String(cardAmount);
  card.style.transform = `translate3d(0, ${(1 - cardAmount) * 28}px, 0)`;

  const skipAmount = easedBeat(BEATS.skipHintIn, time);
  skipControl.style.opacity = String(skipAmount);
  skipControl.style.transform = `translate3d(0, ${(1 - skipAmount) * 8}px, 0)`;

  if (time >= BEATS.audioSwell.at) startMontageAudio();
  if (time >= BEATS.audioRestore.at) restoreAudio();
  if (time >= BEATS.morphFire.at) fireMorph();
}

function notifyComplete(carIndex, skipped) {
  for (const handler of completionHandlers) {
    try {
      handler(carIndex, { skipped });
    } catch (error) {
      console.error('[montage] Completion handler failed.', error);
    }
  }
}

function finishMontage(skipped) {
  if (!playing) return;
  const completedCarIndex = activeCarIndex;

  fireMorph();
  restoreAudio();
  disposeStudioCar();

  playing = false;
  elapsed = 0;
  activeCarIndex = -1;
  layer.classList.remove('is-active');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.setProperty('--montage-mix', '0');
  card.style.opacity = '0';
  skipControl.style.opacity = '0';
  backdrop.material.uniforms.uOpacity.value = 0;
  set('mode', 'race');
  unlockScroll();

  notifyComplete(completedCarIndex, skipped);
}

function onKeyDown(event) {
  if (playing && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    skipMontage();
  }
}

/** Create the one shared studio scene. Repeated calls return the same objects. */
export function initStudio() {
  if (initialized) {
    return {
      scene: studioScene,
      camera: studioCamera,
      renderer: studioRenderer,
      turntable,
    };
  }

  createDom();
  createStudioRenderer();

  studioScene = new THREE.Scene();
  studioScene.fog = new THREE.FogExp2(0x171719, 0.018);
  studioCamera = new THREE.PerspectiveCamera(SHOTS[0].fov[0], 1, 0.08, 120);

  turntable = new THREE.Group();
  turntable.name = 'montage-turntable';
  backdrop = createBackdrop();
  floor = createFloor();
  turntable.add(createContactShadow());
  studioScene.add(backdrop, floor, turntable);
  createLighting();

  window.addEventListener('keydown', onKeyDown, { capture: true });
  resizeRendererToDisplaySize();
  applyCamera(0);
  initialized = true;

  return {
    scene: studioScene,
    camera: studioCamera,
    renderer: studioRenderer,
    turntable,
  };
}

/** Begin the authoritative 15.6 second montage for a preloaded roster entry. */
export function playMontage(carIndex) {
  if (playing) return false;
  if (!Number.isInteger(carIndex) || carIndex < 0 || carIndex >= CARS.length) {
    throw new RangeError(`[montage] Car index must be 0-${CARS.length - 1}.`);
  }

  initStudio();
  const clone = cloneCarModel(carIndex);
  // cloneCarModel gives us private materials. Geometry is cloned here as well so
  // montage cleanup can dispose it without invalidating the preloaded race model.
  cloneGeometryInstances(clone);

  studioCar = clone;
  studioCar.name = `montage-${CARS[carIndex].id}`;
  turntable.add(studioCar);
  turntable.rotation.set(0, 0, 0);

  activeCarIndex = carIndex;
  elapsed = 0;
  morphFired = false;
  audioStarted = false;
  audioRestored = false;
  playing = true;

  makeCard(CARS[carIndex]);
  setBrand(CARS[carIndex]);
  layer.classList.add('is-active');
  layer.setAttribute('aria-hidden', 'false');
  set('mode', 'montage');
  lockScroll();
  applyTimeline(0);
  renderMontage();
  return true;
}

/** End immediately, leaving no partial visual/audio/scroll state behind. */
export function skipMontage() {
  if (!playing) return false;
  finishMontage(true);
  return true;
}

export function isMontagePlaying() {
  return playing;
}

/** Advance the montage clock from main.js's sole RAF loop. */
export function updateMontage(dt) {
  if (!playing) return;
  const frameTime = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  elapsed = Math.min(MONTAGE_DURATION, elapsed + frameTime);
  applyTimeline(elapsed);

  if (elapsed >= MONTAGE_DURATION) finishMontage(false);
}

/** Render the studio canvas. The race renderer remains visible underneath it. */
export function renderMontage() {
  if (!playing || !studioRenderer) return;
  resizeRendererToDisplaySize();
  studioRenderer.render(studioScene, studioCamera);
}

export function setMorphHandler(fn) {
  if (fn !== null && fn !== undefined && typeof fn !== 'function') {
    throw new TypeError('[montage] setMorphHandler expects a function or null.');
  }
  morphHandler = fn || null;
}

export function setExpandHandler(fn) {
  if (fn !== null && fn !== undefined && typeof fn !== 'function') {
    throw new TypeError('[montage] setExpandHandler expects a function or null.');
  }
  expandHandler = fn || null;
}

/** Register completion for both the natural and skipped exit paths. */
export function onMontageComplete(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('[montage] onMontageComplete expects a function.');
  }
  completionHandlers.add(fn);
  return () => completionHandlers.delete(fn);
}
