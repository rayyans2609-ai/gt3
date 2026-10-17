/** Exercise car render states through the Tour renderer before drive unlock. */
import * as THREE from 'three';
import { SETTINGS, UNLOCKED } from '../core/renderProfile.js';
import { prepareCarEnvironment } from './carEnvironment.js';
import { CARS } from '../data/cars.js';
import { getCarModel } from './cars.js';
import { carMount, rig } from './carRig.js';
import { render, scene, renderer, camera, composer } from './sceneSetup.js';
import { beginWarmFade } from './morph.js';
import { warmCheckpointResponse } from './checkpoints.js';

const MESHES_PER_FRAME = 12;
const TEXTURES_PER_FRAME = 4;
// Wall-time budget per animation frame for the warm-up driver. Solo measurement
// (startup-run3, H 4dfc2c9): one step() per rAF left ~6.5 s of an 18 s warm-up as
// idle rAF gaps (268 steps); running steps back-to-back until this budget is spent
// recovers that without changing the draw set. 12 ms keeps frames near 60 fps when
// draws are cheap; a single heavy first-use draw may still overshoot (always >= 1 step).
export const WARMUP_FRAME_BUDGET_MS = 12;
// Unlocked only. The locked scheduler above is the accepted baseline and stays as it is.
// Warm-up runs behind the start screen, so a longer per-frame budget costs nothing the owner
// can see; shader compiles and texture uploads run ahead of the draws instead of one car at a
// time (M4, p3u W5: ~1.6 s of a 2.34 s warm-up was waiting between steps, only ~0.76 s was draw work).
export const UNLOCKED_FRAME_BUDGET_MS = 24;
// Unlocked draws render the scene pass only (same lights, fog, shadow pass and render target
// as the live RenderPass); the post chain's programs are still created by the one composer
// control draw at the end. `?warmdraw=composer` restores the full chain for every draw.
// Draws must keep MESHES_PER_FRAME: larger batches leave one car program uncreated (M4: 115, not 116).
const SCENE_ONLY_DRAWS = UNLOCKED &&
  new URLSearchParams(globalThis.location?.search || '').get('warmdraw') !== 'composer';
const COMPILE_AHEAD_JOBS = 8; // normal+fade programs of the next four cars
const TEXTURE_AHEAD_CARS = 3;

