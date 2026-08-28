/**
 * Five complete lighting states and the long crossfade between them.
 *
 * Colour strings enter Three.js through its sRGB colour-management path and are
 * stored as linear values. Color.lerpColors therefore blends emitted light in
 * linear space rather than interpolating display-encoded hex bytes.
 */
import * as THREE from 'three';
import { state, set, subscribe } from '../core/state.js';
import {
  ambient,
  hemi,
  rimLight,
  setAtmosphere,
  sun,
  toneMappingExposure,
} from './sceneSetup.js';
import { setGroundTint, setSky } from './environment.js';

const TRANSITION_SECONDS = 2.2;
const SUN_DISTANCE = 104;

/**
 * Values describe illumination and atmosphere only. Surface albedos deliberately
 * remain owned by track.js and environment.js.
 */
export const PRESETS = Object.freeze({
  dawn: Object.freeze({
    sun: Object.freeze({ color: '#FFD3A1', intensity: 2.05, direction: Object.freeze([-0.78, 0.23, -0.58]) }),
    hemisphere: Object.freeze({ sky: '#AAB9CA', ground: '#806B55', intensity: 1.02 }),
    ambient: Object.freeze({ color: '#FFE5CC', intensity: 0.44 }),
    rim: Object.freeze({ color: '#C9D7E8', intensity: 0.46 }),
    fog: Object.freeze({ color: '#C9A88C', near: 108, far: 565 }),
    sky: Object.freeze({ horizon: '#D9AC88', zenith: '#71839B', sunColor: '#FFD09B', sunIntensity: 0.66 }),
    exposure: 1.18,
    grassTint: Object.freeze({ color: '#F1DFC5', amount: 0.09 }),
  }),

  morning: Object.freeze({
    sun: Object.freeze({ color: '#FFE3BC', intensity: 2.82, direction: Object.freeze([-0.62, 0.53, -0.57]) }),
    hemisphere: Object.freeze({ sky: '#C3D4DF', ground: '#768065', intensity: 1.24 }),
    ambient: Object.freeze({ color: '#FFF0DC', intensity: 0.52 }),
    rim: Object.freeze({ color: '#D9E6EE', intensity: 0.36 }),
    fog: Object.freeze({ color: '#C6C3B2', near: 132, far: 625 }),
    sky: Object.freeze({ horizon: '#D9CEB2', zenith: '#7E9CAF', sunColor: '#FFE4B8', sunIntensity: 0.48 }),
    exposure: 1.28,
    grassTint: Object.freeze({ color: '#E0EED2', amount: 0.08 }),
  }),

  // The default is intentionally confident daylight. These levels are above the
  // sceneSetup fallback so charcoal asphalt and the grass vertex colours stay clear.
  afternoon: Object.freeze({
    sun: Object.freeze({ color: '#FFF0D0', intensity: 3.45, direction: Object.freeze([-0.35, 0.87, -0.35]) }),
    hemisphere: Object.freeze({ sky: '#CDDFEA', ground: '#7E8969', intensity: 1.48 }),
    ambient: Object.freeze({ color: '#FFF4E2', intensity: 0.64 }),
    rim: Object.freeze({ color: '#E3EDF2', intensity: 0.30 }),
    fog: Object.freeze({ color: '#C9C6B5', near: 155, far: 690 }),
    sky: Object.freeze({ horizon: '#D9D1B9', zenith: '#80A1B5', sunColor: '#FFF0C9', sunIntensity: 0.38 }),
    exposure: 1.36,
    grassTint: Object.freeze({ color: '#DDF0D4', amount: 0.07 }),
  }),

  dusk: Object.freeze({
    sun: Object.freeze({ color: '#FFB17E', intensity: 1.78, direction: Object.freeze([0.79, 0.20, -0.58]) }),
    hemisphere: Object.freeze({ sky: '#8F94AC', ground: '#6F554A', intensity: 0.94 }),
    ambient: Object.freeze({ color: '#E8C4B7', intensity: 0.42 }),
    rim: Object.freeze({ color: '#AEBEDA', intensity: 0.55 }),
    fog: Object.freeze({ color: '#A98278', near: 102, far: 540 }),
    sky: Object.freeze({ horizon: '#C9816D', zenith: '#555E7D', sunColor: '#FFAA73', sunIntensity: 0.72 }),
    exposure: 1.20,
    grassTint: Object.freeze({ color: '#E8CCBD', amount: 0.10 }),
  }),

  // Night remains deliberately legible: a cool moon key, generous sky fill and
  // restrained exposure keep the route, curbs and collectibles navigable.
  night: Object.freeze({
    sun: Object.freeze({ color: '#B8CDF4', intensity: 0.82, direction: Object.freeze([0.48, 0.58, 0.66]) }),
    hemisphere: Object.freeze({ sky: '#657C9B', ground: '#4C5360', intensity: 0.88 }),
    ambient: Object.freeze({ color: '#9DAFD0', intensity: 0.48 }),
    rim: Object.freeze({ color: '#CADBFF', intensity: 0.76 }),
    fog: Object.freeze({ color: '#45546A', near: 92, far: 510 }),
    sky: Object.freeze({ horizon: '#46566D', zenith: '#17243A', sunColor: '#BFD5FF', sunIntensity: 0.24 }),
    exposure: 1.13,
    grassTint: Object.freeze({ color: '#C7D7DE', amount: 0.08 }),
  }),
});

