/**
 * main.js — bootstrap, wiring and the single frame loop.
 *
 * OWNED BY THE MANAGER (integration). Modules do not know about each other; every
 * cross-module connection is made here, explicitly, so the data flow is readable in
 * one place. Modules expose `update(dt)` and injected handlers; main.js owns the graph.
 *
 * Update order is load-bearing:
 *   1. scrollDrive  — establishes state.progress for this frame
 *   2. carRig       — places and orients the car on the route
 *   3. aerialCamera — follows the route in world space
 *   4. world/morph  — checkpoints, car swap, theme and finish updates
 *   5. ui/audio     — reads final state
 *   6. sceneSetup   — projection and post uniforms read settled speed
 *   7. render       — whichever view owns the screen right now
 */

import './styles/base.css';
import * as THREE from 'three';
import { state, set, subscribe } from './core/state.js';
import { Clock } from './core/clock.js';
import { getRestoredRouteProgress, restoreSession, startRoutePersistence } from './core/session.js';
import { restoreExperience, setExperience } from './core/experience.js';

// Boot instrumentation: User Timing entries prefixed `gt3:` (read with
// performance.getEntriesByType('mark'|'measure')). Costs microseconds; kept on purpose.
function perfMark(name) {
  try { performance.mark(`gt3:${name}`); } catch { /* User Timing unavailable */ }
}
function perfMeasure(name, from, to) {
  try { performance.measure(`gt3:${name}`, `gt3:${from}`, `gt3:${to}`); } catch { /* ignore */ }
}
/** Run a synchronous boot step and record `gt3:<name>` (marks <name>:start / <name>:end). */
function timed(name, fn) {
  perfMark(`${name}:start`);
  try { return fn(); } finally {
    perfMark(`${name}:end`);
    perfMeasure(name, `${name}:start`, `${name}:end`);
  }
}

const clock = new Clock();
const updates = [];
const resizeHandlers = new Set();
let resizeTimer;

export function registerUpdate(fn) {
  updates.push(fn);
  return () => {
    const i = updates.indexOf(fn);
    if (i !== -1) updates.splice(i, 1);
  };
}

export function onResize(fn) {
  resizeHandlers.add(fn);
  return () => resizeHandlers.delete(fn);
}

window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    for (const handler of resizeHandlers) handler(window.innerWidth, window.innerHeight);
  }, 60);
});