export function createCarWarmup(onProgress, onStep, { throwAtDraw = -1, indices = null } = {}) {
  const starter = carMount.children[0];
  if (!starter) throw new Error('[warmup] No visible starter car');
  if (SETTINGS.carEnvironment) prepareCarEnvironment(renderer, CARS.map((_, index) => getCarModel(index)));
  const originalFog = scene.fog;
  const cars = CARS.map((_, index) => {
    const model = getCarModel(index);
    const meshes = [];
    const snapshot = [];
    let allVisible = true;
    model.traverse((object) => {
      if (!object.visible) allVisible = false;
      if (!object.isMesh) return;
      snapshot.push({ object, visible: object.visible,
        frustumCulled: object.frustumCulled, material: object.material });
      if (object.visible) meshes.push(object);
    });
    return { model, meshes, snapshot, allVisible };
  });
  // The cars this warm-up prepares and draws. The roster default is all ten; a subset (unlocked
  // staged prewarm) still hides and restores every car, so nothing outside it is disturbed.
  const warm = indices ? indices.map(index => cars[index]) : cars;
  let mappedTexture = null;
  for (const car of cars) {
    for (const { material } of car.snapshot) {
      const materials = Array.isArray(material) ? material : [material];
      mappedTexture = materials.find(mat => mat?.map)?.map ?? null;
      if (mappedTexture) break;
    }
    if (mappedTexture) break;
  }
  const probeGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const shadowProbes = [THREE.BackSide, THREE.DoubleSide].map((side) => {
    const mesh = new THREE.Mesh(probeGeometry, new THREE.MeshDepthMaterial({
      map: mappedTexture, side, depthPacking: THREE.RGBADepthPacking, fog: false,
    }));
    mesh.position.y = 1;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.visible = false;
    rig.add(mesh);
    return mesh;
  });
  const draws = warm.reduce((sum, car) =>
    sum + Math.max(1, Math.ceil(car.meshes.length / MESHES_PER_FRAME)) * 2,
    2 + shadowProbes.length + warm.length - 1 + warm.length);
  let completed = 0;
  let carIndex = 0;
  let offset = 0;
  let fading = false;
  let pairIndex = 0;
  let shadowProbeIndex = 0;
  let gatePrepared = false;
  let done = false;
  let restored = false;
  let gateRestore = null;
  let drawNumber = 0;
  let deferProgress = false;
  let pauseFrame = false;
  let textureUploads = 0;
  let preparation = null;
  let parallelCompile = typeof renderer.compileAsync === 'function' &&
    typeof renderer.initTexture === 'function' &&
    renderer.extensions?.has?.('KHR_parallel_shader_compile') &&
    // compileAsync traverses hidden objects too. The shipped cars are all visible;
    // retain the draw-only path for a future model with authored hidden geometry.
    cars.every(car => car.allVisible);
  const uploadedTextures = new Set();

  for (const car of cars) for (const entry of car.snapshot) {
    entry.object.visible = false;
    entry.object.frustumCulled = false;
  }

  function mount(...models) {
    carMount.clear();
    carMount.add(...models);
  }

  function abort() {
    if (done) return;
    done = true; // no later step may mutate the scene after this point
    const failures = [];
    const restore = action => { try { action(); } catch (error) { failures.push(error); } };
    if (gateRestore) {
      restore(gateRestore);
      gateRestore = null;
    }
    restore(() => { scene.fog = originalFog; });
    for (const probe of shadowProbes) {
      restore(() => rig.remove(probe));
    }
    // Keep the probe materials' program references resident. Disposing them here
    // would undo the shadow-side compilation before a real crossing uses it.
    restore(() => probeGeometry.dispose());
    for (const car of cars) for (const entry of car.snapshot) {
      restore(() => {
        entry.object.material = entry.material;
        entry.object.visible = entry.visible;
        entry.object.frustumCulled = entry.frustumCulled;
      });
    }
    restore(() => mount(starter));
    if (failures.length) throw new AggregateError(failures, 'Warm-up scene restore failed');
    restored = true;
  }

  function draw(phase, setup) {
    const started = performance.now();
    setup?.();
    if (++drawNumber === throwAtDraw) throw new Error('Injected mid-warm-up draw failure');
    const renderAt = performance.now();
    if (SCENE_ONLY_DRAWS && phase !== 'full-scene-control') {
      // Same scene, lights, fog and shadow pass into the RenderPass target; skips the
      // post chain, whose programs the composer-rendered control draw still warms.
      const target = renderer.getRenderTarget();
      renderer.setRenderTarget(composer.readBuffer);
      try { renderer.render(scene, camera); } finally { renderer.setRenderTarget(target); }
    } else render(0);
    const rendered = performance.now();
    onStep?.({ phase, startedAt: started, endedAt: rendered,
      setupMs: renderAt - started,
      renderMs: rendered - renderAt, totalMs: rendered - started });
  }

  function advance() {
    completed++;
    if (!deferProgress) onProgress?.(completed / draws);
  }

  // Prepare the same normal/fade materials used by the draws below. The third
  // compileAsync argument supplies the Tour's lights, environment and fog. Bind
  // the RenderPass target only for the synchronous compile invocation: compiling
  // to the screen would cache different tone-mapping/output-colour programs.
  function prepare(car) {
    if (!parallelCompile) return false;
    try {
      if (!preparation || preparation.car !== car || preparation.fading !== fading) {
        const pending = { car, fading, ready: false, failed: false, error: null, textures: [] };
        const textures = new Set();
        car.model.traverse(object => {
          if (!object.isMesh) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) for (const value of Object.values(material || {})) {
            if (value?.isTexture && !uploadedTextures.has(value)) textures.add(value);
          }
        });
        pending.textures = [...textures];
        preparation = pending;
        const target = renderer.getRenderTarget();
        const face = renderer.getActiveCubeFace();
        const mip = renderer.getActiveMipmapLevel();
        try {
          renderer.setRenderTarget(composer.readBuffer);
          Promise.resolve(renderer.compileAsync(car.model, camera, scene)).then(() => {
            if (!done && preparation === pending) pending.ready = true;
          }, error => {
            if (!done && preparation === pending) {
              pending.failed = true;
              pending.error = error;
            }
          });
        } finally { renderer.setRenderTarget(target, face, mip); }
        return true;
      }
      if (preparation.failed) throw preparation.error;
      if (preparation.textures.length) {
        const texture = preparation.textures.shift();
        renderer.initTexture(texture);
        uploadedTextures.add(texture);
        pauseFrame = ++textureUploads >= TEXTURES_PER_FRAME;
        return true;
      }
      pauseFrame = !preparation.ready; // yield instead of spinning on the Promise
      return pauseFrame;
    } catch (error) {
      // Preparation is optional. A failed attempt resumes the original draw path;
      // draw failures still use the existing abort/restore and readiness recovery.
      parallelCompile = false;
      preparation = null;
      console.warn('[warmup] Async preparation unavailable; using draw warm-up.', error);
      return false;
    }
  }

  // ---- Unlocked scheduler ------------------------------------------------------------
  // The accepted (locked) prepare() above serialises compile -> 4 uploads/frame -> draws, one
  // car at a time. This variant keeps the same draws in the same order but runs the shader
  // compiles (normal and cached-fade variants) and texture uploads ahead of them, bounded by
  // the frame's wall-time budget, so the wait for one car overlaps the preparation of the next.
  let frameStartedAt = 0;
  let frameBudgetMs = WARMUP_FRAME_BUDGET_MS;
  const aheadJobs = [];
  const textureQueue = [];
  let aheadIssued = 0;
  let textureCursor = 0;

  function buildAhead() {
    const queued = new Set();
    warm.forEach((car, index) => {
      aheadJobs.push({ car, fading: false, issued: false, ready: false, failed: false, error: null });
      aheadJobs.push({ car, fading: true, issued: false, ready: false, failed: false, error: null });
      car.model.traverse(object => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) for (const value of Object.values(material || {})) {
          if (value?.isTexture && !value.isRenderTargetTexture && !queued.has(value)) {
            queued.add(value);
            textureQueue.push({ texture: value, car: index });
          }
        }
      });
    });
  }

  function issueCompile(job) {
    job.issued = true;
    const target = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace();
    const mip = renderer.getActiveMipmapLevel();
    try {
      if (job.fading) beginWarmFade(job.car.model, 'crossfade');
      renderer.setRenderTarget(composer.readBuffer);
      Promise.resolve(renderer.compileAsync(job.car.model, camera, scene)).then(() => {
        job.ready = true;
      }, error => {
        job.failed = true;
        job.error = error;
      });
    } finally {
      renderer.setRenderTarget(target, face, mip);
      // The draw loop switches a car to its fade materials itself; hand it back as found.
      if (job.fading) for (const entry of job.car.snapshot) entry.object.material = entry.material;
    }
  }

  function prepareAhead() {
    if (!parallelCompile) return false;
    try {
      if (!aheadJobs.length) buildAhead();
      const current = carIndex * 2 + (fading ? 1 : 0);
      const overBudget = () => performance.now() - frameStartedAt >= frameBudgetMs;
      while (aheadIssued < aheadJobs.length && aheadIssued < current + COMPILE_AHEAD_JOBS &&
          (aheadIssued <= current || !overBudget())) {
        issueCompile(aheadJobs[aheadIssued++]);
      }
      for (const job of aheadJobs) if (job.failed) throw job.error;
      while (textureCursor < textureQueue.length &&
          textureQueue[textureCursor].car <= carIndex + TEXTURE_AHEAD_CARS && !overBudget()) {
        const { texture } = textureQueue[textureCursor++];
        renderer.initTexture(texture);
        uploadedTextures.add(texture);
      }
      const texturesDone = textureCursor >= textureQueue.length ||
        textureQueue[textureCursor].car > carIndex;
      pauseFrame = !(aheadJobs[current].ready && texturesDone); // yield instead of spinning
      return pauseFrame;
    } catch (error) {
      parallelCompile = false;
      console.warn('[warmup] Async preparation unavailable; using draw warm-up.', error);
      return false;
    }
  }

  function step() {
    if (done) return true;
    pauseFrame = false;
    if (!deferProgress) {
      textureUploads = 0;
      frameStartedAt = performance.now();
    }
    try {
      if (carIndex >= warm.length) {
        if (gatePrepared) {
          abort();
          draw('full-scene-control');
          advance();
          return true;
        }
        if (pairIndex < warm.length - 1) {
          const first = warm[pairIndex];
          const second = warm[pairIndex + 1];
          draw('fade-pair', () => {
            for (const object of [...first.meshes, ...second.meshes]) object.visible = true;
            beginWarmFade(first.model);
            beginWarmFade(second.model);
            mount(first.model, second.model);
          });
          for (const object of [...first.meshes, ...second.meshes]) object.visible = false;
          pairIndex++;
          advance();
          return false;
        }
        if (shadowProbeIndex < shadowProbes.length) {
          const probe = shadowProbes[shadowProbeIndex++];
          probe.visible = true;
          scene.fog = null;
          try { draw('shadow'); } finally { scene.fog = originalFog; probe.visible = false; }
          advance();
          return false;
        }
        gateRestore = warmCheckpointResponse();
        draw('gate-response');
        gateRestore();
        gateRestore = null;
        advance();
        gatePrepared = true;
        return false;
      }

      const { model, meshes } = warm[carIndex];
      if (UNLOCKED ? prepareAhead() : prepare(warm[carIndex])) return false;
      const batch = meshes.slice(offset, offset + MESHES_PER_FRAME);
      const enabled = new Set();
      for (const object of batch) {
        for (let ancestor = object; ancestor && ancestor !== model; ancestor = ancestor.parent) {
          if (ancestor.isMesh) enabled.add(ancestor);
        }
      }
      draw(fading ? 'fade-solo' : 'normal-solo', () => {
        for (const object of enabled) object.visible = true;
        mount(model);
      });
      for (const object of enabled) object.visible = false;
      advance();
      offset += MESHES_PER_FRAME;
      if (offset >= meshes.length) {
        offset = 0;
        if (!fading) {
          beginWarmFade(model, 'crossfade');
          fading = true;
        } else {
          // Pulse changes uniforms on the SAME resident fade materials/programs.
          // All meshes just drew that shader. Exercise the alternate values in
          // one bounded batch per car, rather than replaying the entire roster.
          draw('pulse-solo', () => {
            beginWarmFade(model, 'pulse');
            for (const object of enabled) object.visible = true;
            mount(model);
          });
          for (const object of enabled) object.visible = false;
          advance();
          fading = false;
          carIndex++;
        }
      }
      return false;
    } catch (error) {
      try { abort(); }
      catch (restoreError) { throw new AggregateError([error, restoreError],
        'Warm-up step and scene restore failed'); }
      throw error;
    }
  }

  // One animation frame of warm-up: run step() repeatedly until budgetMs of wall time
  // has elapsed (at least one step; no new step starts once the budget is spent;
  // stops at the final step). Preparation also yields on its texture quota or a
  // pending compile. All original draws still run in order, retaining geometry,
  // shadow, fade-pair, gate and composer coverage. Errors propagate from step() unchanged
  // (step() has already aborted/restored). Progress is reported once per frame.
  function runFrame(budgetMs = UNLOCKED ? UNLOCKED_FRAME_BUDGET_MS : WARMUP_FRAME_BUDGET_MS) {
    const frameStart = performance.now();
    frameStartedAt = frameStart;
    frameBudgetMs = budgetMs;
    const before = completed;
    textureUploads = 0;
    deferProgress = true;
    let finished;
    try {
      do {
        finished = step();
      } while (!finished && !done && !pauseFrame && performance.now() - frameStart < budgetMs);
    } finally { deferProgress = false; }
    if (completed !== before) onProgress?.(completed / draws);
    return finished;
  }

  return { step, runFrame, abort, get done() { return done; }, get restored() { return restored; },
    get progress() { return completed / draws; } };
}