function makeFrame(preset) {
  return {
    sunColor: new THREE.Color(preset.sun.color),
    sunIntensity: preset.sun.intensity,
    sunDirection: new THREE.Vector3(...preset.sun.direction).normalize(),
    hemiSky: new THREE.Color(preset.hemisphere.sky),
    hemiGround: new THREE.Color(preset.hemisphere.ground),
    hemiIntensity: preset.hemisphere.intensity,
    ambientColor: new THREE.Color(preset.ambient.color),
    ambientIntensity: preset.ambient.intensity,
    rimColor: new THREE.Color(preset.rim.color),
    rimIntensity: preset.rim.intensity,
    fogColor: new THREE.Color(preset.fog.color),
    fogNear: preset.fog.near,
    fogFar: preset.fog.far,
    skyHorizon: new THREE.Color(preset.sky.horizon),
    skyZenith: new THREE.Color(preset.sky.zenith),
    skySunColor: new THREE.Color(preset.sky.sunColor),
    skySunIntensity: preset.sky.sunIntensity,
    exposure: preset.exposure,
    grassColor: new THREE.Color(preset.grassTint.color),
    grassAmount: preset.grassTint.amount,
  };
}

function copyFrame(source, target = makeFrame(PRESETS.afternoon)) {
  target.sunColor.copy(source.sunColor);
  target.sunIntensity = source.sunIntensity;
  target.sunDirection.copy(source.sunDirection);
  target.hemiSky.copy(source.hemiSky);
  target.hemiGround.copy(source.hemiGround);
  target.hemiIntensity = source.hemiIntensity;
  target.ambientColor.copy(source.ambientColor);
  target.ambientIntensity = source.ambientIntensity;
  target.rimColor.copy(source.rimColor);
  target.rimIntensity = source.rimIntensity;
  target.fogColor.copy(source.fogColor);
  target.fogNear = source.fogNear;
  target.fogFar = source.fogFar;
  target.skyHorizon.copy(source.skyHorizon);
  target.skyZenith.copy(source.skyZenith);
  target.skySunColor.copy(source.skySunColor);
  target.skySunIntensity = source.skySunIntensity;
  target.exposure = source.exposure;
  target.grassColor.copy(source.grassColor);
  target.grassAmount = source.grassAmount;
  return target;
}

function blendFrame(from, to, amount, out) {
  out.sunColor.lerpColors(from.sunColor, to.sunColor, amount);
  out.sunIntensity = THREE.MathUtils.lerp(from.sunIntensity, to.sunIntensity, amount);
  out.sunDirection.lerpVectors(from.sunDirection, to.sunDirection, amount).normalize();
  out.hemiSky.lerpColors(from.hemiSky, to.hemiSky, amount);
  out.hemiGround.lerpColors(from.hemiGround, to.hemiGround, amount);
  out.hemiIntensity = THREE.MathUtils.lerp(from.hemiIntensity, to.hemiIntensity, amount);
  out.ambientColor.lerpColors(from.ambientColor, to.ambientColor, amount);
  out.ambientIntensity = THREE.MathUtils.lerp(from.ambientIntensity, to.ambientIntensity, amount);
  out.rimColor.lerpColors(from.rimColor, to.rimColor, amount);
  out.rimIntensity = THREE.MathUtils.lerp(from.rimIntensity, to.rimIntensity, amount);
  out.fogColor.lerpColors(from.fogColor, to.fogColor, amount);
  out.fogNear = THREE.MathUtils.lerp(from.fogNear, to.fogNear, amount);
  out.fogFar = THREE.MathUtils.lerp(from.fogFar, to.fogFar, amount);
  out.skyHorizon.lerpColors(from.skyHorizon, to.skyHorizon, amount);
  out.skyZenith.lerpColors(from.skyZenith, to.skyZenith, amount);
  out.skySunColor.lerpColors(from.skySunColor, to.skySunColor, amount);
  out.skySunIntensity = THREE.MathUtils.lerp(from.skySunIntensity, to.skySunIntensity, amount);
  out.exposure = THREE.MathUtils.lerp(from.exposure, to.exposure, amount);
  out.grassColor.lerpColors(from.grassColor, to.grassColor, amount);
  out.grassAmount = THREE.MathUtils.lerp(from.grassAmount, to.grassAmount, amount);
}

