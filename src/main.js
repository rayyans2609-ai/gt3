/**
 * main.js — bootstrap, wiring and the single frame loop.
 *
 * OWNED BY THE MANAGER (integration). Modules do not know about each other; every
 * cross-module connection is made here, explicitly, so the data flow is readable in
 * one place. Modules expose `update(dt)` and injected handlers; main.js owns the graph.
 *
 * Update order is load-bearing:
 *   1. scrollDrive  — establishes state.progress for this frame
 *   2. carRig       — moves the rig to that progress, so the camera is correct
 *   3. world        — coins, time-of-day, finish gate react to the rig's new position
 *   4. morph        — body swap, must run after the rig has been placed
 *   5. ui           — reads final state
 *   6. sceneSetup   — camera FOV + post uniforms, which read the settled speed
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
  const cars = await import('./scene/cars.js');
  const coins = await import('./scene/coins.js');
  const morph = await import('./scene/morph.js');
  const theme = await import('./scene/theme.js');
  const finishLine = await import('./scene/finishLine.js');
  const studio = await import('./montage/studio.js');
  const audio = await import('./audio/audioManager.js');
  const hud = await import('./ui/hud.js');
  const specPanel = await import('./ui/specPanel.js');
  const themeToggle = await import('./ui/themeToggle.js');
  const soundControl = await import('./ui/soundControl.js');
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
  scene.add(coins.buildCoins());

  const rig = carRig.initCarRig(camera);
  scene.add(rig);
  sceneSetup.attachSunTarget(rig);

  morph.initMorph();
  theme.initTheme();
  studio.initStudio();
  showcase.initShowcase();
  fullscreenCard.initFullscreenCard();
  hud.initHUD();
  themeToggle.initThemeToggle();
  soundControl.initSoundControl();
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

  // Coin collected -> chime, spec panel, montage. The montage owns the morph: it fires
  // the swap on shot 5's crossfade so the car is already the new one when the race
  // returns (SPEC §10.7). Collecting therefore does NOT morph directly.
  coins.onCoinCollected((index) => {
    audio.playCoin();
    audio.setCoinApproach(0);

    const unlocked = new Set(state.unlocked);
    unlocked.add(index);
    set('unlocked', unlocked);

    specPanel.showSpecPanel(index);
    studio.playMontage(index);
  });

  studio.setMorphHandler((index) => morph.morphTo(index));
  studio.onMontageComplete(() => set('mode', 'race'));

  // Both expand controls open the same fullscreen card.
  specPanel.setExpandHandler((index) => fullscreenCard.openFullscreenCard(index));
  studio.setExpandHandler((index) => fullscreenCard.openFullscreenCard(index));

  // Replay: the screens own their own reset; coins and the car body are ours.
  finishScreen.setReplayHandler(() => {
    coins.resetAllCoins();
    const first = cars.getCarModel(0);
    if (first) {
      carRig.setCarModel(first);
      carRig.setWheels(cars.findWheels(first));
    }
    set('activeCarIndex', 0);
    set('unlocked', new Set());
  });

  scrollDrive.initScrollDrive();

  // Cursor parallax (SPEC §11) — a few degrees, nothing more.
  window.addEventListener('pointermove', (e) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;
    carRig.setCursor(x, y);
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
  let prewarmedApproachIndex = -1;

  registerUpdate(scrollDrive.update);
  registerUpdate(carRig.update);
  registerUpdate(coins.updateCoins);
  registerUpdate(morph.updateMorph);
  registerUpdate(theme.update);
  registerUpdate(finishLine.update);
  registerUpdate(studio.updateMontage);
  registerUpdate(showcase.updateShowcase);
  registerUpdate((dt) => {
    // Approach cue drives both the HUD badge and the rising ping.
    const approach = coins.getApproach();
    const index = approach ? approach.index : -1;
    const proximity = approach ? approach.proximity : 0;
    const step = Math.round(proximity * 100) / 100;

    if (index !== dispatchedApproachIndex || step !== dispatchedApproachStep) {
      dispatchedApproachIndex = index;
      dispatchedApproachStep = step;
      hud.setApproach(approach);
    }
    if (step !== dispatchedAudioApproachStep) {
      dispatchedAudioApproachStep = step;
      audio.setCoinApproach(proximity);
    }
    // Fire as early as the approach signal exists (proximity is 0 at the far edge of
    // the approach zone, 1 at the coin). The prewarm needs wall-clock time to link
    // programs and drip-feed 34 texture uploads; at 0.45 a fast charge at the coin left
    // it unfinished and the transition still stalled ~890ms. Measured at 0.05: see BUILD_LOG.
    if (index >= 0 && index !== prewarmedApproachIndex && proximity >= 0.05) {
      prewarmedApproachIndex = index;
      void studio.prewarmMontage(index).catch(() => {});
    }
  });
  registerUpdate(hud.update);
  registerUpdate(specPanel.update);
  registerUpdate(finishScreen.update);
  registerUpdate(audio.updateAudio);
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
