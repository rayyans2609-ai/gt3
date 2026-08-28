import { state } from '../core/state.js';

const AUDIO_ROOT = '/audios/';
const MUSIC_BASE_GAIN = 0.42;
const MUSIC_MONTAGE_GAIN = MUSIC_BASE_GAIN * 1.15;
const MUSIC_VOICE_GAIN = MUSIC_BASE_GAIN * 0.35;
const IDLE_GAIN = 0.15;

const RACE_FILES = Object.freeze({
  background: 'background.mp3',
  coin: 'coin.mp3',
  coinApproach: 'coin_approach.mp3',
  engineStart: 'engine_start.mp3',
  finish: 'finish.mp3',
  idle: 'idle.mp3',
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
let musicBus = null;
let sfxBus = null;
let engineBus = null;
let voiceBus = null;

let preloadPromise = null;
let preloadCompleted = 0;
let startPromise = null;
let gestureRetryListenersInstalled = false;
let raceStarted = false;
let backgroundSource = null;
let engineStartSource = null;
let idleSource = null;
let coinApproachSource = null;
let coinApproachGain = null;
let coinProximity = 0;
let idlePlaybackRate = 1;

let montageActive = false;
let masterMuted = false;
let activeVoice = null;
let activeVoiceIndex = -1;
let voiceRequestId = 0;

function retryAudioOnGesture() {
  void startAudio();
}

function installGestureRetryListeners() {
  if (gestureRetryListenersInstalled || typeof window === 'undefined') return;

  window.addEventListener('pointerdown', retryAudioOnGesture, { passive: true });
  window.addEventListener('keydown', retryAudioOnGesture, { passive: true });
  window.addEventListener('touchstart', retryAudioOnGesture, { passive: true });
  gestureRetryListenersInstalled = true;
}

function removeGestureRetryListeners() {
  if (!gestureRetryListenersInstalled || typeof window === 'undefined') return;

  window.removeEventListener('pointerdown', retryAudioOnGesture);
  window.removeEventListener('keydown', retryAudioOnGesture);
  window.removeEventListener('touchstart', retryAudioOnGesture);
  gestureRetryListenersInstalled = false;
}

function setInitialGain(node, value) {
  node.gain.setValueAtTime(value, context.currentTime);
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
    masterGain = context.createGain();
    musicBus = context.createGain();
    sfxBus = context.createGain();
    engineBus = context.createGain();
    voiceBus = context.createGain();

    setInitialGain(masterGain, masterMuted ? 0 : 1);
    setInitialGain(musicBus, MUSIC_BASE_GAIN);
    setInitialGain(sfxBus, 1);
    setInitialGain(engineBus, 1);
    setInitialGain(voiceBus, 1);

    musicBus.connect(masterGain);
    sfxBus.connect(masterGain);
    engineBus.connect(masterGain);
    voiceBus.connect(masterGain);
    masterGain.connect(context.destination);
    return true;
  } catch (error) {
    context = null;
    masterGain = null;
    musicBus = null;
    sfxBus = null;
    engineBus = null;
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

/** Fetch and decode the six race assets. Every asset settles independently. */
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

function playOneShot(buffer, destination) {
  if (!raceStarted || !context || !buffer || !destination || context.state !== 'running') return;
  try {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    source.addEventListener('ended', () => source.disconnect(), { once: true });
    source.start();
  } catch (error) {
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
    targetGain(gain, coinProximity * 0.5);
  } catch (error) {
    stopCoinApproachLoop();
    console.debug('[audio] Could not start the coin approach loop.', error);
  }
}

function startRaceSources() {
  if (raceStarted || !context || context.state !== 'running') return;
  raceStarted = true;
  const now = context.currentTime;

  if (raceBuffers.background) {
    try {
      backgroundSource = makeLoop(raceBuffers.background, musicBus);
    } catch (error) {
      console.debug('[audio] The background loop could not start.', error);
    }
  }

  if (raceBuffers.engineStart) {
    try {
      const startGain = context.createGain();
      setInitialGain(startGain, 1);
      startGain.connect(engineBus);
      engineStartSource = context.createBufferSource();
      engineStartSource.buffer = raceBuffers.engineStart;
      engineStartSource.connect(startGain);
      startGain.gain.linearRampToValueAtTime(0, now + 3);
      engineStartSource.addEventListener('ended', () => {
        engineStartSource = null;
        startGain.disconnect();
      }, { once: true });
      engineStartSource.start(now);
      engineStartSource.stop(now + 3.05);
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
      idleGain.gain.linearRampToValueAtTime(IDLE_GAIN, now + 3);
    } catch (error) {
      idleSource = null;
      console.debug('[audio] The idle loop could not start.', error);
    }
  }

  startCoinApproachLoop();
}

/** Open the autoplay gate and begin the continuous race mix. Idempotent. */
export function startAudio() {
  if (startPromise) return startPromise;
  installGestureRetryListeners();
  if (!ensureGraph()) return Promise.resolve(false);

  const attempt = (async () => {
    try {
      await context.resume();
      await preloadAudio();
      if (context.state !== 'running') return false;
      startRaceSources();
      return true;
    } catch (error) {
      console.debug('[audio] Audio could not be started; continuing silently.', error);
      return false;
    }
  })();
  startPromise = attempt;
  void attempt.then((started) => {
    if (started) {
      removeGestureRetryListeners();
    } else if (startPromise === attempt) {
      startPromise = null;
    }
  });

  return startPromise;
}

export function playCoin() {
  stopCoinApproachLoop();
  coinProximity = 0;
  playOneShot(raceBuffers.coin, sfxBus);
}

export function setCoinApproach(proximity) {
  const numeric = Number.isFinite(proximity) ? proximity : 0;
  coinProximity = Math.min(1, Math.max(0, numeric));

  if (coinProximity === 0) {
    stopCoinApproachLoop();
    return;
  }

  startCoinApproachLoop();
  if (coinApproachGain) targetGain(coinApproachGain, coinProximity * 0.5);
}

export function playFinish() {
  stopCoinApproachLoop();
  coinProximity = 0;
  playOneShot(raceBuffers.finish, sfxBus);
}

function desiredMusicGain() {
  if (activeVoice && !activeVoice.paused && !activeVoice.ended) return MUSIC_VOICE_GAIN;
  return montageActive ? MUSIC_MONTAGE_GAIN : MUSIC_BASE_GAIN;
}

export function onMontageStart(carIndex) {
  void carIndex;
  montageActive = true;
  rampGain(musicBus, desiredMusicGain(), 1.2);
  rampGain(engineBus, 0.35, 1.2);
}

export function onMontageEnd() {
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

  // Opening Showcase IS the user gesture that starts audio, so the two race: the
  // overlay opens synchronously while startAudio() is still resuming the context and
  // preloading. Bailing here used to leave voiceEntries[index] unpopulated, which made
  // isVoiceAvailable() false and DISABLED the play button until the card was reopened.
  // startAudio() is memoized, so this awaits the in-flight attempt rather than starting
  // a second one; with no user activation it resolves false and we bail as before.
  if (!raceStarted) {
    await startAudio();
    if (!raceStarted) return false;
  }

  resetActiveVoice({ invalidateRequest: false });
  const requestId = ++voiceRequestId;
  const entry = await loadVoice(index);
  if (!entry || !entry.element || !entry.available || requestId !== voiceRequestId) return false;

  activeVoice = entry.element;
  activeVoiceIndex = index;
  try {
    entry.element.currentTime = 0;
    const result = entry.element.play();
    rampGain(musicBus, MUSIC_VOICE_GAIN, 0.35);
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
    rampGain(musicBus, MUSIC_VOICE_GAIN, 0.35);
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
  masterMuted = Boolean(muted);
  if (!ensureGraph()) return;
  targetGain(masterGain, masterMuted ? 0 : 1, 0.02);
}

export function isMuted() {
  return masterMuted;
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
