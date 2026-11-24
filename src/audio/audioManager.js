import { set, state, subscribe } from '../core/state.js';
import { playlist } from '../data/playlist.js';

const AUDIO_ROOT = '/audios/';

const RACE_FILES = Object.freeze({
  // Checkpoint crossing one-shot (SPEC §18).
  checkpointCross: 'checkpoint.mp3',
  coinApproach: 'coin_approach.mp3',
  engineStart: 'engine_start.mp3',
  finish: 'finish.mp3',
  idle: 'idle.mp3',
});

// One place for the mix (Phase 5, provisional; the owner judges by ear). Levels were set from
// measured asset loudness (gated RMS, 2026-11-04): playlist ≈ -9.8 dBFS → ≈ -17.3 dBFS after
// musicBase; per-sound keys match RACE_FILES, so swapping a sound = its filename + its level.
const MIX = Object.freeze({
  // Playlist bus level under everything else (unchanged).
  musicBase: 0.42,
  // Playlist lift while a montage plays (unchanged).
  musicMontageMultiplier: 1.15,
  // Playlist duck under Showcase narration (unchanged).
  musicVoiceMultiplier: 0.35,
  // Crossing one-shot: was ≈ 10 dB under the music and easily lost; now level with it (+8.3 dB).
  checkpointCross: 2.6,
  // Proximity loop at full proximity: ≈ 8 dB under the music (unchanged).
  coinApproach: 0.5,
  // Engine start: was ≈ 2 dB over the music; now ≈ 2 dB under it (-4.4 dB).
  engineStart: 0.6,
  // Engine-start fade into the idle loop (unchanged).
  engineStartFadeSeconds: 3,
  // Finish one-shot: brought level with the checkpoint (+1.6 dB).
  finish: 1.2,
  // Engine idle loop: was ≈ 13 dB under the music; now ≈ 7.5 dB under it (+4.8 dB).
  idle: 0.26,
  // Engine duck while a montage plays (unchanged).
  engineMontageMultiplier: 0.35,
});

const VOICE_FILES = Object.freeze([
  'voice_01_lexus.mp3',
  'voice_02_nissan.mp3',
  'voice_03_audi.mp3',
  'voice_04_bmw.mp3',
  'voice_05_mercedes.mp3',
  'voice_06_ferrari.mp3',
  'voice_07_mclaren.mp3',
  'voice_08_aston.mp3',
  'voice_09_lamborghini.mp3',
  'voice_10_porsche.mp3',
]);

const raceBuffers = Object.create(null);
const raceFailuresLogged = new Set();
const preloadListeners = new Set();
const voiceEntries = new Array(VOICE_FILES.length).fill(null);
const voiceEndedListeners = new Set();

let context = null;
let contextUnavailable = false;
let masterGain = null;
let masterLevelGain = null;
let musicBus = null;
let musicMuteGain = null;
let musicLevelGain = null;
let musicElement = null;
let musicRequestId = 0;
let lastPositionWriteAt = -Infinity;
let sfxBus = null;
let engineBus = null;
let engineLevelGain = null;
let voiceBus = null;

let preloadPromise = null;
let preloadCompleted = 0;
let startPromise = null;
let raceStarted = false;
let engineStartSource = null;
let idleSource = null;
let coinApproachSource = null;
let coinApproachGain = null;
let coinProximity = 0;
let idlePlaybackRate = 1;
const raceOneShots = new Set();

let montageActive = false;
let activeVoice = null;
let activeVoiceIndex = -1;
let voiceRequestId = 0;

function setInitialGain(node, value) {
  node.gain.setValueAtTime(value, context.currentTime);
}

function volumeGain(value) {
  return value * value;
}

