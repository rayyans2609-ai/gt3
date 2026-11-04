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
import './styles/timer.css';
import './styles/finishTail.css';
import * as THREE from 'three';
import { state, set, subscribe } from './core/state.js';
import { Clock } from './core/clock.js';
import { getRestoredRouteProgress, persistRouteProgress, restoreSession, startRoutePersistence } from './core/session.js';
import { restoreExperience, setExperience, beginTransition, completeTransition, cancelTransition } from './core/experience.js';
import { UNLOCKED } from './core/renderProfile.js';
// W2 review scaffolding: resolves ?comp= (pure, no scene imports) before any scene
// module builds geometry. trackCurve.js also imports it, so order cannot regress.
import { COMP } from './scene/composition.js';

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

/**
 * Let the browser paint and run queued tasks (network, DRACO worker results). rAF runs before the
 * frame's paint, so continue from a task queued inside it; the timeout covers hidden tabs where
 * rAF never fires.
 */
function yieldToBrowser() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(() => setTimeout(finish, 0));
    setTimeout(finish, 150);
  });
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

  // Boot resolution (SPEC §24–25). A new session starts on the Landing; a refresh restores the
  // experience it left: the Hub at rest, or the Grand Tour at its saved route position. Showcase
  // does not exist yet (Phase 6) and resolves to the Hub. index.html made the same decision
  // before first paint from the same session record.
  const bootIntoTour = state.experience === 'tour' || state.experience === 'complete';
  restoreExperience(bootIntoTour ? 'tour'
    : state.experience === 'hub' || state.experience === 'showcase' ? 'hub' : 'landing');
  document.documentElement.dataset.world = bootIntoTour ? 'tour' : 'landing';
  // The Landing hero streams first; the Tour roster follows in the background. A session that
  // boots into the Tour loads the Landing only if the visitor goes back to the Hub.
  let landing = bootIntoTour ? null : await import('./landing/landing.js');
  landing?.preloadHero();
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
  // Unlocked only: the staged-prewarm policy. Locked never loads or consults it.
  const prewarm = UNLOCKED ? await import('./scene/carWarmBackground.js') : null;
  // Unlocked only (W6): bound three's transmission pass. Locked never loads it.
  const transmission = UNLOCKED ? await import('./scene/transmissionBudget.js') : null;
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
  const entrySequence = await import('./ui/entrySequence.js');
  const finishScreen = await import('./ui/finishScreen.js');
  const hub = await import('./ui/hub.js');
  const homeControl = await import('./ui/homeControl.js');

  perfMark('imports:end');
  perfMeasure('imports', 'boot:start', 'imports:end');

  // ---- early start: readiness, loading UI, audio and model preload --------
  // These need no scene, so they start before the heavy synchronous builds below. Network and
  // DRACO-worker callbacks then run in the yields between builders instead of queueing behind
  // one multi-second task, and the start screen paints with live progress.
  // One readiness decision owns both the start screen and scroll unlock.
  const faults = import.meta.env.DEV ? (window.__gt3TestFaults || {}) : {};
  const readiness = { status: 'loading', model: 'pending', audio: 'pending',
    gpu: 'pending', progress: 0, reasons: [], warmupSteps: [], readyAt: null };
  const fractions = { model: 0, audio: 0, gpu: 0 };
  const timeouts = { model: null, audio: null, gpu: null };
  const limits = { model: faults.modelTimeoutMs || 20000,
    audio: faults.audioTimeoutMs || 15000,
    gpu: faults.warmupTimeoutMs || 40000 };
  let gpuWarmup = null;
  let backgroundWarmup = null;
  let warmupCars = null; // null = every car is warmed before unlock (accepted lifecycle)

  timed('init-start-screen', () => startScreen.initStartScreen());
  // Lock before the first yield: input can now be processed between builders, and the drive
  // must already swallow it (the whole boot used to be one task, so nothing could interleave).
  timed('init-scroll-drive', () => {
    scrollDrive.initScrollDrive();
    // On the Landing the page scroll belongs to the Landing; the drive waits, dormant, until
    // START RACE arms it. A restored Tour locks exactly as before.
    if (bootIntoTour) scrollDrive.lockScroll();
    else scrollDrive.setDriveDormant(true);
  });

  perfMark('preload:start');
  // Audio settles on its own: settle() only reaches releaseDrive(), which refuses while the
  // model and gpu phases are pending, and those cannot settle before the scene exists (the
  // model handlers are attached after the scene is built, below).
  bound('audio', limits.audio, () => {
    console.warn('[gt3] audio preload timeout');
    settle('audio', 'degraded', 'audio-timeout');
  });
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
  // cars.js already began its roster fetch at import; subscribe for progress now. The resolved
  // promise is only consumed once the scene exists (mountStarter needs the rig).
  const modelPromise = faults.modelHang ? new Promise(() => {}) : faults.modelReject
    ? Promise.reject(new Error('Injected model preload rejection'))
    : cars.preloadCars((_l, _t, fraction) => {
      if (readiness.model !== 'pending') return;
      fractions.model = fraction;
      reportProgress();
    });
  void modelPromise.catch(() => {}); // handled below; no unhandled-rejection during the build
  reportProgress();

  // ---- scene (staged: yield so the start screen paints and callbacks run) --
  await yieldToBrowser();
  perfMark('start-screen:painted');
  const { scene, camera, renderer } = timed('init-scene', () => sceneSetup.initScene());
  transmission?.budgetTransmission(renderer);
  function startLanding() {
    landing.initLanding(renderer, {
      onHub: () => setExperience('hub'),
      onLanding: () => setExperience('landing'),
    });
    onResize(landing.onLandingResize); // after the shared renderer's own resize
    registerUpdate(landing.updateLanding);
    registerUpdate(() => {
      if (landing.landingActive()) hub.setHubPresence(landing.landingHubPresence(), state.experience === 'hub');
    });
    window.__gt3.landing = { seek: landing.seekLanding, progress: landing.landingProgress,
      loaded: landing.heroLoaded, active: landing.landingActive, tuning: landing.landingTuning };
  }
  if (landing) {
    timed('init-landing', () => {
      startLanding();
      landing.activateLanding({ atHub: state.experience === 'hub' });
    });
  }
  hub.initHub({ onStartRace: () => { void enterTour(); } });
  // The edge row recomposes while the Hub owns the screen (its player replaces the + launcher).
  const markExperience = () => { document.documentElement.dataset.experience = state.experience; };
  subscribe('experience', markExperience);
  markExperience();
  homeControl.initHomeControl({ onHome: () => { void leaveTour(); } });
  hub.setHubReadiness(readiness);
  // initScene creates window.__gt3; these handles were previously attached after the full build.
  window.__gt3.readiness = readiness;
  window.__gt3.scrollMode = scrollDrive.scrollMode;
  window.__gt3.comp = COMP;
  if (!COMP.isDefault) {
    // TEMPORARY (W2 review): tiny label naming the active composition candidate.
    const label = document.createElement('div');
    label.className = 'dev-comp-label';
    label.textContent = `${COMP.look ? `look ${COMP.look} ${COMP.title} / ` : ''}comp ${COMP.name}${COMP.cameraVariant !== 'leg1' ? ` / cam ${COMP.cameraVariant}` : ''}${Object.keys(COMP.overrides).length
      ? ` ${Object.entries(COMP.overrides).map(([k, v]) => `${k}=${v}`).join(' ')}` : ''}`;
    label.style.cssText = 'position:fixed;left:50%;bottom:6px;transform:translateX(-50%);'
      + 'font:10px/1 ui-monospace,monospace;opacity:.55;pointer-events:none;z-index:9999;'
      + 'color:#888;letter-spacing:.04em';
    document.body.appendChild(label);
    if (COMP.camera === 'corridor') {
      const caption = label.textContent;
      aerialCamera.aerial.onRailChange = rail => {
        label.textContent = `${caption} / ${rail.holdState} @ ${rail.aspect.toFixed(3)}`
          + (rail.unavailableHolds.length ? ` / unavailable ${rail.unavailableHolds.join(',')}` : '')
          + (rail.fallback ? ` / fallback ${rail.fallback}` : '');
      };
    }
  }
  await yieldToBrowser();
  scene.add(timed('build-track', () => track.buildTrack()));
  await yieldToBrowser();
  const env = timed('build-environment', () => environment.buildEnvironment());
  scene.add(env);
  await yieldToBrowser();

  // Everything from here to the first frame is one synchronous section, so a harness that
  // sees the car rig in the scene also sees the rest of the graph.
  scene.add(timed('build-finish-line', () => finishLine.buildFinishLine()));
  scene.add(timed('build-checkpoints', () => checkpoints.buildCheckpoints()));

  const rig = timed('init-car-rig', () => carRig.initCarRig());
  scene.add(rig);
  sceneSetup.attachSunTarget(rig);
  timed('init-aerial-camera', () => aerialCamera.initAerialCamera(camera));

  timed('init-morph-theme', () => { morph.initMorph(); theme.initTheme(); });
  timed('init-hud', () => hud.initHUD());
  timed('init-ui-controls', () => {
    themeToggle.initThemeToggle();
    soundControl.initSoundControl();
    player.initPlayer();
  });
  timed('init-sound-cue-finish-screen', () => {
    soundCue.initSoundCue();
    startScreen.onDismissComplete(soundCue.showSoundCue);
    finishScreen.initFinishScreen();
  });
  perfMark('scene-build:end');
  perfMeasure('scene-build', 'imports:end', 'scene-build:end');

  // ---- readiness wiring (needs the scene) ---------------------------------
  // The model phase and GPU warm-up begin only here: warm-up needs models AND scene.
  function reportProgress() {
    readiness.progress = readiness.status === 'loading'
      ? fractions.model * 0.65 + fractions.audio * 0.15 + fractions.gpu * 0.20 : 1;
    startScreen.setLoadState(readiness);
    hub.setHubReadiness(readiness);
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
    // A restored Tour arms now. From the Landing world the drive stays dormant: the Hub's
    // START RACE arms it (enterTour), so readiness alone never starts the Tour.
    if (state.experience === 'tour') armTour({ unlock: true });
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
      if (COMP.look) timed('curb-contact-cache', () => carRig.prepareCurbContacts(
        Array.from({ length: 10 }, (_, index) => cars.getCarModel(index))));
      if (prewarm && prewarm.PREWARM_MODE !== 'full') {
        // The window must also cover where a saved route will resume (releaseDrive restores it).
        const resumed = getRestoredRouteProgress();
        warmupCars = prewarm.foregroundIndices(state.activeCarIndex,
          checkpoints.indexAt(resumed ?? 0));
      }
      readiness.warmupCars = warmupCars ?? 'all';
      gpuWarmup = carWarmup.createCarWarmup(
        fraction => { fractions.gpu = fraction; reportProgress(); },
        entry => readiness.warmupSteps.push(entry),
        { throwAtDraw: faults.warmThrowAtStep, indices: warmupCars },
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

  bound('model', limits.model, () => modelsFailed(new Error('Model preload timeout'), 'model-timeout'));
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

  /**
   * Place the drive at the session's route position and start persisting it. The drive is
   * locked throughout, so the programmatic placement cannot consume the first real gesture.
   */
  let tourArmed = false;
  function armTour({ unlock }) {
    // First arming resumes the session's saved route; a later re-entry resumes where the
    // visitor left the Tour (the drive was dormant meanwhile, so state.progress still holds it).
    const savedRouteProgress = tourArmed ? state.progress : getRestoredRouteProgress();
    tourArmed = true;
    const restoreFinish = savedRouteProgress !== null && finishScreen.isFinishProgress(savedRouteProgress);
    if (restoreFinish) set('mode', 'finish');
    if (savedRouteProgress !== null) {
      // Restore while locked so this programmatic scroll cannot consume the first real gesture.
      scrollDrive.seekTo(savedRouteProgress, { instant: true });
      const routeIndex = checkpoints.restoreAtProgress(savedRouteProgress);
      morph.resetMorph(routeIndex);
      aerialCamera.snap();
    } else {
      // The page held the Landing's scroll until now; put it back on the start line.
      scrollDrive.seekTo(0, { instant: true });
    }
    // Refresh entry waits for the loading field to part, then runs the same locked entry.
    if (unlock && !restoreFinish) {
      void startScreen.revealTour().then(() => {
        if (state.experience === 'tour' && !state.transition) {
          void entrySequence.runEntry({ standingStart: state.progress === 0 });
        }
      });
    }
    if (restoreFinish) {
      startScreen.dismissStartScreenForRestore(); // no gesture will come; keep it (and its sound cue) out of the finish card
      finishScreen.restoreFinishScreen();
    }
    startRoutePersistence();
  }

  /**
   * Hub -> Grand Tour (SPEC §25; provisional Hub, owner 2026-10-24). The Hub field is opaque,
   * so the canvas switches to the Tour underneath it; the field then fades away and the drive
   * unlocks once any momentum from the Hub has died away. No input crosses the handoff.
   */
  let entering = false;
  async function enterTour() {
    if (entering || state.experience !== 'hub' || state.transition ||
        !['ready', 'degraded'].includes(readiness.status)) return;
    entering = true;
    const wasArmed = tourArmed;
    try {
      if (!beginTransition('tour')) return;
      scrollDrive.setDriveDormant(false);
      scrollDrive.lockScroll(); // swallow wheel and keys through the handoff
      hub.prepareLeave(); // keep the Tour HUD hidden until the field parts
      landing?.deactivateLanding();
      sceneSetup.resizeScene(window.innerWidth, window.innerHeight); // the Tour's fixed DPR again
      document.documentElement.dataset.world = 'tour';
      startScreen.usePromptOnly();
      armTour({ unlock: false });
      // Two paints under the field; bounded yields also settle in a hidden tab without rAF.
      await yieldToBrowser();
      await yieldToBrowser();
      await hub.leaveHub();
      completeTransition();
      if (state.mode === 'race') {
        void entrySequence.runEntry({ standingStart: state.progress === 0 });
      }
    } catch (error) {
      entrySequence.cancelEntry();
      console.error('[gt3] Tour entry failed; returning to the Hub', error);
      tourArmed = wasArmed;
      cancelTransition();
      scrollDrive.setDriveDormant(true);
      document.documentElement.dataset.world = 'landing';
      landing.activateLanding({ atHub: true });
      hub.resetHub(1, true);
    } finally {
      entering = false;
    }
  }
  window.__gt3.enterTour = enterTour;

  /**
   * Grand Tour -> Hub (SPEC §25 "Leaving Grand Tour mid-run"). The drive freezes and the route
   * is saved; the Hub field fades up over the Tour and the Landing world takes the screen and
   * the page scroll underneath it, at the Hub's rest point. Discoveries are untouched.
   */
  async function leaveTour() {
    if (entering || state.experience !== 'tour' || state.transition || state.mode !== 'race') return;
    entrySequence.cancelEntry();
    entering = true;
    try {
      scrollDrive.lockScroll();
      persistRouteProgress(state.progress, { flush: true });
      if (!beginTransition('hub')) { scrollDrive.unlockScroll(); return; }
      await hub.coverHub();
      scrollDrive.setDriveDormant(true);
      if (!landing) {
        landing = await import('./landing/landing.js');
        landing.preloadHero();
        startLanding();
      }
      document.documentElement.dataset.world = 'landing';
      landing.activateLanding({ atHub: true });
      completeTransition();
    } catch (error) {
      console.error('[gt3] Hub return failed; resuming the Tour', error);
      cancelTransition();
      landing?.deactivateLanding();
      document.documentElement.dataset.world = 'tour';
      sceneSetup.resizeScene(window.innerWidth, window.innerHeight);
      scrollDrive.setDriveDormant(false);
      hub.resetHub(0, false);
      scrollDrive.unlockScrollWhenQuiet();
    } finally {
      entering = false;
    }
  }
  window.__gt3.leaveTour = leaveTour;

  // ---- wiring ------------------------------------------------------------

  // The studio (a second WebGL renderer, SPEC §27) is NOT created at boot: nothing in the Grand
  // Tour starts a montage. playMontage()/prewarmMontage() call initStudio() on first real use.
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

  // Forward crossings carry the restrained crossing sound (SPEC §18); reverse stays visual only.
  checkpoints.onCrossing(({ direction }) => {
    if (direction > 0) audio.playCheckpointCross();
  });

  registerUpdate(scrollDrive.update);
  registerUpdate(carRig.update);
  registerUpdate(aerialCamera.update);
  // Tail distance never enters checkpoint logic: progress stays exactly 1.
  registerUpdate(checkpoints.updateCheckpoints);
  registerUpdate(checkpoints.updateGateResponse);
  let lastSwapEnd = 0;
  if (prewarm) morph.onMorphComplete(() => { lastSwapEnd = performance.now(); });
  registerUpdate(() => morph.morphTo(state.activeCarIndex));
  registerUpdate(morph.updateMorph);
  registerUpdate(theme.update);
  registerUpdate(finishLine.update);
  registerUpdate(studio.updateMontage);
  registerUpdate((dt) => {
    // Checkpoint proximity drives only the existing, identity-free audio cue.
    const approach = state.progress < 1 ? checkpoints.getApproach() : null;
    const index = approach ? approach.index : -1;
    const proximity = approach ? approach.proximity : 0;
    const step = Math.round(proximity * 100) / 100;

    if (index !== dispatchedApproachIndex || step !== dispatchedApproachStep) {
      dispatchedApproachIndex = index;
      dispatchedApproachStep = step;
    }
    if (state.experience !== 'tour' && state.experience !== 'complete') {
      dispatchedAudioApproachStep = -1;
    } else if (step !== dispatchedAudioApproachStep) {
      dispatchedAudioApproachStep = step;
      audio.setCoinApproach(proximity);
    }
  });
  registerUpdate(hud.update);
  registerUpdate(finishScreen.update);
  registerUpdate(audio.updateAudio);
  registerUpdate(player.updatePlayer);
  registerUpdate(hub.updateHub);
  registerUpdate(sceneSetup.updateScene);

  onResize((w, h) => {
    // Scene resize runs first. Solve/cached lookup in the debounced resize task,
    // before RAF pose evaluation; direct diagnostic aspect changes remain guarded.
    if (COMP.camera === 'corridor') aerialCamera.prepareCompositionRail(Math.max(1, w) / Math.max(1, h));
  });

  function frame() {
    const dt = clock.tick();
    for (const update of updates) update(dt, state);

    // The legacy montage remains available for a later manual-unlock flow.
    const landingOwns = Boolean(landing?.landingActive());
    try {
      if (gpuWarmup && !gpuWarmup.done && readiness.gpu === 'pending') {
        // While the visitor moves through the Landing transition the warm-up waits a moment,
        // so its first-use stalls never land on the signature shot. Its draws are then covered
        // by the Landing frame below. At rest, leave room for that visible frame: the Tour's
        // 12/24 ms loading-screen budgets can consume a whole refresh before the hero draws.
        if (!faults.warmHang && !landing?.landingBusy() && gpuWarmup.runFrame(landingOwns ? 4 : undefined)) {
          gpuWarmup = null;
          if (warmupCars) {
            backgroundWarmup = prewarm.createBackgroundWarmup(warmupCars,
              { getActive: () => state.activeCarIndex });
            window.__gt3.background = backgroundWarmup;
          }
          settle('gpu', 'ready');
        }
        if (landingOwns) landing.renderLanding();
      } else if (landingOwns) landing.renderLanding();
      else if (studio.isMontagePlaying()) studio.renderMontage();
      else {
        sceneSetup.render(dt);
        // Staged prewarm: one small step per calm frame, after the visible frame is drawn.
        if (backgroundWarmup && readiness.status === 'ready' && state.mode === 'race' &&
            !morph.isMorphing() && performance.now() - lastSwapEnd > 600 &&
            checkpoints.getApproach() === null && dt < 0.02) backgroundWarmup.tick();
      }
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

  // Opt-in Theatre.js animation authoring (dev server only): ?theatre or ?theatre=play. The
  // DEV guard is replaced by `false` in production builds, so the import and its packages are
  // dropped from the bundle. Theatre ticks from registerUpdate; see ARCHITECTURE.md.
  if (import.meta.env.DEV) {
    const theatreMode = new URLSearchParams(location.search).get('theatre');
    if (theatreMode !== null) {
      import('./authoring/theatre.js')
        .then((m) => m.initTheatre({ registerUpdate, mode: theatreMode === 'play' ? 'play' : 'studio' }))
        .catch((error) => console.error('[gt3:theatre] failed to start', error));
    }
  }
}

boot().catch((err) => {
  console.error('[gt3] boot failed', err);
});
