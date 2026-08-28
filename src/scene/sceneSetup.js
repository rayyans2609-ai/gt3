/**
 * Renderer, race camera, atmosphere, lighting and restrained speed feedback.
 *
 * This module owns the race camera's projection, but deliberately does not position
 * it. carRig.js attaches and frames it. main.js owns the only animation loop and
 * calls updateScene() and render().
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { state } from '../core/state.js';
import { onResize } from '../main.js';

const BASE_FOV = 52;
const FOV_RANGE = 7;
const FOV_DAMPING = 0.06;
const FOV_PROJECTION_EPSILON = 0.01;
const DEBUG = location.hash === '#debug';
const SUN_OFFSET = new THREE.Vector3(46, 82, 34);
const _sunTargetPosition = new THREE.Vector3();

// Intel UHD 617, 1280x800 CSS @ DPR 2: GPU cost scales nearly linearly with pixels:
// DPR 2.00: 4.1 MPix / 40.4 ms; 1.50: 2.3 / 25.3; 1.25: 1.6 / 19.1; 1.00: 1.0 / 12.9.
export const ADAPTIVE_RES = {
  high: Math.min(window.devicePixelRatio || 1, 2), // at rest: full sharpness
  low: 1.0, // in motion: smooth
  enterLowAt: 0.02, // state.speed01 above this => motion
  returnHighBelow: 0.008,
  settleMs: 420, // how long motion must be absent before going sharp again
  minSwitchMs: 250, // floor between switches; target realloc is not free
};

// The sun tracks the car, so a tight shadow volume is sufficient. Measured with GPU
// timer queries, shadows are ~15% of frame cost (6.7 of 43 ms) and this tightening is
// worth ~0.7 ms; the volume shrank 120->52 units while the map only halved, so texel
// density actually rose (17 -> ~20/unit). Adjust mapSize/extent if quality needs work.
// NOTE: an earlier wall-clock benchmark blamed shadows for 49%. That was CPU-contention
// noise, not signal. Resolution is the real cost centre -- see ADAPTIVE_RES.
export const SHADOW_TUNE = {
  mapSize: 1024,
  extent: 26,
  near: 0.5,
  far: 180,
  normalBias: 0.02,
};

const atmosphere = {
  fogColor: new THREE.Color(0xb8ad94),
  fogNear: 105,
  fogFar: 570,
  background: new THREE.Color(0xc1b596),
};

export let renderer;
export let scene;
export let camera;
export let composer;

export let hemi;
export let sun;
export let ambient;
export let rimLight;

let motionBlurPass;
let premiumPass;
let followedSunTarget;
let lastProjectedFov = BASE_FOV;
let elapsedTime = 0;
let initialized = false;
let appliedResolution;
let activeResolutionLevel = 'high';
let stillTimeMs = 0;
let timeSinceResolutionSwitchMs = Infinity;

/**
 * Mutable exposure handle for timeOfDay.js. Assign to `.value` to update the
 * renderer immediately, including before initScene() has run.
 */
export const toneMappingExposure = {
  _value: 1,

  get value() {
    return renderer ? renderer.toneMappingExposure : this._value;
  },

  set value(nextValue) {
    if (!Number.isFinite(nextValue)) return;
    this._value = Math.max(0, nextValue);
    if (renderer) renderer.toneMappingExposure = this._value;
  },
};

const RADIAL_MOTION_BLUR_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uFocalPoint: { value: new THREE.Vector2(0.5, 0.42) },
    uStrength: { value: 0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uFocalPoint;
    uniform float uStrength;
    varying vec2 vUv;

    void main() {
      // The stationary path is exactly one untouched texture sample. Besides being
      // cheaper, this makes strength == 0 a provable mathematical no-op.
      if (uStrength <= 0.0) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      vec2 blurVector = (uFocalPoint - vUv) * uStrength * 0.055;
      vec4 color = vec4(0.0);

      for (int i = 0; i < 8; i++) {
        float tap = float(i) / 7.0;
        color += texture2D(tDiffuse, vUv + blurVector * tap);
      }

      gl_FragColor = color * 0.125;
    }
  `,
};

const PREMIUM_WASH_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrainAmount: { value: 0.018 },
    uVignetteAmount: { value: 0.1 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrainAmount;
    uniform float uVignetteAmount;
    varying vec2 vUv;

    float random(vec2 point) {
      return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 fromCenter = (vUv - 0.5) * vec2(0.92, 1.0);
      float vignette = smoothstep(0.36, 0.72, length(fromCenter));
      float grain = random(gl_FragCoord.xy + vec2(uTime * 47.0, uTime * 29.0)) - 0.5;

      color.rgb *= 1.0 - vignette * uVignetteAmount;
      color.rgb += grain * uGrainAmount;
      gl_FragColor = color;
    }
  `,
};

