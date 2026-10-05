/** Exercise car render states through the Tour renderer before drive unlock. */
import * as THREE from 'three';
import { CARS } from '../data/cars.js';
import { getCarModel } from './cars.js';
import { carMount, rig } from './carRig.js';
import { render, scene } from './sceneSetup.js';
import { beginWarmFade } from './morph.js';
import { warmCheckpointResponse } from './checkpoints.js';

const MESHES_PER_FRAME = 12;
// Wall-time budget per animation frame for the warm-up driver. Solo measurement
// (startup-run3, H 4dfc2c9): one step() per rAF left ~6.5 s of an 18 s warm-up as
// idle rAF gaps (268 steps); running steps back-to-back until this budget is spent
// recovers that without changing the draw set. 12 ms keeps frames near 60 fps when
// draws are cheap; a single heavy first-use draw may still overshoot (always >= 1 step).
export const WARMUP_FRAME_BUDGET_MS = 12;

export function createCarWarmup(onProgress, onStep, { throwAtDraw = -1 } = {}) {
  const starter = carMount.children[0];
  if (!starter) throw new Error('[warmup] No visible starter car');
  const originalFog = scene.fog;
  const cars = CARS.map((_, index) => {
    const model = getCarModel(index);
    const meshes = [];
    const snapshot = [];
    model.traverse((object) => {
      if (!object.isMesh) return;
      snapshot.push({ object, visible: object.visible,
        frustumCulled: object.frustumCulled, material: object.material });
      if (object.visible) meshes.push(object);
    });
    return { model, meshes, snapshot };
  });
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
  const draws = cars.reduce((sum, car) =>
    sum + Math.max(1, Math.ceil(car.meshes.length / MESHES_PER_FRAME)) * 2,
    2 + shadowProbes.length + cars.length - 1);
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
    render(0);
    const rendered = performance.now();
    onStep?.({ phase, startedAt: started, endedAt: rendered,
      setupMs: renderAt - started,
      renderMs: rendered - renderAt, totalMs: rendered - started });
  }

  function advance() {
    completed++;
    if (!deferProgress) onProgress?.(completed / draws);
  }

  function step() {
    if (done) return true;
    try {
      if (carIndex >= cars.length) {
        if (gatePrepared) {
          abort();
          draw('full-scene-control');
          advance();
          return true;
        }
        if (pairIndex < cars.length - 1) {
          const first = cars[pairIndex];
          const second = cars[pairIndex + 1];
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

      const { model, meshes } = cars[carIndex];
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
          beginWarmFade(model);
          fading = true;
        } else {
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
  // stops at the final step). Same steps in the same order as one-step-per-frame, so
  // the resident GPU state is identical. Errors propagate from step() unchanged
  // (step() has already aborted/restored). Progress is reported once per frame.
  function runFrame(budgetMs = WARMUP_FRAME_BUDGET_MS) {
    const frameStart = performance.now();
    const before = completed;
    deferProgress = true;
    let finished;
    try {
      do {
        finished = step();
      } while (!finished && !done && performance.now() - frameStart < budgetMs);
    } finally { deferProgress = false; }
    if (completed !== before) onProgress?.(completed / draws);
    return finished;
  }

  return { step, runFrame, abort, get done() { return done; }, get restored() { return restored; },
    get progress() { return completed / draws; } };
}
