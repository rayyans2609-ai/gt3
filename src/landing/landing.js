/**
 * landing.js — Phase 4 Landing (SPEC §4): the floating hero car and the scroll-driven
 * Landing → Hub signature transition.
 *
 * Draws through the SHARED renderer (SPEC §27: no second renderer) into its own small scene
 * and camera. While the Landing owns the screen, main.js draws this instead of the Tour, so
 * the Tour is never drawn behind it. Landing scroll is native window scroll over
 * #landing-spacer; the Tour drive is dormant meanwhile (scrollDrive.setDriveDormant).
 *
 * Every frame is a pure function of three inputs: the (lightly damped) landing scroll
 * progress, the damped pointer, and idle time — and idle time only advances at rest. Scrolling
 * back up therefore reconstructs exactly the same frames in reverse.
 *
 * The hero is a featured presentation only (owner, 2026-10-24: McLaren 720S GT3). It never
 * touches the Tour roster, its starter car, discovery state or progression.
 */

import * as THREE from 'three';
import { state, subscribe } from '../core/state.js';
import { loadFullResolutionCar, carsReady, cloneCarModel } from '../scene/cars.js';

export const HERO_INDEX = 6; // McLaren 720S GT3 (roster order unchanged; SPEC §1a)

// Theme base fields. Day is pure white and Night the deep navy of the global tokens (SPEC §4, §13);
// the DOM field (--landing-field in landing.css) uses the same two values.
const FIELD = { day: new THREE.Color('#ffffff'), night: new THREE.Color('#0c1930') };
const THEME_SECONDS = 0.7; // matches the 700 ms CSS token transition

// Native-resolution render while the Landing owns the screen: one car on a flat field is cheap,
// and a small hero at DPR1 would read soft. The Tour's fixed DPR is restored on exit.
const LANDING_DPR = Math.min(window.devicePixelRatio || 1, 2);

// ---------------------------------------------------------------------------
// Composition and choreography. Units are metres (canonical car length 4.6, nose toward -Z).
// ---------------------------------------------------------------------------
const TUNE = {
  restFov: 20,
  closeFov: 28,
  restElevationDeg: 8.5,
  restWidthFraction: 0.29,    // projected car width / viewport width at rest
  restHeightFraction: 0.34,   // cap for tall or narrow viewports
  restScreenX: 0.665,         // car centre, fraction of viewport width (lens shift, no skew)
  restScreenY: 0.405,
  floatHeight: 0.92,          // pivot (car centre) above the shadow plane
  bobAmplitude: 0.035,
  bobSeconds: 7.5,
  idleDegPerSecond: 4.2,      // "extremely slowly": one turn in ~86 s
  heroAzimuthDeg: 34,         // deliberate front-three-quarter, from the nose toward car-left
  pointerYaw: 0.13,
  pointerPitch: 0.045,
  pointerEnvYaw: 0.32,        // restrained lighting response to the pointer
  pointerDamping: 3.2,        // 1/s
  scrollDamping: 9,           // 1/s: smooths wheel steps; never runs on after input ends
  // Close-up target: the near (car-left) LED headlight unit (measured from the GLB: centre
  // -0.70, 0.43, -1.91 in model space), in pivot space.
  headlight: [-0.70, -0.15, -1.91],
  approach: [-0.42, 0.24, -1.0], // direction from the headlight toward the final camera
  closeDistance: 0.8,          // closer than this and the 1024 px livery visibly softens
  openingYawDeg: -30,         // first impression: a front three-quarter, turning toward the hero angle
};

// Scroll-progress segments (progress 0 = Landing at rest, 1 = Hub at rest).
const SEG = {
  settle: [0, 0.22],
  type: [0.05, 0.36],
  lamps: [0.56, 0.84],
  push: [0.17, 0.97],
  resolve: [0.78, 0.985],
  hub: [0.965, 1],
  hubEnter: 0.99,
  hubLeave: 0.975,
};

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let renderer = null;
let scene = null;
let camera = null;
let pivot = null;
let carHolder = null;
let shadow = null;
let keyLight = null;
let fillLight = null;
let rimLight = null;
let heroReady = false;
const lampGlows = [];    // the authored emissive lamp strips (DRL), brightened as the camera arrives
let heroAppear = 0;
let active = false;
let hubHandler = null;
let landingHandler = null;
let hubPresence = 0;