function ensureGraph() {
  if (context) return true;
  if (contextUnavailable) return false;

  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) {
    contextUnavailable = true;
    return false;
  }

  try {
    context = new AudioContextClass();
    // audioReady means usable: drop it whenever the context stops running (device loss,
    // OS interruption, suspend). Only a successful startAudio() sets it true again.
    context.addEventListener('statechange', () => {
      if (context.state !== 'running') set('audioReady', false);
    });
    masterGain = context.createGain();
    masterLevelGain = context.createGain();
    musicBus = context.createGain();
    sfxBus = context.createGain();
    engineBus = context.createGain();
    engineLevelGain = context.createGain();
    voiceBus = context.createGain();

    setInitialGain(masterGain, state.masterMuted ? 0 : 1);
    setInitialGain(masterLevelGain, volumeGain(state.masterVolume));
    setInitialGain(musicBus, MIX.musicBase);
    setInitialGain(sfxBus, 1);
    setInitialGain(engineBus, 1);
    setInitialGain(engineLevelGain, volumeGain(state.engineVolume));
    setInitialGain(voiceBus, 1);

    musicBus.connect(masterGain);
    sfxBus.connect(masterGain);
    engineBus.connect(engineLevelGain);
    engineLevelGain.connect(masterGain);
    voiceBus.connect(masterGain);
    masterGain.connect(masterLevelGain);
    masterLevelGain.connect(context.destination);
    return true;
  } catch (error) {
    context = null;
    masterGain = null;
    masterLevelGain = null;
    musicBus = null;
    sfxBus = null;
    engineBus = null;
    engineLevelGain = null;
    voiceBus = null;
    contextUnavailable = true;
    console.debug('[audio] Web Audio is unavailable; continuing silently.', error);
    return false;
  }
}

function holdParameter(parameter, now) {
  if (typeof parameter.cancelAndHoldAtTime === 'function') {
    parameter.cancelAndHoldAtTime(now);
  } else {
    const currentValue = parameter.value;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(currentValue, now);
  }
}

function rampGain(node, target, duration) {
  if (!context || !node) return;
  const now = context.currentTime;
  holdParameter(node.gain, now);
  node.gain.linearRampToValueAtTime(target, now + Math.max(0.001, duration));
}

function targetGain(node, target, timeConstant = 0.03) {
  if (!context || !node) return;
  const now = context.currentTime;
  holdParameter(node.gain, now);
  node.gain.setTargetAtTime(target, now, timeConstant);
}

function reportPreloadProgress() {
  const progress = preloadCompleted / Object.keys(RACE_FILES).length;
  for (const listener of preloadListeners) {
    try {
      listener(progress, preloadCompleted, Object.keys(RACE_FILES).length);
    } catch (error) {
      console.debug('[audio] Preload progress callback failed.', error);
    }
  }
}