function clampSpeed(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function applyResolution(dpr) {
  if (!renderer || !composer || dpr === appliedResolution) return false;

  renderer.setPixelRatio(dpr);
  composer.setPixelRatio(dpr);
  composer.setSize(window.innerWidth, window.innerHeight);
  appliedResolution = dpr;
  return true;
}

function resizeScene(width, height) {
  if (!renderer || !camera || !composer) return;

  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  ADAPTIVE_RES.high = Math.min(window.devicePixelRatio || 1, 2);
  const pixelRatio = activeResolutionLevel === 'low'
    ? ADAPTIVE_RES.low
    : ADAPTIVE_RES.high;

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(safeWidth, safeHeight, false);

  camera.aspect = safeWidth / safeHeight;
  camera.updateProjectionMatrix();
  lastProjectedFov = camera.fov;

  composer.setPixelRatio(pixelRatio);
  composer.setSize(safeWidth, safeHeight);
  appliedResolution = pixelRatio;
}

function createLightingRig() {
  hemi = new THREE.HemisphereLight(0xbac9d6, 0x6d6047, 1.05);

  ambient = new THREE.AmbientLight(0xfff1dc, 0.34);

  sun = new THREE.DirectionalLight(0xffdfb2, 2.35);
  sun.position.copy(SUN_OFFSET);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_TUNE.mapSize, SHADOW_TUNE.mapSize);
  sun.shadow.camera.left = -SHADOW_TUNE.extent;
  sun.shadow.camera.right = SHADOW_TUNE.extent;
  sun.shadow.camera.top = SHADOW_TUNE.extent;
  sun.shadow.camera.bottom = -SHADOW_TUNE.extent;
  sun.shadow.camera.near = SHADOW_TUNE.near;
  sun.shadow.camera.far = SHADOW_TUNE.far;
  sun.shadow.normalBias = SHADOW_TUNE.normalBias;

  rimLight = new THREE.DirectionalLight(0xd8e1e6, 0.32);
  rimLight.position.set(-32, 24, 48);

  scene.add(hemi, ambient, sun, sun.target, rimLight);
}

function createPostProcessing() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  motionBlurPass = new ShaderPass(RADIAL_MOTION_BLUR_SHADER);
  composer.addPass(motionBlurPass);

  premiumPass = new ShaderPass(PREMIUM_WASH_SHADER);
  composer.addPass(premiumPass);
}

/**
 * Update the race atmosphere. Partial updates are supported so time-of-day blends
 * can independently animate color and fog distances.
 */
export function setAtmosphere({ fogColor, fogNear, fogFar, background } = {}) {
  if (fogColor !== undefined) atmosphere.fogColor.set(fogColor);
  if (Number.isFinite(fogNear)) atmosphere.fogNear = Math.max(0, fogNear);
  if (Number.isFinite(fogFar)) atmosphere.fogFar = Math.max(0, fogFar);
  if (background !== undefined) atmosphere.background.set(background);

  if (!scene) return;

  scene.fog.color.copy(atmosphere.fogColor);
  scene.fog.near = atmosphere.fogNear;
  scene.fog.far = atmosphere.fogFar;

  if (scene.background?.isColor) scene.background.copy(atmosphere.background);
  else scene.background = atmosphere.background.clone();
}

/**
 * Centre the sun's shadow frustum on a moving object while keeping the afternoon
 * light direction fixed in world space. The target itself remains owned by carRig.
 */
export function attachSunTarget(object3D) {
  if (!object3D?.isObject3D) {
    throw new TypeError('attachSunTarget expects a THREE.Object3D');
  }
  if (!sun) {
    throw new Error('initScene() must be called before attachSunTarget()');
  }

  const previousTarget = sun.target;
  followedSunTarget = object3D;
  sun.target = object3D;

  // Remove only the disposable default target created by DirectionalLight. A target
  // supplied by another module is never removed from its parent.
  if (previousTarget !== object3D && previousTarget.parent === scene) {
    scene.remove(previousTarget);
  }

  object3D.getWorldPosition(_sunTargetPosition);
  sun.position.copy(_sunTargetPosition).add(SUN_OFFSET);
}