// Inputs.
let progress = 0;          // damped
let targetProgress = 0;    // from window.scrollY
let lastInputAt = -Infinity;
let idleYaw = THREE.MathUtils.degToRad(TUNE.openingYawDeg - TUNE.heroAzimuthDeg);
let lastYawDelta = 0;
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
const themeMix = { value: 0, target: 0 }; // 0 day, 1 night

// DOM.
let wordmark = null;
let eyebrow = null;
let cue = null;
let caption = null;
let resolveLayer = null;
let lastStyle = {};

// Scratch.
const _yAxis = new THREE.Vector3(0, 1, 0);
const _center = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _headlight = new THREE.Vector3();
const _approach = new THREE.Vector3();
const _restDir = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _field = new THREE.Color();
const _q = new THREE.Quaternion();
const heroYaw = -THREE.MathUtils.degToRad(TUNE.heroAzimuthDeg);
let restDistance = 20;

// ---------------------------------------------------------------------------
// Studio reflections: a soft neutral room with long strip softboxes, rendered once to PMREM.
// The strips give the long highlight streaks that read as automotive paint.
// ---------------------------------------------------------------------------
function buildEnvironment() {
  const room = new THREE.Scene();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.42, 0.43, 0.45), side: THREE.BackSide }));
  room.add(shell);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(19, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.16, 0.17) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3;
  room.add(floor);
  const strip = (w, h, intensity, position, lookAt) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide }));
    mesh.position.set(...position);
    mesh.lookAt(...lookAt);
    room.add(mesh);
  };
  strip(16, 2.2, 7, [0, 9, 0], [0, 0, 0]);          // long overhead strip along the car
  strip(2.0, 9, 3.2, [-11, 3, -3], [0, 1, 0]);       // tall side strips
  strip(2.0, 9, 2.4, [11, 3, 4], [0, 1, 0]);
  strip(12, 1.2, 2.2, [0, 4.5, -12], [0, 1, 0]);    // front kicker for the nose and lamps
  strip(10, 6, 0.9, [0, 3, 13], [0, 1, 0]);          // broad, dim rear fill
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(room, 0.025);
  pmrem.dispose();
  room.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
  target.texture.name = 'GT3LandingStudioPMREM';
  return target.texture;
}

function buildShadow() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.22)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;
  return mesh;
}

/** Studio paint: a clear coat over the authored livery. Only this Landing copy is changed. */
function dressHero(model) {
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.anisotropy = renderer.capabilities.getMaxAnisotropy();
      }
      if (material.isMeshPhysicalMaterial && /Carpaint_Inst$|Rear_carbon/.test(material.name)) {
        material.clearcoat = 1;
        material.clearcoatRoughness = 0.045;
      }
      // The lamps wake with the scroll: only emissiveIntensity changes (a uniform, no new shader).
      if (/^(lights_emissive|endu_lights)/.test(material.name) && !lampGlows.includes(material)) {
        lampGlows.push(material);
      }
    }
  });
}

async function mountHero(model) {
  dressHero(model);
  // The canonical model stands on y = 0; centre it on the pivot so yaw and pitch turn about
  // the body's middle rather than its contact patch.
  model.position.y -= 0.58;
  carHolder.add(model);
  // Compile before the first draw (parallel where supported), so the hero's first-use shader
  // work never lands on a visible frame or on the scroll path.
  try {
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (error) {
    console.warn('[landing] hero precompile failed; compiling on first draw', error);
  }
  heroReady = true;
}

let heroPromise = null;

/**
 * Start fetching the hero before the renderer exists. The full-resolution file is optional
 * quality, not a dependency: on failure the roster copy (already loading for the Tour) stands in.
 */
export function preloadHero() {
  heroPromise ??= loadFullResolutionCar(HERO_INDEX).catch(async (error) => {
    console.warn('[landing] full-resolution hero unavailable; using the roster model', error);
    await carsReady;
    return cloneCarModel(HERO_INDEX);
  });
  return heroPromise;
}

async function loadHero() {
  try {
    await mountHero(await preloadHero());
  } catch (error) {
    console.error('[landing] hero car unavailable', error);
  }
}

// ---------------------------------------------------------------------------
// Framing
// ---------------------------------------------------------------------------
function solveRestDistance() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(TUNE.restFov) / 2);
  // At the hero angle the car spans ~4.1 m across and ~1.6 m tall (wing included).
  const byWidth = 4.1 / (TUNE.restWidthFraction * 2 * tanHalf * aspect);
  const byHeight = 1.6 / (TUNE.restHeightFraction * 2 * tanHalf);
  restDistance = Math.max(byWidth, byHeight);
}