// Cubic-bezier(.22, .61, .36, 1), matching --ease. Solving x gives stable visual
// timing rather than treating the Bezier parameter itself as elapsed time.
function transitionEase(x) {
  const sample = (t, a, b) => {
    const inv = 1 - t;
    return 3 * inv * inv * t * a + 3 * inv * t * t * b + t * t * t;
  };
  const derivative = (t, a, b) => (
    3 * (1 - t) * (1 - t) * a
    + 6 * (1 - t) * t * (b - a)
    + 3 * t * t * (1 - b)
  );

  let t = THREE.MathUtils.clamp(x, 0, 1);
  for (let i = 0; i < 5; i += 1) {
    const slope = derivative(t, 0.22, 0.36);
    if (Math.abs(slope) < 1e-5) break;
    t = THREE.MathUtils.clamp(t - (sample(t, 0.22, 0.36) - x) / slope, 0, 1);
  }
  return sample(t, 0.61, 1);
}

let current = makeFrame(PRESETS.afternoon);
let transitionFrom = copyFrame(current);
let transitionTo = copyFrame(current);
let transitionElapsed = TRANSITION_SECONDS;
let initialized = false;
let unsubscribe = null;
let instantOverride = null;
const sunAnchor = new THREE.Vector3();

function writeFrame(frame) {
  if (sun) {
    sun.color.copy(frame.sunColor);
    sun.intensity = frame.sunIntensity;

    // DirectionalLight direction is target -> light. Keeping a constant radius
    // preserves useful shadow-camera precision at every elevation.
    if (sun.target?.isObject3D) sun.target.getWorldPosition(sunAnchor);
    else sunAnchor.set(0, 0, 0);
    sun.position.copy(sunAnchor).addScaledVector(frame.sunDirection, SUN_DISTANCE);
  }

  if (hemi) {
    hemi.color.copy(frame.hemiSky);
    hemi.groundColor.copy(frame.hemiGround);
    hemi.intensity = frame.hemiIntensity;
  }
  if (ambient) {
    ambient.color.copy(frame.ambientColor);
    ambient.intensity = frame.ambientIntensity;
  }
  if (rimLight) {
    rimLight.color.copy(frame.rimColor);
    rimLight.intensity = frame.rimIntensity;
  }

  setAtmosphere({
    fogColor: frame.fogColor,
    fogNear: frame.fogNear,
    fogFar: frame.fogFar,
    background: frame.skyHorizon,
  });
  setSky({
    uHorizon: frame.skyHorizon,
    uZenith: frame.skyZenith,
    uSunDir: frame.sunDirection,
    uSunColor: frame.skySunColor,
    uSunIntensity: frame.skySunIntensity,
  });
  toneMappingExposure.value = frame.exposure;
  setGroundTint(frame.grassColor, frame.grassAmount);
}

function beginTransition(key, instant = false) {
  const preset = PRESETS[key];
  if (!preset) return;

  copyFrame(current, transitionFrom);
  copyFrame(makeFrame(preset), transitionTo);
  transitionElapsed = instant ? TRANSITION_SECONDS : 0;

  if (instant) {
    copyFrame(transitionTo, current);
    writeFrame(current);
  }
}

/** Set central state and begin (or immediately apply) the corresponding lighting. */
export function applyTimeOfDay(key, { instant = false } = {}) {
  if (!Object.hasOwn(PRESETS, key)) {
    throw new RangeError(`Unknown time-of-day preset: ${key}`);
  }

  if (state.timeOfDay !== key) {
    instantOverride = Boolean(instant);
    set('timeOfDay', key);
    instantOverride = null;
  } else {
    beginTransition(key, Boolean(instant));
  }
}

/** Subscribe once and establish the default without an initial dark-to-light sweep. */
export function initTimeOfDay() {
  if (initialized) return;
  initialized = true;

  const initialKey = Object.hasOwn(PRESETS, state.timeOfDay)
    ? state.timeOfDay
    : 'afternoon';
  current = makeFrame(PRESETS[initialKey]);
  transitionFrom = copyFrame(current);
  transitionTo = copyFrame(current);
  transitionElapsed = TRANSITION_SECONDS;
  writeFrame(current);

  unsubscribe = subscribe('timeOfDay', (key) => {
    if (!Object.hasOwn(PRESETS, key)) return;
    beginTransition(key, instantOverride === true);
  });
}

/** Called by main.js's single frame loop. */
export function update(dt) {
  if (!initialized) return;

  if (transitionElapsed < TRANSITION_SECONDS) {
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    transitionElapsed = Math.min(TRANSITION_SECONDS, transitionElapsed + safeDt);
    const progress = transitionElapsed / TRANSITION_SECONDS;
    blendFrame(transitionFrom, transitionTo, transitionEase(progress), current);
  }

  // Re-apply even after a transition completes. The light target follows the car,
  // so its directional offset must follow too; all other writes are allocation-free.
  writeFrame(current);
}

// Kept private in normal operation, but retaining the unsubscribe reference makes
// accidental duplicate subscriptions impossible during hot-module replacement.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribe?.();
    unsubscribe = null;
    initialized = false;
  });
}
