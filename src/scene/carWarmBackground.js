/**
 * Review-only unlocked prewarm policies (p3u W5). NOT the product default: `full` is, and the
 * measurements in docs/review/p3u/stage2/W5/REPORT.md explain why `selective`/`staged` were not
 * adopted (they create programs and geometry after readiness, with single steps of 60-130 ms).
 *
 * `?prewarm=` (unlocked only; locked ignores it and keeps the accepted full warm-up):
 *   full       every car is GPU-ready before input unlocks (the accepted lifecycle, scheduled
 *              ahead of the draws so it takes less wall time);
 *   selective  only the cars around the start position are ready at unlock; each later car is
 *              prepared while the drive is a segment or two away from its gate;
 *   staged     the same start window, then every remaining car, nearest first.
 *
 * Preparation after unlock never touches the visible frame. Textures are uploaded with
 * initTexture, programs compile through compileAsync (parallel shader compile), and the first
 * draws that create geometry buffers and pipeline state render into a tiny offscreen target
 * with the live scene's lights, fog and shadow settings. One small step per calm frame:
 * never while a swap is running, never within a gate's approach distance.
 */
import { UNLOCKED } from '../core/renderProfile.js';
import { CARS } from '../data/cars.js';
import { getCarModel } from './cars.js';
import { carMount } from './carRig.js';
import { scene, renderer, camera, composer } from './sceneSetup.js';
import { beginWarmFade, endWarmFade } from './morph.js';

const reviewParams = new URLSearchParams(globalThis.location?.search || '');
const requested = UNLOCKED ? reviewParams.get('prewarm') : null;
export const PREWARM_MODES = ['full', 'selective', 'staged'];
export const PREWARM_MODE = PREWARM_MODES.includes(requested) ? requested : 'full';

const LOOKAHEAD = 2;                 // selective: cars prepared ahead of the active one
const MESHES_PER_DRAW = 8;           // first-use geometry/pipeline cost per live frame
const TEXTURES_PER_TICK = 2;
const FOREGROUND_RADIUS = 1;         // start window: previous, current and next car

/** Cars warmed behind the start screen: car 0 (Replay target) and the window around each start. */
export function foregroundIndices(...centres) {
  const set = new Set([0]);
  for (const centre of centres) {
    for (let offset = -FOREGROUND_RADIUS; offset <= FOREGROUND_RADIUS; offset++) {
      const index = centre + offset;
      if (index >= 0 && index < CARS.length) set.add(index);
    }
  }
  return [...set].sort((a, b) => a - b);
}

function inspect(model) {
  const meshes = [];
  const textures = [];
  const seen = new Set();
  model.traverse((object) => {
    if (!object.isMesh) return;
    meshes.push(object);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material || {})) {
        if (value?.isTexture && !value.isRenderTargetTexture && !seen.has(value)) {
          seen.add(value);
          textures.push(value);
        }
      }
    }
  });
  return { meshes, textures };
}