/** Ease the race camera's projection toward the current scroll-speed target. */
export function updateCameraFov(dt) {
  if (!camera) return;

  const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const targetFov = BASE_FOV + clampSpeed(state.speed01) * FOV_RANGE;
  const damping = 1 - Math.pow(1 - FOV_DAMPING, safeDt * 60);

  camera.fov += (targetFov - camera.fov) * damping;

  if (Math.abs(camera.fov - lastProjectedFov) > FOV_PROJECTION_EPSILON) {
    camera.updateProjectionMatrix();
    lastProjectedFov = camera.fov;
  }
}

/** Per-frame scene feedback. main.js should register this function once. */
export function updateScene(dt) {
  updateCameraFov(dt);

  const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const speed = clampSpeed(state.speed01);
  elapsedTime = (elapsedTime + safeDt) % 1000;
  timeSinceResolutionSwitchMs += safeDt * 1000;

  let requestedResolution = appliedResolution ?? ADAPTIVE_RES.high;
  if (state.mode !== 'race' || state.scrollLocked) {
    requestedResolution = ADAPTIVE_RES.high;
    stillTimeMs = 0;
  } else if (speed > ADAPTIVE_RES.enterLowAt) {
    requestedResolution = ADAPTIVE_RES.low;
    stillTimeMs = 0;
  } else if (speed < ADAPTIVE_RES.returnHighBelow) {
    stillTimeMs += safeDt * 1000;
    if (stillTimeMs >= ADAPTIVE_RES.settleMs) {
      requestedResolution = ADAPTIVE_RES.high;
    }
  }

  if (
    requestedResolution !== appliedResolution
    && timeSinceResolutionSwitchMs >= ADAPTIVE_RES.minSwitchMs
    && applyResolution(requestedResolution)
  ) {
    activeResolutionLevel = requestedResolution === ADAPTIVE_RES.low ? 'low' : 'high';
    timeSinceResolutionSwitchMs = 0;
  }

  if (motionBlurPass) motionBlurPass.uniforms.uStrength.value = speed * 0.42;
  if (premiumPass) premiumPass.uniforms.uTime.value = elapsedTime;

  if (sun && followedSunTarget) {
    followedSunTarget.getWorldPosition(_sunTargetPosition);
    sun.position.copy(_sunTargetPosition).add(SUN_OFFSET);
  }
}

/** Render the race scene through the three-pass post-processing chain. */
export function render(dt) {
  if (!composer) return;
  composer.render(dt);
}

/** Create the singleton race renderer foundation. */
export function initScene() {
  if (initialized) return { renderer, scene, camera, composer, render };

  const canvas = document.getElementById('scene');
  if (!canvas) throw new Error('Expected an existing <canvas id="scene">');

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = toneMappingExposure._value;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = atmosphere.background.clone();
  scene.fog = new THREE.Fog(
    atmosphere.fogColor,
    atmosphere.fogNear,
    atmosphere.fogFar,
  );

  // Position and rotation intentionally remain at THREE's defaults. carRig owns both.
  camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.5, 3000);
  lastProjectedFov = camera.fov;

  createLightingRig();
  createPostProcessing();
  resizeScene(window.innerWidth, window.innerHeight);
  onResize(resizeScene);

  if (DEBUG) {
    scene.add(new THREE.AxesHelper(25));
  }
  // TEMPORARY (perf pass): runtime handles so the profiler can A/B cost centres.
  window.__gt3 = { scene, camera, renderer, composer,
    passes: { motionBlur: motionBlurPass, wash: premiumPass }, resizeScene,
    probe: () => ({ mode: state.mode, locked: state.scrollLocked, speed01: state.speed01,
      progress: state.progress, applied: appliedResolution, level: activeResolutionLevel,
      still: stillTimeMs, sinceSwitch: timeSinceResolutionSwitchMs,
      canvasW: renderer.domElement.width, ratio: renderer.getPixelRatio() }) };

  initialized = true;
  return { renderer, scene, camera, composer, render };
}