async function boot() {
  perfMark('boot:start');
  restoreSession();

  // LEGACY BRIDGE — remove in Phases 4–7. Phase 4 replaces this with real boot
  // resolution; today's running race is the V3 Grand Tour regardless of saved state.
  restoreExperience('tour');
  subscribe('mode', (mode) => {
    if (mode === 'finish') setExperience('complete');
    else if (mode === 'race' && state.experience === 'complete') setExperience('tour');
  });

  // ---- modules -----------------------------------------------------------
  const sceneSetup = await import('./scene/sceneSetup.js');
  const scrollDrive = await import('./scroll/scrollDrive.js');
  const track = await import('./scene/track.js');
  const environment = await import('./scene/environment.js');
  const carRig = await import('./scene/carRig.js');
  const aerialCamera = await import('./scene/aerialCamera.js');
  const cars = await import('./scene/cars.js');
  const carWarmup = await import('./scene/carWarmup.js');
  const checkpoints = await import('./scene/checkpoints.js');
  const morph = await import('./scene/morph.js');
  const theme = await import('./scene/theme.js');
  const finishLine = await import('./scene/finishLine.js');
  const studio = await import('./montage/studio.js');
  const audio = await import('./audio/audioManager.js');
  const hud = await import('./ui/hud.js');
  const themeToggle = await import('./ui/themeToggle.js');
  const soundControl = await import('./ui/soundControl.js');
  const player = await import('./ui/player.js');
  const soundCue = await import('./ui/soundCue.js');
  const startScreen = await import('./ui/startScreen.js');
  const finishScreen = await import('./ui/finishScreen.js');

  // ---- scene -------------------------------------------------------------
  perfMark('imports:end');
  perfMeasure('imports', 'boot:start', 'imports:end');
  const { scene, camera } = timed('init-scene', () => sceneSetup.initScene());

  scene.add(timed('build-track', () => track.buildTrack()));
  const env = timed('build-environment', () => environment.buildEnvironment());
  scene.add(env);
  scene.add(timed('build-finish-line', () => finishLine.buildFinishLine()));
  scene.add(timed('build-checkpoints', () => checkpoints.buildCheckpoints()));

  const rig = timed('init-car-rig', () => carRig.initCarRig());
  scene.add(rig);
  sceneSetup.attachSunTarget(rig);
  timed('init-aerial-camera', () => aerialCamera.initAerialCamera(camera));

  timed('init-morph-theme', () => { morph.initMorph(); theme.initTheme(); });
  timed('init-studio', () => studio.initStudio());
  timed('init-hud', () => hud.initHUD());
  timed('init-ui-controls', () => {
    themeToggle.initThemeToggle();
    soundControl.initSoundControl();
    player.initPlayer();
  });
  timed('init-start-screen', () => startScreen.initStartScreen());
  timed('init-sound-cue-finish-screen', () => {
    soundCue.initSoundCue();
    startScreen.onDismissComplete(soundCue.showSoundCue);
    finishScreen.initFinishScreen();
  });
  timed('init-scroll-drive', () => {
    scrollDrive.initScrollDrive();
    scrollDrive.lockScroll();
  });
  perfMark('scene-build:end');
  perfMeasure('scene-build', 'imports:end', 'scene-build:end');

  // ---- preload -----------------------------------------------------------
  // One readiness decision owns both the start screen and scroll unlock.
  const faults = import.meta.env.DEV ? (window.__gt3TestFaults || {}) : {};
  const readiness = { status: 'loading', model: 'pending', audio: 'pending',
    gpu: 'pending', progress: 0, reasons: [], warmupSteps: [], readyAt: null };
  window.__gt3.readiness = readiness;
  const fractions = { model: 0, audio: 0, gpu: 0 };
  const timeouts = { model: null, audio: null, gpu: null };
  const limits = { model: faults.modelTimeoutMs || 20000,
    audio: faults.audioTimeoutMs || 15000,
    gpu: faults.warmupTimeoutMs || 40000 };
  let gpuWarmup = null;

  function reportProgress() {
    readiness.progress = readiness.status === 'loading'
      ? fractions.model * 0.65 + fractions.audio * 0.15 + fractions.gpu * 0.20 : 1;
    startScreen.setLoadState(readiness);
    window.dispatchEvent(new CustomEvent('gt3:preload',
      { detail: { fraction: readiness.progress, status: readiness.status } }));
  }
  function visibleStarter() {
    const mount = rig.getObjectByName('car-mount');
    if (mount?.children.length !== 1 || !mount.children[0].visible) return false;
    let visible = false;
    mount.children[0].traverse(object => { if (object.isMesh && object.visible) visible = true; });
    return visible;
  }
  function releaseDrive() {
    if (readiness.status !== 'loading' ||
        ['model', 'audio', 'gpu'].some(phase => readiness[phase] === 'pending')) return;
    if (!visibleStarter()) {
      readiness.status = 'failed';
      readiness.reasons.push('starter-car-not-visible');
      console.error('[gt3] Cannot release drive without a visible starter car');
      reportProgress();
      return;
    }
    readiness.status = ['model', 'audio', 'gpu'].every(phase => readiness[phase] === 'ready')
      ? 'ready' : 'degraded';
    readiness.readyAt = performance.now();
    perfMark(`ready:${readiness.status}`);
    const savedRouteProgress = getRestoredRouteProgress();
    const restoreFinish = savedRouteProgress !== null && finishScreen.isFinishProgress(savedRouteProgress);
    if (restoreFinish) set('mode', 'finish');
    if (savedRouteProgress !== null) {
      // Restore while locked so this programmatic scroll cannot consume the first real gesture.
      scrollDrive.seekTo(savedRouteProgress, { instant: true });
      const routeIndex = checkpoints.restoreAtProgress(savedRouteProgress);
      morph.resetMorph(routeIndex);
      aerialCamera.snap();
    }
    scrollDrive.unlockScroll();
    if (restoreFinish) finishScreen.restoreFinishScreen();
    startRoutePersistence();
    reportProgress();
    console.info(`[gt3] ${readiness.status} — three r${THREE.REVISION}`,
      readiness.reasons);
  }
  function settle(phase, result, reason) {
    if (readiness[phase] !== 'pending') return;
    clearTimeout(timeouts[phase]);
    readiness[phase] = result;
    fractions[phase] = 1;
    perfMark(`${phase}:${result}`);
    if (phase === 'gpu') perfMeasure('warmup', 'warmup:start', `gpu:${result}`);
    if (reason) readiness.reasons.push(reason);
    reportProgress();
    releaseDrive();
  }
  function bound(phase, ms, onTimeout) {
    timeouts[phase] = window.setTimeout(() => {
      if (readiness[phase] === 'pending') onTimeout();
    }, ms);
  }
  function failLoading(reason, error) {
    if (readiness.status !== 'loading') return;
    for (const timer of Object.values(timeouts)) clearTimeout(timer);
    readiness.status = 'failed';
    readiness.reasons.push(reason);
    console.error('[gt3] Route unavailable:', reason, error);
    reportProgress();
  }
  function stopWarmup(reason) {
    if (readiness.gpu !== 'pending') return;
    try {
      gpuWarmup?.abort();
      if (gpuWarmup && !gpuWarmup.restored)
        throw new Error('Warm-up did not restore the scene');
    } catch (error) {
      gpuWarmup = null;
      failLoading('gpu-restore-error', error);
      return;
    }
    gpuWarmup = null;
    try { sceneSetup.render(0); }
    catch (error) { failLoading('gpu-fallback-render-error', error); return; }
    console.warn('[gt3] GPU warm-up degraded; later crossings may be cold:', reason);
    settle('gpu', 'degraded', reason);
  }
  function startWarmup() {
    try {
      gpuWarmup = carWarmup.createCarWarmup(
        fraction => { fractions.gpu = fraction; reportProgress(); },
        entry => readiness.warmupSteps.push(entry),
        { throwAtDraw: faults.warmThrowAtStep },
      );
      perfMark('warmup:start');
      bound('gpu', limits.gpu, () => stopWarmup('gpu-timeout'));
    } catch (error) {
      console.error('[gt3] GPU warm-up setup failed', error);
      failLoading('gpu-setup-error', error);
    }
  }
  function mountStarter() {
    try {
      const first = cars.getCarModel(state.activeCarIndex);
      if (!first) throw new Error('Missing starter car');
      carRig.setCarModel(first);
      carRig.setWheels(cars.findWheels(first));
      return first;
    } catch (error) {
      console.error('[gt3] Starter car unavailable', error);
      return null;
    }
  }
  function modelsFailed(error, reason) {
    if (readiness.model !== 'pending') return;
    console.error('[gt3] car preload failed', error);
    try {
      cars.recoverCars(error);
      if (!mountStarter()) throw new Error('Fallback starter car unavailable');
    } catch (fallbackError) {
      failLoading('model-fallback-error', fallbackError);
      return;
    }
    settle('model', 'degraded', reason);
    startWarmup();
  }

  perfMark('preload:start');
  bound('model', limits.model, () => modelsFailed(new Error('Model preload timeout'), 'model-timeout'));
  bound('audio', limits.audio, () => {
    console.warn('[gt3] audio preload timeout');
    settle('audio', 'degraded', 'audio-timeout');
  });
  const modelPromise = faults.modelHang ? new Promise(() => {}) : faults.modelReject
    ? Promise.reject(new Error('Injected model preload rejection'))
    : cars.preloadCars((_l, _t, fraction) => {
      if (readiness.model !== 'pending') return;
      fractions.model = fraction;
      reportProgress();
    });
  modelPromise.then(() => {
    if (readiness.model !== 'pending') return;
    const first = mountStarter();
    if (!first) return modelsFailed(new Error('Missing starter car'), 'model-unusable');
    const placeholder = Array.from({ length: 10 },
      (_, index) => cars.getCarModel(index)).some(model => model.userData.loadError);
    settle('model', placeholder ? 'degraded' : 'ready',
      placeholder ? 'model-placeholder' : null);
    startWarmup();
  }).catch(error => modelsFailed(error, 'model-rejection'));

  const audioPromise = faults.audioHang ? new Promise(() => {}) : faults.audioReject
    ? Promise.reject(new Error('Injected audio preload rejection'))
    : audio.preloadAudio((_fraction, loaded, total) => {
      if (readiness.audio !== 'pending') return;
      fractions.audio = loaded / Math.max(1, total);
      reportProgress();
    });
  audioPromise.then(buffers => {
    const missing = Object.values(buffers).some(buffer => !buffer) ||
      Object.keys(buffers).length < 5;
    settle('audio', missing ? 'degraded' : 'ready', missing ? 'audio-file-unavailable' : null);
  }).catch(error => {
    console.warn('[gt3] audio preload rejected', error);
    settle('audio', 'degraded', 'audio-rejection');
  });
  reportProgress();

  // ---- wiring ------------------------------------------------------------

  // The studio remains initialized for a later manual Showcase unlock flow.
  studio.setMorphHandler((index) => morph.morphTo(index));
  studio.onMontageComplete(() => set('mode', 'race'));

  // Replay resets route position and model, preserving session discoveries.
  finishScreen.setReplayHandler(() => {
    morph.resetMorph(0);
    set('activeCarIndex', 0);
  });


  // Environment parallax remains independent of the race camera.
  window.addEventListener('pointermove', (e) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    environment.setParallax(x, y);
  }, { passive: true });

  // ---- per-frame ---------------------------------------------------------
  let dispatchedApproachIndex = -1;
  let dispatchedApproachStep = -1;
  let dispatchedAudioApproachStep = -1;

  registerUpdate(scrollDrive.update);
  registerUpdate(carRig.update);
  registerUpdate(aerialCamera.update);
  registerUpdate(checkpoints.updateCheckpoints);
  registerUpdate(checkpoints.updateGateResponse);
  registerUpdate(() => morph.morphTo(state.activeCarIndex));
  registerUpdate(morph.updateMorph);
  registerUpdate(theme.update);
  registerUpdate(finishLine.update);
  registerUpdate(studio.updateMontage);
  registerUpdate((dt) => {
    // Checkpoint proximity drives only the existing, identity-free audio cue.
    const approach = checkpoints.getApproach();
    const index = approach ? approach.index : -1;
    const proximity = approach ? approach.proximity : 0;
    const step = Math.round(proximity * 100) / 100;

    if (index !== dispatchedApproachIndex || step !== dispatchedApproachStep) {
      dispatchedApproachIndex = index;
      dispatchedApproachStep = step;
    }
    if (step !== dispatchedAudioApproachStep) {
      dispatchedAudioApproachStep = step;
      audio.setCoinApproach(proximity);
    }
  });
  registerUpdate(hud.update);
  registerUpdate(finishScreen.update);
  registerUpdate(audio.updateAudio);
  registerUpdate(player.updatePlayer);
  registerUpdate(sceneSetup.updateScene);

  onResize((w, h) => {
    void w; void h;
  });

  function frame() {
    const dt = clock.tick();
    for (const update of updates) update(dt, state);

    // The legacy montage remains available for a later manual-unlock flow.
    try {
      if (gpuWarmup && !gpuWarmup.done && readiness.gpu === 'pending') {
        if (!faults.warmHang && gpuWarmup.step()) {
          gpuWarmup = null;
          settle('gpu', 'ready');
        }
      } else if (studio.isMontagePlaying()) studio.renderMontage();
      else sceneSetup.render(dt);
    } catch (error) {
      if (readiness.gpu === 'pending' && gpuWarmup) {
        console.error('[gt3] GPU warm-up failed', error);
        stopWarmup('gpu-step-error');
      } else console.error('[gt3] render failed', error);
    } finally {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error('[gt3] boot failed', err);
});