export function createBackgroundWarmup(readyIndices, { getActive }) {
  const ready = new Set(readyIndices);
  const tasks = new Map();
  const stats = { ticks: 0, draws: [], compileMs: 0, textures: 0, carsReady: [], skipped: 0 };
  let target = null;
  let active = null;

  function targetFor() {
    // Same formats, sample count and depth buffer as the scene pass, so program and pipeline
    // keys match the live draw; only the extent differs.
    if (!target) {
      target = composer.readBuffer.clone();
      target.setSize(16, 16);
    }
    return target;
  }

  function candidates() {
    const centre = getActive();
    return CARS.map((_, index) => index)
      .filter(index => !ready.has(index) && (PREWARM_MODE === 'staged' ||
        (index >= centre - FOREGROUND_RADIUS && index <= centre + LOOKAHEAD)))
      .sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre) || b - a);
  }

  function taskFor(index) {
    if (!tasks.has(index)) {
      const model = getCarModel(index);
      tasks.set(index, { index, model, ...inspect(model), phase: 'textures', at: 0, fade: false,
        jobs: null, failed: false });
    }
    return tasks.get(index);
  }

  function compile(task) {
    const jobs = { normal: { ready: false }, fade: { ready: false } };
    const started = performance.now();
    const prior = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace();
    const mip = renderer.getActiveMipmapLevel();
    try {
      renderer.setRenderTarget(composer.readBuffer);
      for (const [name, fade] of [['normal', false], ['fade', true]]) {
        if (fade) beginWarmFade(task.model, 'crossfade');
        try {
          Promise.resolve(renderer.compileAsync(task.model, camera, scene)).then(
            () => { jobs[name].ready = true; },
            () => { task.failed = true; jobs[name].ready = true; });
        } finally { if (fade) endWarmFade(task.model); }
      }
    } finally { renderer.setRenderTarget(prior, face, mip); }
    stats.compileMs += performance.now() - started;
    return jobs;
  }

  /** Draw `models` (restricted to `batch` meshes, in fade materials when asked) offscreen. */
  function drawOffscreen(models, batch, fade) {
    const children = carMount.children.slice();
    const visibility = [];
    const culling = [];
    try {
      carMount.clear();
      carMount.add(...models);
      for (const model of models) {
        const wanted = batch ? new Set(batch) : null;
        model.traverse((object) => {
          if (!object.isMesh) return;
          visibility.push([object, object.visible]);
          culling.push([object, object.frustumCulled]);
          if (wanted) object.visible = wanted.has(object);
          object.frustumCulled = false;
        });
        if (fade) beginWarmFade(model, 'crossfade');
      }
      const prior = renderer.getRenderTarget();
      renderer.setRenderTarget(targetFor());
      try { renderer.render(scene, camera); } finally { renderer.setRenderTarget(prior); }
    } finally {
      if (fade) for (const model of models) endWarmFade(model);
      for (const [object, visible] of visibility) object.visible = visible;
      for (const [object, frustumCulled] of culling) object.frustumCulled = frustumCulled;
      carMount.clear();
      carMount.add(...children);
    }
  }

  function pairWith(task) {
    for (const other of [task.index - 1, task.index + 1]) {
      if (ready.has(other)) drawOffscreen([getCarModel(other), task.model], null, true);
    }
  }

  /** One bounded step on the nearest unready car. Returns true when a draw was issued. */
  function step(task) {
    if (task.phase === 'textures') {
      for (let n = 0; n < TEXTURES_PER_TICK && task.at < task.textures.length; n++) {
        renderer.initTexture(task.textures[task.at++]);
        stats.textures++;
      }
      if (task.at >= task.textures.length) task.phase = 'compile';
      return false;
    }
    if (task.phase === 'compile') {
      task.jobs ??= compile(task);
      if (task.jobs.normal.ready && task.jobs.fade.ready) { task.phase = 'draw'; task.at = 0; }
      return false;
    }
    const batch = task.meshes.slice(task.at, task.at + MESHES_PER_DRAW);
    const started = performance.now();
    drawOffscreen([task.model], batch, task.fade);
    stats.draws.push({ car: task.index, fade: task.fade, ms: performance.now() - started });
    task.at += MESHES_PER_DRAW;
    if (task.at >= task.meshes.length) {
      if (!task.fade) { task.fade = true; task.at = 0; }
      else {
        ready.add(task.index);
        stats.carsReady.push({ car: task.index, at: performance.now() });
        pairWith(task);
      }
    }
    return true;
  }

  return {
    stats,
    get ready() { return ready; },
    get busy() { return candidates().length > 0; },
    /** Call once per calm frame after the real render. */
    tick() {
      if (!active || ready.has(active.index)) active = null;
      if (!active) {
        const [next] = candidates();
        if (next === undefined) return false;
        active = taskFor(next);
      }
      stats.ticks++;
      try { return step(active); } catch (error) {
        console.warn('[warmup] background preparation failed; car will warm on first use.', error);
        ready.add(active.index);
        active = null;
        stats.skipped++;
        return false;
      }
    },
  };
}