function restCameraPosition(out) {
  const elevation = THREE.MathUtils.degToRad(TUNE.restElevationDeg);
  return out.set(0, Math.sin(elevation) * restDistance, -Math.cos(elevation) * restDistance)
    .add(_center.set(0, TUNE.floatHeight, 0));
}

/** World headlight point and approach direction for the car at its hero angle. */
function headlightFrame(point, approach) {
  _q.setFromAxisAngle(_yAxis, heroYaw);
  point.set(...TUNE.headlight).applyQuaternion(_q).add(_center.set(0, TUNE.floatHeight, 0));
  approach.set(...TUNE.approach).normalize().applyQuaternion(_q);
}

/**
 * The push: aim moves from the car's centre to the headlight, the viewing direction swings from
 * the resting angle onto the headlight's approach line, and the distance shrinks geometrically,
 * so the subject grows at an even perceived rate instead of all at the end.
 */
function pushCamera(out, look, s) {
  restCameraPosition(_rest);
  _center.set(0, TUNE.floatHeight, 0);
  _restDir.copy(_rest).sub(_center).normalize();
  headlightFrame(_headlight, _approach);
  look.copy(_center).lerp(_headlight, smooth(0.04, 0.72, s));
  _dir.copy(_restDir).lerp(_approach, smooth(0, 0.8, s)).normalize();
  const distance = restDistance * Math.pow(TUNE.closeDistance / restDistance, s);
  return out.copy(look).addScaledVector(_dir, distance);
}