async function loadRaceBuffer(key, file) {
  try {
    const response = await fetch(`${AUDIO_ROOT}${file}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const encoded = await response.arrayBuffer();
    raceBuffers[key] = await context.decodeAudioData(encoded);
  } catch (error) {
    raceBuffers[key] = null;
    if (!raceFailuresLogged.has(key)) {
      raceFailuresLogged.add(key);
      console.debug(`[audio] Could not load ${AUDIO_ROOT}${file}.`, error);
    }
  } finally {
    preloadCompleted += 1;
    reportPreloadProgress();
  }
}

/** Fetch and decode the five race assets. Every asset settles independently. */
export function preloadAudio(onProgress) {
  if (typeof onProgress === 'function') preloadListeners.add(onProgress);

  if (preloadPromise) {
    reportPreloadProgress();
    return preloadPromise;
  }

  if (!ensureGraph()) {
    preloadCompleted = Object.keys(RACE_FILES).length;
    reportPreloadProgress();
    preloadPromise = Promise.resolve(raceBuffers);
    return preloadPromise;
  }

  reportPreloadProgress();
  preloadPromise = Promise.all(
    Object.entries(RACE_FILES).map(([key, file]) => loadRaceBuffer(key, file)),
  ).then(() => raceBuffers);
  return preloadPromise;
}

function makeLoop(buffer, destination) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(destination);
  source.start();
  return source;
}

function playOneShot(buffer, destination, gainValue = 1) {
  if (!raceStarted || !context || !buffer || !destination || context.state !== 'running') return;
  let source;
  let gain;
  try {
    gain = context.createGain();
    setInitialGain(gain, gainValue);
    gain.connect(destination);
    source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    raceOneShots.add(source);
    source.addEventListener('ended', () => {
      raceOneShots.delete(source);
      source.disconnect();
      gain.disconnect();
    }, { once: true });
    source.start();
  } catch (error) {
    raceOneShots.delete(source);
    source?.disconnect();
    gain?.disconnect();
    console.debug('[audio] Could not play a sound.', error);
  }
}

function stopCoinApproachLoop() {
  const source = coinApproachSource;
  const gain = coinApproachGain;
  coinApproachSource = null;
  coinApproachGain = null;

  if (source) {
    try {
      source.stop();
    } catch {
      // A source can already have ended while its cleanup is being requested.
    }
    try {
      source.disconnect();
    } catch {
      // It may already be disconnected by its ended handler.
    }
  }
  if (gain) {
    try {
      gain.disconnect();
    } catch {
      // Disconnect is deliberately idempotent here.
    }
  }
}

function startCoinApproachLoop() {
  if (
    coinApproachSource
    || coinProximity <= 0
    || !raceStarted
    || !context
    || context.state !== 'running'
    || !raceBuffers.coinApproach
  ) return;

  try {
    const gain = context.createGain();
    setInitialGain(gain, 0);
    gain.connect(sfxBus);

    const source = makeLoop(raceBuffers.coinApproach, gain);
    coinApproachGain = gain;
    coinApproachSource = source;
    source.addEventListener('ended', () => {
      if (coinApproachSource === source) {
        coinApproachSource = null;
        coinApproachGain = null;
      }
      source.disconnect();
      gain.disconnect();
    }, { once: true });
    targetGain(gain, coinProximity * MIX.coinApproach);
  } catch (error) {
    stopCoinApproachLoop();
    console.debug('[audio] Could not start the coin approach loop.', error);
  }
}

function startRaceSources() {
  if (!inTour() || raceStarted || !context || context.state !== 'running') return;
  raceStarted = true;
  const now = context.currentTime;

  if (raceBuffers.engineStart) {
    try {
      const startGain = context.createGain();
      setInitialGain(startGain, MIX.engineStart);
      startGain.connect(engineBus);
      const source = context.createBufferSource();
      engineStartSource = source;
      source.buffer = raceBuffers.engineStart;
      source.connect(startGain);
      startGain.gain.linearRampToValueAtTime(0, now + MIX.engineStartFadeSeconds);
      source.addEventListener('ended', () => {
        if (engineStartSource === source) engineStartSource = null;
        source.disconnect();
        startGain.disconnect();
      }, { once: true });
      source.start(now);
      source.stop(now + MIX.engineStartFadeSeconds + 0.05);
    } catch (error) {
      engineStartSource = null;
      console.debug('[audio] The engine-start sound could not start.', error);
    }
  }

  if (raceBuffers.idle) {
    try {
      const idleGain = context.createGain();
      setInitialGain(idleGain, 0);
      idleGain.connect(engineBus);
      idleSource = makeLoop(raceBuffers.idle, idleGain);
      const source = idleSource;
      source.addEventListener('ended', () => {
        source.disconnect();
        idleGain.disconnect();
      }, { once: true });
      idleGain.gain.linearRampToValueAtTime(MIX.idle, now + MIX.engineStartFadeSeconds);
    } catch (error) {
      idleSource = null;
      console.debug('[audio] The idle loop could not start.', error);
    }
  }

  startCoinApproachLoop();
}

function inTour() {
  return state.experience === 'tour' || state.experience === 'complete';
}

function stopRaceSources() {
  raceStarted = false;
  coinProximity = 0;
  stopCoinApproachLoop();
  const sources = [engineStartSource, idleSource, ...raceOneShots];
  engineStartSource = null;
  idleSource = null;
  raceOneShots.clear();
  idlePlaybackRate = 1;
  for (const source of sources) {
    if (!source) continue;
    try { source.stop(); } catch { /* Already stopped or ended. */ }
    try { source.disconnect(); } catch { /* Already disconnected. */ }
  }
  if (montageActive) {
    montageActive = false;
    rampGain(musicBus, desiredMusicGain(), 1.4);
    if (engineBus && context) {
      engineBus.gain.cancelScheduledValues(context.currentTime);
      engineBus.gain.setValueAtTime(1, context.currentTime);
    }
  }
}

function musicDuration() {
  const duration = musicElement?.duration;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function clampMusicTime(seconds) {
  const requested = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const duration = musicDuration();
  return duration === null ? requested : Math.min(requested, duration);
}

function saveMusicPosition() {
  if (!musicElement) return;
  set('trackPosition', clampMusicTime(musicElement.currentTime));
}

function tryPlayMusic() {
  if (!state.audioReady || !state.playIntent || !musicElement) return;
  try {
    const result = musicElement.play();
    void Promise.resolve(result).catch((error) => {
      if (error?.name !== 'AbortError') console.debug('[audio] Music could not play.', error);
    });
  } catch (error) {
    console.debug('[audio] Music could not play.', error);
  }
}

function loadSelectedTrack() {
  if (!musicElement) return;
  const requestId = ++musicRequestId;
  musicElement.pause();
  musicElement.src = playlist[state.trackIndex].src;
  musicElement.load();

  const restorePosition = () => {
    if (requestId !== musicRequestId) return;
    const clamped = clampMusicTime(state.trackPosition);
    try {
      musicElement.currentTime = clamped;
      set('trackPosition', clamped);
    } catch {
      // A failed media load may not allow seeking.
    }
  };
  musicElement.addEventListener('loadedmetadata', restorePosition, { once: true });
  // play() starts the media request; metadata then applies the saved, clamped position.
  tryPlayMusic();
}

function ensureMusicElement() {
  if (musicElement) return;
  musicMuteGain = context.createGain();
  musicLevelGain = context.createGain();
  setInitialGain(musicMuteGain, state.musicMuted ? 0 : 1);
  setInitialGain(musicLevelGain, volumeGain(state.musicVolume));
  musicMuteGain.connect(musicLevelGain);
  musicLevelGain.connect(musicBus);
  const element = new Audio();
  element.preload = 'auto';
  context.createMediaElementSource(element).connect(musicMuteGain);
  musicElement = element;
  musicElement.addEventListener('timeupdate', () => {
    if (musicElement.paused || musicElement.readyState < HTMLMediaElement.HAVE_METADATA) return;
    const now = performance.now();
    if (now - lastPositionWriteAt < 1000) return;
    lastPositionWriteAt = now;
    saveMusicPosition();
  });
  musicElement.addEventListener('ended', () => {
    if (state.playIntent) nextTrack();
  });
  loadSelectedTrack();
}

/** Open the autoplay gate; the current experience owns the race mix. Idempotent. */
export function startAudio() {
  // Reuse an attempt only while audio is actually usable. A failed trusted activation can
  // leave resume() pending, and a context can stop running after a successful start; in
  // both cases the next explicit control must retry.
  if (startPromise && context?.state === 'running' && state.audioReady) return startPromise;
  if (!ensureGraph()) return Promise.resolve(false);

  const attempt = (async () => {
    try {
      await context.resume();
      await preloadAudio();
      if (context.state !== 'running') return false;
      ensureMusicElement();
      targetGain(masterGain, state.masterMuted ? 0 : 1, 0.02);
      targetGain(musicMuteGain, state.musicMuted ? 0 : 1, 0.02);
      set('audioReady', true);
      startRaceSources();
      tryPlayMusic();
      return true;
    } catch (error) {
      console.debug('[audio] Audio could not be started; continuing silently.', error);
      return false;
    }
  })();
  startPromise = attempt;
  void attempt.then((started) => {
    if (!started && startPromise === attempt) {
      startPromise = null;
    }
  });

  return startPromise;
}

/** Short, restrained crossing sound for a checkpoint gate (SPEC §18). Never initializes audio. */
export function playCheckpointCross() {
  if (import.meta.env.DEV && globalThis.window) {
    // Harness evidence only (scripts/verify-preready-input.mjs): calls and whether audio could sound.
    const log = (window.__gt3SfxLog ??= { checkpointCross: 0, audible: 0 });
    log.checkpointCross += 1;
    if (raceStarted && context?.state === 'running') log.audible += 1;
  }
  stopCoinApproachLoop();
  coinProximity = 0;
  playOneShot(raceBuffers.checkpointCross, sfxBus, MIX.checkpointCross);
}

export function setCoinApproach(proximity) {
  if (!inTour()) return;
  const numeric = Number.isFinite(proximity) ? proximity : 0;
  coinProximity = Math.min(1, Math.max(0, numeric));

  if (coinProximity === 0) {
    stopCoinApproachLoop();
    return;
  }

  startCoinApproachLoop();
  if (coinApproachGain) targetGain(coinApproachGain, coinProximity * MIX.coinApproach);
}

export function playFinish() {
  stopCoinApproachLoop();
  coinProximity = 0;
  playOneShot(raceBuffers.finish, sfxBus, MIX.finish);
}

function desiredMusicGain() {
  if (activeVoice && !activeVoice.paused && !activeVoice.ended) {
    return MIX.musicBase * MIX.musicVoiceMultiplier;
  }
  return montageActive
    ? MIX.musicBase * MIX.musicMontageMultiplier
    : MIX.musicBase;
}

export function onMontageStart(carIndex) {
  void carIndex;
  if (!inTour()) return;
  montageActive = true;
  rampGain(musicBus, desiredMusicGain(), 1.2);
  rampGain(engineBus, MIX.engineMontageMultiplier, 1.2);
}

export function onMontageEnd() {
  if (!montageActive) return;
  montageActive = false;
  rampGain(musicBus, desiredMusicGain(), 1.4);
  rampGain(engineBus, 1, 1.4);
}

function voiceUrl(index) {
  return `${AUDIO_ROOT}voices/${VOICE_FILES[index]}`;
}

function markVoiceUnavailable(index, error) {
  const entry = voiceEntries[index];
  if (!entry || entry.failureLogged) return;
  entry.failureLogged = true;
  entry.available = false;
  console.debug(`[audio] Voice unavailable: ${voiceUrl(index)}.`, error);
}

function makeVoiceEntry(index) {
  const entry = {
    element: null,
    mediaSource: null,
    objectUrl: null,
    available: false,
    failureLogged: false,
    loading: null,
  };
  voiceEntries[index] = entry;
  return entry;
}

function attachVoiceEvents(index, entry) {
  const element = entry.element;
  element.addEventListener('error', () => {
    markVoiceUnavailable(index, element.error || new Error('Media decode failed'));
    if (activeVoice === element) {
      activeVoice = null;
      activeVoiceIndex = -1;
      rampGain(musicBus, desiredMusicGain(), 0.35);
    }
  });
  element.addEventListener('ended', () => {
    if (activeVoice === element) {
      activeVoice = null;
      activeVoiceIndex = -1;
      rampGain(musicBus, desiredMusicGain(), 0.35);
    }
    for (const listener of voiceEndedListeners) {
      try {
        listener(index);
      } catch (error) {
        console.debug('[audio] Voice-ended callback failed.', error);
      }
    }
  });
}

async function loadVoice(index) {
  if (!ensureGraph() || typeof globalThis.Audio !== 'function') return null;

  const entry = voiceEntries[index] || makeVoiceEntry(index);
  if (entry.available || entry.failureLogged) return entry;
  if (entry.loading) return entry.loading;

  entry.loading = (async () => {
    try {
      const response = await fetch(voiceUrl(index));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      entry.objectUrl = URL.createObjectURL(blob);
      entry.element = new globalThis.Audio();
      entry.element.preload = 'auto';
      entry.element.src = entry.objectUrl;
      entry.mediaSource = context.createMediaElementSource(entry.element);
      entry.mediaSource.connect(voiceBus);
      attachVoiceEvents(index, entry);
      entry.available = true;
    } catch (error) {
      markVoiceUnavailable(index, error);
    } finally {
      entry.loading = null;
    }
    return entry;
  })();

  return entry.loading;
}

function resetActiveVoice({ invalidateRequest = true } = {}) {
  if (invalidateRequest) voiceRequestId += 1;
  const element = activeVoice;
  activeVoice = null;
  activeVoiceIndex = -1;

  if (element) {
    try {
      element.pause();
      element.currentTime = 0;
    } catch {
      // A failed media load can make seeking unavailable.
    }
  }
  rampGain(musicBus, desiredMusicGain(), 0.35);
}

/** Lazily create and play the selected Showcase narration. */
export async function playVoice(carIndex) {
  const index = Number.isInteger(carIndex) ? carIndex : -1;
  if (index < 0 || index >= VOICE_FILES.length) return false;

  if (!state.audioReady || context?.state !== 'running') return false;

  resetActiveVoice({ invalidateRequest: false });
  const requestId = ++voiceRequestId;
  const entry = await loadVoice(index);
  if (!entry || !entry.element || !entry.available || requestId !== voiceRequestId) return false;

  activeVoice = entry.element;
  activeVoiceIndex = index;
  try {
    entry.element.currentTime = 0;
    const result = entry.element.play();
    rampGain(musicBus, MIX.musicBase * MIX.musicVoiceMultiplier, 0.35);
    try {
      await Promise.resolve(result);
      return activeVoice === entry.element;
    } catch (error) {
      if (activeVoice === entry.element) resetActiveVoice({ invalidateRequest: false });
      if (error?.name === 'NotSupportedError' || entry.element.error) {
        markVoiceUnavailable(index, error);
      }
      return false;
    }
  } catch (error) {
    resetActiveVoice({ invalidateRequest: false });
    markVoiceUnavailable(index, error);
    return false;
  }
}

export function pauseVoice() {
  if (!activeVoice || activeVoice.paused) return;
  try {
    activeVoice.pause();
  } catch {
    // Restore the mix even if the media element itself has failed.
  }
  rampGain(musicBus, desiredMusicGain(), 0.35);
}

export function resumeVoice() {
  if (!activeVoice || !activeVoice.paused || activeVoice.ended) return Promise.resolve(false);
  try {
    const element = activeVoice;
    const index = activeVoiceIndex;
    const result = element.play();
    rampGain(musicBus, MIX.musicBase * MIX.musicVoiceMultiplier, 0.35);
    return Promise.resolve(result).then(() => true).catch((error) => {
      if (activeVoice === element) rampGain(musicBus, desiredMusicGain(), 0.35);
      if (error?.name === 'NotSupportedError' || element.error) {
        markVoiceUnavailable(index, error);
      }
      return false;
    });
  } catch (error) {
    rampGain(musicBus, desiredMusicGain(), 0.35);
    if (error?.name === 'NotSupportedError' || activeVoice?.error) {
      markVoiceUnavailable(activeVoiceIndex, error);
    }
    return Promise.resolve(false);
  }
}

export function stopVoice() {
  resetActiveVoice();
}

export function isVoiceAvailable(index) {
  return Number.isInteger(index)
    && index >= 0
    && index < voiceEntries.length
    && voiceEntries[index]?.available === true;
}

export function onVoiceEnded(fn) {
  if (typeof fn !== 'function') return () => {};
  voiceEndedListeners.add(fn);
  return () => voiceEndedListeners.delete(fn);
}

export function setMasterMuted(muted) {
  set('masterMuted', Boolean(muted));
}

export function setMasterVolume(value) {
  if (!Number.isFinite(value)) return;
  set('masterVolume', Math.min(1, Math.max(0, value)));
}

export function isMuted() {
  return state.masterMuted;
}

export function setMusicMuted(muted) {
  set('musicMuted', Boolean(muted));
}

export function setMusicVolume(value) {
  if (!Number.isFinite(value)) return;
  set('musicVolume', Math.min(1, Math.max(0, value)));
}

export function setEngineVolume(value) {
  if (!Number.isFinite(value)) return;
  set('engineVolume', Math.min(1, Math.max(0, value)));
}

export function playMusic() {
  set('playIntent', true);
  if (!state.audioReady) return startAudio();
  tryPlayMusic();
  return Promise.resolve(true);
}

export function pauseMusic() {
  set('playIntent', false);
  if (musicElement) {
    musicElement.pause();
    saveMusicPosition();
  }
}

function changeTrack(index) {
  set('trackIndex', index);
  set('trackPosition', 0);
  lastPositionWriteAt = -Infinity;
  loadSelectedTrack();
}

export function nextTrack() {
  changeTrack((state.trackIndex + 1) % playlist.length);
}

export function previousTrack() {
  changeTrack((state.trackIndex + playlist.length - 1) % playlist.length);
}

export function selectTrack(index) {
  if (!Number.isInteger(index) || index < 0 || index >= playlist.length) return;
  set('playIntent', true);
  changeTrack(index);
  if (!state.audioReady) void startAudio();
}

export function seekMusic(seconds) {
  const position = clampMusicTime(seconds);
  if (musicElement) {
    try {
      musicElement.currentTime = position;
    } catch {
      // The requested position will be restored when metadata is available.
    }
  }
  set('trackPosition', position);
  lastPositionWriteAt = performance.now();
}

export function getMusicStatus() {
  return {
    trackIndex: state.trackIndex,
    id: playlist[state.trackIndex].id,
    currentTime: musicElement ? musicElement.currentTime : state.trackPosition,
    duration: musicDuration() ?? 0,
    playing: Boolean(state.audioReady && musicElement && !musicElement.paused && !musicElement.ended),
  };
}

subscribe('masterMuted', (muted) => targetGain(masterGain, muted ? 0 : 1, 0.02));
subscribe('musicMuted', (muted) => targetGain(musicMuteGain, muted ? 0 : 1, 0.02));
subscribe('masterVolume', (volume) => targetGain(masterLevelGain, volumeGain(volume), 0.03));
subscribe('musicVolume', (volume) => targetGain(musicLevelGain, volumeGain(volume), 0.03));
subscribe('engineVolume', (volume) => targetGain(engineLevelGain, volumeGain(volume), 0.03));
subscribe('experience', () => {
  if (inTour()) {
    if (state.audioReady) startRaceSources();
  } else {
    stopRaceSources();
  }
});

if (typeof window !== 'undefined') {
  window.__gt3audio = Object.freeze({
    gains: () => ({
      master: masterGain?.gain.value ?? null,
      masterLevel: masterLevelGain?.gain.value ?? null,
      music: musicBus?.gain.value ?? null,
      musicMute: musicMuteGain?.gain.value ?? null,
      musicLevel: musicLevelGain?.gain.value ?? null,
      engine: engineBus?.gain.value ?? null,
      engineLevel: engineLevelGain?.gain.value ?? null,
    }),
  });
}

/** Called from the app's existing RAF. Performs no per-frame allocation. */
export function updateAudio(dt) {
  if (!idleSource || !context || context.state !== 'running') return;
  const frameTime = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
  const speed = Math.min(1, Math.max(0, state.speed01));
  const targetRate = Math.min(1.25, Math.max(1, 1 + speed * 0.22));
  const smoothing = 1 - Math.exp(-8 * frameTime);
  idlePlaybackRate += (targetRate - idlePlaybackRate) * smoothing;
  idleSource.playbackRate.setTargetAtTime(idlePlaybackRate, context.currentTime, 0.045);
}
