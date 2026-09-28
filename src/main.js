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
import { restoreSession } from './core/session.js';
import { restoreExperience, setExperience } from './core/experience.js';

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
  const checkpoints = await import('./scene/checkpoints.js');
  const morph = await import('./scene/morph.js');
  const theme = await import('./scene/theme.js');
  const finishLine = await import('./scene/finishLine.js');
  const studio = await import('./montage/studio.js');
  const audio = await import('./audio/audioManager.js');
  const hud = await import('./ui/hud.js');
  const specPanel = await import('./ui/specPanel.js');
  const themeToggle = await import('./ui/themeToggle.js');
  const soundControl = await import('./ui/soundControl.js');
  const player = await import('./ui/player.js');
  const showcase = await import('./ui/showcase.js');
  const fullscreenCard = await import('./ui/fullscreenCard.js');
  const startScreen = await import('./ui/startScreen.js');
  const finishScreen = await import('./ui/finishScreen.js');

  // ---- scene -------------------------------------------------------------
  const { scene, camera } = sceneSetup.initScene();

  scene.add(track.buildTrack());
  const env = environment.buildEnvironment();
  scene.add(env);
  scene.add(finishLine.buildFinishLine());
  scene.add(checkpoints.buildCheckpoints());

  const rig = carRig.initCarRig();
  scene.add(rig);
  sceneSetup.attachSunTarget(rig);
  aerialCamera.initAerialCamera(camera);

  morph.initMorph();
  theme.initTheme();
  studio.initStudio();
  showcase.initShowcase();
  fullscreenCard.initFullscreenCard();
  hud.initHUD();
  themeToggle.initThemeToggle();
  soundControl.initSoundControl();
  player.initPlayer();
  startScreen.initStartScreen();
  finishScreen.initFinishScreen();

  // ---- preload -----------------------------------------------------------
  // Models and audio load in parallel; the start screen shows one combined bar.
  let modelFraction = 0;
  let audioFraction = 0;
  const reportProgress = () => {
    // Models dominate the byte count, so they dominate the bar.
    const combined = modelFraction * 0.8 + audioFraction * 0.2;
    window.dispatchEvent(new CustomEvent('gt3:preload', { detail: { fraction: combined } }));
  };

  cars.preloadCars((_l, _t, fraction) => { modelFraction = fraction; reportProgress(); })
    .then(() => {
      const first = cars.getCarModel(state.activeCarIndex);
      if (first) {
        carRig.setCarModel(first);
        carRig.setWheels(cars.findWheels(first));
      }
    })
    .catch((e) => console.error('[gt3] car preload failed', e));

  audio.preloadAudio((_l, _t, fraction) => { audioFraction = fraction; reportProgress(); })
    .catch((e) => console.warn('[gt3] audio preload issue', e));

  // ---- wiring ------------------------------------------------------------

  // The studio remains initialized for a later manual Showcase unlock flow.
  studio.setMorphHandler((index) => morph.morphTo(index));
  studio.onMontageComplete(() => set('mode', 'race'));

  // Both expand controls open the same fullscreen card.
  specPanel.setExpandHandler((index) => fullscreenCard.openFullscreenCard(index));
  studio.setExpandHandler((index) => fullscreenCard.openFullscreenCard(index));

  // Replay resets route position and model, preserving session discoveries.
  finishScreen.setReplayHandler(() => {
    morph.resetMorph(0);
    set('activeCarIndex', 0);
  });

  scrollDrive.initScrollDrive();

  // Environment and HUD parallax remain independent of the race camera.
  window.addEventListener('pointermove', (e) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    environment.setParallax(x, y);
    hud.setCursor(x, y);
  }, { passive: true });

  // F opens Showcase Mode from anywhere in the race (SPEC §10.6). showcase.js owns its
  // own Escape/F-to-close handling; this is only the way in.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'f' && e.key !== 'F') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (showcase.isShowcaseOpen()) return;
    if (fullscreenCard.isFullscreenCardOpen()) return;
    showcase.openShowcase(state.activeCarIndex);
  });

  // ---- per-frame ---------------------------------------------------------
  let dispatchedApproachIndex = -1;
  let dispatchedApproachStep = -1;
  let dispatchedAudioApproachStep = -1;

  registerUpdate(scrollDrive.update);
  registerUpdate(carRig.update);
  registerUpdate(aerialCamera.update);
  registerUpdate(checkpoints.updateCheckpoints);
  registerUpdate(() => morph.morphTo(state.activeCarIndex));
  registerUpdate(morph.updateMorph);
  registerUpdate(theme.update);
  registerUpdate(finishLine.update);
  registerUpdate(studio.updateMontage);
  registerUpdate(showcase.updateShowcase);
  registerUpdate((dt) => {
    // Approach cue drives both the HUD badge and the rising ping.
    const approach = checkpoints.getApproach();
    const index = approach ? approach.index : -1;
    const proximity = approach ? approach.proximity : 0;
    const step = Math.round(proximity * 100) / 100;

    if (index !== dispatchedApproachIndex || step !== dispatchedApproachStep) {
      dispatchedApproachIndex = index;
      dispatchedApproachStep = step;
      // The legacy incoming card exposes a car identity before discovery.
      // Phase 3d owns its replacement; keep it idle in the Tour.
      hud.setApproach(null);
    }
    if (step !== dispatchedAudioApproachStep) {
      dispatchedAudioApproachStep = step;
      audio.setCoinApproach(proximity);
    }
  });
  registerUpdate(hud.update);
  registerUpdate(specPanel.update);
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

    // One of three views owns the screen. Showcase sits on top of everything; the
    // montage sits on top of the race; otherwise the race renders.
    if (showcase.isShowcaseOpen()) showcase.renderShowcase();
    else if (studio.isMontagePlaying()) studio.renderMontage();
    else sceneSetup.render(dt);

    requestAnimationFrame(frame);
  }

  console.info(`[gt3] ready — three r${THREE.REVISION}`);
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error('[gt3] boot failed', err);
});