function resize() {
  if (!camera) return;
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  solveRestDistance();
  if (active) {
    renderer.setPixelRatio(LANDING_DPR);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
function readScroll() {
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  return Math.min(1, Math.max(0, (window.scrollY || 0) / max));
}

function onScroll() {
  if (!active) return;
  targetProgress = readScroll();
  lastInputAt = performance.now();
}

function onPointer(event) {
  pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
}

function onPointerLeave() {
  pointer.tx = 0;
  pointer.ty = 0;
}

// ---------------------------------------------------------------------------
// DOM writes (only when a value actually changes)
// ---------------------------------------------------------------------------
function write(node, key, property, value) {
  if (!node || lastStyle[key] === value) return;
  lastStyle[key] = value;
  if (property.startsWith('--')) node.style.setProperty(property, value);
  else node.style[property] = value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build the Landing scene on the shared renderer and start loading the hero. */
export function initLanding(sharedRenderer, { onHub, onLanding } = {}) {
  if (scene) return;
  renderer = sharedRenderer;
  hubHandler = onHub;
  landingHandler = onLanding;

  scene = new THREE.Scene();
  themeMix.value = themeMix.target = state.theme === 'night' ? 1 : 0;
  scene.background = _field.copy(FIELD.day).lerp(FIELD.night, themeMix.value).clone();
  scene.environment = buildEnvironment();
  scene.environmentIntensity = 1;

  camera = new THREE.PerspectiveCamera(TUNE.restFov, 1, 0.05, 200);

  keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(-4, 9, -6);
  fillLight = new THREE.DirectionalLight(0xdfe8f2, 0.35);
  fillLight.position.set(6, 3, 5);
  // Night only: a cool rim that draws the silhouette out of the navy.
  rimLight = new THREE.DirectionalLight(0xbcd2ff, 0);
  rimLight.position.set(5, 6, 9);
  scene.add(keyLight, fillLight, rimLight);

  pivot = new THREE.Group();
  pivot.name = 'landing-hero-pivot';
  pivot.position.y = TUNE.floatHeight;
  carHolder = new THREE.Group();
  pivot.add(carHolder);
  shadow = buildShadow();
  scene.add(pivot, shadow);

  wordmark = document.querySelector('.landing-wordmark');
  eyebrow = document.querySelector('.landing-eyebrow');
  cue = document.querySelector('.landing-cue');
  caption = document.querySelector('.landing-caption');
  resolveLayer = document.getElementById('landing-resolve');

  resize();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', onPointerLeave, { passive: true });
  subscribe('theme', (theme) => { themeMix.target = theme === 'night' ? 1 : 0; });

  void loadHero();
}

/** Called after the shared renderer's own resize handler (main.js onResize order). */
export function onLandingResize() {
  resize();
}

/** Take the screen: native-resolution canvas, scroll read from the landing spacer. */
export function activateLanding({ atHub = false } = {}) {
  active = true;
  resize();
  renderer.setScissorTest(false);
  if (atHub) {
    window.scrollTo(0, document.documentElement.scrollHeight);
    progress = targetProgress = 1;
  } else {
    progress = targetProgress = readScroll();
  }
  lastStyle = {};
}

/** Give the screen back. The caller restores the Tour's resolution (sceneSetup.resizeScene). */
export function deactivateLanding() {
  active = false;
}

export function landingActive() {
  return active;
}

/** The hero has finished loading (its first frame can be drawn). */
export function heroLoaded() {
  return heroReady;
}

/** The visitor is moving through the transition: defer optional background GPU work. */
export function landingBusy() {
  return active && (performance.now() - lastInputAt < 320 || Math.abs(targetProgress - progress) > 0.002);
}

/** The DOM Hub field fully covers the canvas: nothing needs drawing behind it. */
export function landingCovered() {
  return active && progress >= 0.999;
}

export function landingProgress() {
  return progress;
}

/** How much of the screen the Hub field should cover now (0..1). */
export function landingHubPresence() {
  return active ? hubPresence : 0;
}

/** Review/test handle: place the transition at `p` with no damping. */
export function seekLanding(p) {
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  window.scrollTo(0, Math.min(1, Math.max(0, p)) * max);
  progress = targetProgress = readScroll();
}

/** Per-frame update. Runs only while the Landing owns the screen. */
export function updateLanding(dt) {
  if (!active) return;
  const safeDt = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));

  // Scroll progress: a short critically-damped follow. It smooths discrete wheel steps but has
  // no momentum of its own, so it settles within a few frames of the scroll position.
  const k = 1 - Math.exp(-TUNE.scrollDamping * safeDt);
  progress += (targetProgress - progress) * k;
  if (Math.abs(targetProgress - progress) < 1e-4) progress = targetProgress;

  const kp = 1 - Math.exp(-TUNE.pointerDamping * safeDt);
  pointer.x += (pointer.tx - pointer.x) * kp;
  pointer.y += (pointer.ty - pointer.y) * kp;

  if (themeMix.value !== themeMix.target) {
    const step = safeDt / THEME_SECONDS;
    themeMix.value = themeMix.target > themeMix.value
      ? Math.min(themeMix.target, themeMix.value + step)
      : Math.max(themeMix.target, themeMix.value - step);
  }
  const night = themeMix.value;

  const settle = smooth(...SEG.settle, progress);
  const typeOut = smooth(...SEG.type, progress);
  const push = smooth(...SEG.push, progress);
  const resolve = smooth(...SEG.resolve, progress);
  const hub = smooth(...SEG.hub, progress);
  const rest = 1 - settle;

  // ---- hero pose -----------------------------------------------------------
  // Idle turntable advances only at rest, so any scrolled frame is reproducible.
  idleYaw = wrapPi(idleYaw + THREE.MathUtils.degToRad(TUNE.idleDegPerSecond) * safeDt * rest * rest);
  // Turn to the hero angle by the shortest way, without ever flipping branch mid-turn.
  let delta = wrapPi(heroYaw - idleYaw);
  if (Math.abs(delta - lastYawDelta) > Math.PI) delta += delta < lastYawDelta ? 2 * Math.PI : -2 * Math.PI;
  lastYawDelta = delta;
  const turn = THREE.MathUtils.smootherstep(settle, 0, 1);
  pivot.rotation.y = idleYaw + delta * turn + pointer.x * TUNE.pointerYaw * rest;
  pivot.rotation.x = pointer.y * TUNE.pointerPitch * rest;
  const bob = Math.sin(performance.now() / 1000 * 2 * Math.PI / TUNE.bobSeconds) * TUNE.bobAmplitude;
  pivot.position.y = TUNE.floatHeight + bob * rest;

  // The hero fades in once loaded rather than popping.
  if (heroReady && heroAppear < 1) heroAppear = Math.min(1, heroAppear + safeDt / 0.9);
  carHolder.visible = heroReady;
  shadow.material.opacity = heroAppear * (0.55 - 0.25 * night) * (1 - push) * (0.85 + 0.15 * (1 - bob / TUNE.bobAmplitude * rest));

  // ---- camera ----------------------------------------------------------------
  pushCamera(_pos, _look, push);
  camera.position.copy(_pos);
  camera.lookAt(_look);
  const fov = THREE.MathUtils.lerp(TUNE.restFov, TUNE.closeFov, smooth(0.4, 1, push));
  if (camera.fov !== fov) camera.fov = fov;
  // Lens shift places the resting car centre-right without perspective skew.
  const shift = 1 - smooth(0, 0.45, push);
  const w = window.innerWidth, h = window.innerHeight;
  camera.setViewOffset(w, h, -(TUNE.restScreenX - 0.5) * w * shift, -(TUNE.restScreenY - 0.5) * h * shift, w, h);
  camera.updateProjectionMatrix();

  // ---- light -----------------------------------------------------------------
  // Pointer sways the reflections slightly at rest; the push sweeps a highlight across the fender.
  scene.environmentRotation.y = 0.35 + pointer.x * TUNE.pointerEnvYaw * rest + push * 1.1;
  scene.environmentIntensity = THREE.MathUtils.lerp(1.0, 0.3, night);
  keyLight.intensity = THREE.MathUtils.lerp(1.4, 0.45, night);
  fillLight.intensity = THREE.MathUtils.lerp(0.35, 0.06, night);
  rimLight.intensity = 2.6 * night;
  const lamps = smooth(...SEG.lamps, progress);
  for (const material of lampGlows) material.emissiveIntensity = 1 + lamps * 4;
  keyLight.position.set(-4 + pointer.x * 1.5 * rest, 9, -6);
  scene.background.copy(_field.copy(FIELD.day).lerp(FIELD.night, night));

  // ---- DOM ---------------------------------------------------------------------
  write(wordmark, 'wo', 'opacity', (1 - typeOut).toFixed(3));
  write(wordmark, 'wt', 'transform',
    `translate3d(${(-2.2 * typeOut).toFixed(3)}vw, ${(-1.2 * typeOut).toFixed(3)}vh, 0) scale(${(1 - 0.07 * typeOut).toFixed(4)})`);
  write(eyebrow, 'eo', 'opacity', (1 - smooth(...SEG.type, progress * 1.25)).toFixed(3));
  write(cue, 'co', 'opacity', (1 - smooth(0, 0.05, progress)).toFixed(3));
  write(caption, 'ca', 'opacity', (heroAppear * (1 - smooth(0.02, 0.14, progress))).toFixed(3));

  // Resolve toward the theme field while the camera keeps moving: a dissolve, biased so that in
  // Day the light arrives first at the lamp and in Night the navy arrives first at the edges.
  // Drawn in the DOM so its colour is exactly the Hub field's.
  _ndc.copy(_headlight).project(camera);
  const x = ((_ndc.x + 1) / 2) * 100;
  const y = ((1 - _ndc.y) / 2) * 100;
  const lead = smooth(0.25, 0.9, resolve);  // the leading region
  const lag = smooth(0.45, 1, resolve);     // the trailing region
  write(resolveLayer, 'rx', '--x', `${x.toFixed(2)}%`);
  write(resolveLayer, 'ry', '--y', `${y.toFixed(2)}%`);
  write(resolveLayer, 'rl', '--lead', `${(lead * 100).toFixed(2)}%`);
  write(resolveLayer, 'rg', '--lag', `${(lag * 100).toFixed(2)}%`);
  hubPresence = hub;

  // ---- experience edge -----------------------------------------------------------
  if (state.experience === 'landing' && progress >= SEG.hubEnter) hubHandler?.();
  else if (state.experience === 'hub' && progress < SEG.hubLeave) landingHandler?.();
}

/** Draw the Landing frame through the shared renderer, leaving the Tour's state as it was. */
export function renderLanding() {
  if (!active || landingCovered()) return;
  const exposure = renderer.toneMappingExposure;
  const resolve = smooth(...SEG.resolve, progress);
  // Day burns out to white the way light does (highlights first); Night sinks into the dark.
  const day = Math.exp(Math.log(7) * Math.pow(resolve, 1.5));
  const night = 0.88 * Math.exp(Math.log(0.25) * resolve);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(day, night, themeMix.value);
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  renderer.toneMappingExposure = exposure;
}

// Review handles (no behaviour of their own).
export const landingTuning = TUNE;
export const landingSegments = SEG;
