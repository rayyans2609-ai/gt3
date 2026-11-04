/**
 * Hub player: one view over audioManager, with collapsed, expanded and listening
 * presentations. It deliberately owns no audio graph and no RAF; GSAP is driven
 * by motion.js' shared ticker.
 */
import { createElement, ChevronDown, ChevronUp, Music4, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide';
import {
  getMusicStatus, nextTrack, pauseMusic, playMusic, previousTrack, seekMusic, selectTrack, setMusicMuted,
} from '../audio/audioManager.js';
import { playlist } from '../data/playlist.js';
import { state, subscribe } from '../core/state.js';
import { buildLevels } from './audioLevels.js';
import { isMasterAudioPending, toggleMasterAudio } from './soundControl.js';
import { Flip, gsap, reducedMotion } from './motion.js';

let root = null;
let slot = null;
let listeningLayer = null;
let coverButton, coverImage, sheen, label, elapsed, duration, seek, playButton, musicMute, masterMute;
let expandButton, levelsButton, levels, trackList, closeButton, previous, next;
let presentation = 'collapsed';
let beforeListening = 'collapsed';
let levelsOpen = false;
let dragging = false;
let flip = null;
let emit = () => {};
let coverToken = 0;
let tiltX, tiltY;
const shown = new Map();

const writeIfChanged = (key, value, write) => {
  if (shown.get(key) === value) return;
  shown.set(key, value); write(value);
};
const icon = def => createElement(def, { 'stroke-width': 1.5, 'aria-hidden': 'true', focusable: 'false' });
const time = seconds => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
function button(className, ariaLabel, dataControl, ...icons) {
  const node = document.createElement('button');
  node.type = 'button'; node.className = `hub-player__control ${className}`;
  node.setAttribute('aria-label', ariaLabel);
  if (dataControl) node.dataset.control = dataControl;
  icons.forEach(def => node.append(icon(def)));
  return node;
}

function setCover(index) {
  const src = playlist[index]?.cover;
  if (!src || coverImage.dataset.src === src) return;
  const token = ++coverToken; const first = !coverImage.dataset.src;
  coverImage.dataset.src = src;
  const swap = () => {
    if (token !== coverToken) return;
    coverImage.src = src;
    const reveal = () => { if (token === coverToken) coverImage.classList.remove('is-swapping'); };
    if (coverImage.complete) reveal();
    else { coverImage.addEventListener('load', reveal, { once: true }); coverImage.addEventListener('error', reveal, { once: true }); }
  };
  if (first || reducedMotion.matches) swap();
  else { coverImage.classList.add('is-swapping'); window.setTimeout(swap, 140); }
}

function renderStatus() {
  if (!root) return;
  const status = getMusicStatus(); const total = Math.max(0, status.duration || 0);
  setCover(status.trackIndex);
  writeIfChanged('label', status.id, value => { label.textContent = value; });
  writeIfChanged('seek-max', String(total), value => { seek.max = value; seek.disabled = total <= 0; });
  if (!dragging) {
    const current = Math.min(status.currentTime, total || status.currentTime);
    writeIfChanged('time', `${Math.floor(current)}:${total}`, () => {
      elapsed.textContent = time(current); duration.textContent = total > 0 ? time(total) : '--:--';
      seek.value = String(current); seek.style.setProperty('--fill', total ? String(current / total) : '0');
    });
  }
  writeIfChanged('playing', status.playing, playing => {
    playButton.dataset.state = playing ? 'playing' : 'paused';
    playButton.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
    playButton.setAttribute('aria-pressed', String(playing)); root.classList.toggle('is-playing', playing);
  });
  writeIfChanged('music-muted', state.musicMuted, muted => {
    musicMute.setAttribute('aria-pressed', String(muted));
    musicMute.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music'); root.classList.toggle('is-music-muted', muted);
  });
  writeIfChanged('master-muted', `${state.masterMuted}:${state.audioReady}:${isMasterAudioPending()}`, () => {
    const pending = isMasterAudioPending(); const muted = state.masterMuted;
    masterMute.disabled = pending;
    masterMute.setAttribute('aria-pressed', String(!muted && state.audioReady));
    masterMute.setAttribute('aria-label', pending ? 'Starting sound' : !state.audioReady ? 'Start sound' : muted ? 'Unmute all sound' : 'Mute all sound');
    masterMute.dataset.sound = pending ? 'starting' : !state.audioReady ? 'idle' : muted ? 'muted' : 'on';
  });
  writeIfChanged('current-track', status.trackIndex, current => {
    [...trackList.children].forEach((row, index) => {
      const active = index === current; row.classList.toggle('is-current', active);
      row.firstChild.setAttribute('aria-current', active ? 'true' : 'false');
    });
  });
}

function setLevels(open) {
  levelsOpen = open;
  root.classList.toggle('is-levels-open', open);
  levels.hidden = !open;
  levelsButton.setAttribute('aria-expanded', String(open));
}
function applyPresentation(next) {
  presentation = next;
  root.dataset.hubPlayer = next;
  root.classList.toggle('is-expanded', next === 'expanded');
  root.classList.toggle('is-listening', next === 'listening');
  if (next === 'collapsed') setLevels(false);
  expandButton.setAttribute('aria-expanded', String(next === 'expanded'));
  expandButton.setAttribute('aria-label', next === 'expanded' ? 'Collapse music player' : 'Expand music player');
  trackList.inert = next === 'collapsed';
  root.inert = false;
}
function recompose(next) {
  if (next === presentation) return;
  const before = reducedMotion.matches ? null : Flip.getState(root);
  flip?.kill(); applyPresentation(next);
  if (before) flip = Flip.from(before, { duration: 0.58, ease: 'gt3.out', absolute: true, onComplete: () => { flip = null; } });
}
function moveToListening() {
  if (!root || presentation === 'listening') return;
  beforeListening = presentation;
  const before = reducedMotion.matches ? null : Flip.getState(root);
  listeningLayer.append(root); applyPresentation('listening'); listeningLayer.hidden = false;
  if (before) flip = Flip.from(before, { duration: 0.62, ease: 'gt3.out', absolute: true, onComplete: () => { flip = null; } });
  emit('listen', { previous: beforeListening });
}
function returnFromListening() {
  if (!root || presentation !== 'listening') return;
  const before = reducedMotion.matches ? null : Flip.getState(root);
  slot.append(root); applyPresentation(beforeListening); listeningLayer.hidden = true;
  if (before) flip = Flip.from(before, { duration: 0.46, ease: 'gt3.out', absolute: true, onComplete: () => { flip = null; } });
  emit('close-listening', { previous: beforeListening });
}
function pointerTilt(event) {
  if (reducedMotion.matches || !coverButton) return;
  const box = coverButton.getBoundingClientRect();
  const dx = event.clientX - (box.left + box.width / 2), dy = event.clientY - (box.top + box.height / 2);
  const distance = Math.hypot(dx, dy); const radius = 240;
  if (distance > radius) { tiltX(0); tiltY(0); return; }
  const max = root.dataset.variant === 'a' ? 2 : 5; const strength = (1 - distance / radius) * max;
  tiltX(-dy / radius * strength); tiltY(dx / radius * strength);
  sheen.style.setProperty('--sheen-x', `${50 + dx / Math.max(1, box.width) * 100}%`);
  sheen.style.setProperty('--sheen-y', `${50 + dy / Math.max(1, box.height) * 100}%`);
}

export function initHubPlayer(container, { variant = 'a', onEvent } = {}) {
  if (root) return root;
  slot = container; emit = typeof onEvent === 'function' ? onEvent : () => {};
  listeningLayer = document.createElement('div'); listeningLayer.id = 'hub-listening'; listeningLayer.hidden = true;
  listeningLayer.setAttribute('aria-label', 'Listening'); document.getElementById('hub').append(listeningLayer);
  root = document.createElement('section'); root.className = 'hub-player'; root.dataset.variant = variant; root.dataset.hubPlayer = 'collapsed'; root.setAttribute('aria-label', 'Music player');

  coverButton = document.createElement('button'); coverButton.type = 'button'; coverButton.className = 'hub-player__cover'; coverButton.dataset.control = 'cover'; coverButton.setAttribute('aria-label', 'Open listening view');
  coverImage = document.createElement('img'); coverImage.alt = ''; coverImage.decoding = 'async'; coverImage.draggable = false;
  sheen = document.createElement('span'); sheen.className = 'hub-player__sheen'; sheen.setAttribute('aria-hidden', 'true'); coverButton.append(coverImage, sheen);
  tiltX = gsap.quickTo(coverButton, 'rotationX', { duration: .22, ease: 'gt3' });
  tiltY = gsap.quickTo(coverButton, 'rotationY', { duration: .22, ease: 'gt3' });
  const meta = document.createElement('div'); meta.className = 'hub-player__meta'; label = document.createElement('strong'); label.className = 'hub-player__label';
  const clock = document.createElement('span'); clock.className = 'hub-player__clock'; elapsed = document.createElement('span'); duration = document.createElement('span'); clock.append(elapsed, duration); meta.append(label, clock);
  seek = document.createElement('input'); seek.type = 'range'; seek.className = 'hub-range hub-player__seek'; seek.dataset.control = 'seek'; seek.min = '0'; seek.max = '0'; seek.step = '.1'; seek.value = '0'; seek.setAttribute('aria-label', 'Seek music');
  const transport = document.createElement('div'); transport.className = 'hub-player__transport';
  previous = button('hub-player__previous', 'Previous track', null, SkipBack); playButton = button('hub-player__play', 'Play music', null, Play, Pause); next = button('hub-player__next', 'Next track', null, SkipForward);
  musicMute = button('hub-player__mute', 'Mute music', 'music-mute', Music4); masterMute = button('hub-player__master', 'Start sound', 'master-mute', Volume2, VolumeX); expandButton = button('hub-player__expand', 'Expand music player', null, ChevronDown, ChevronUp);
  transport.append(previous, playButton, next, musicMute, masterMute, expandButton);
  levelsButton = document.createElement('button'); levelsButton.type = 'button'; levelsButton.className = 'hub-player__levels-toggle'; levelsButton.dataset.control = 'levels'; levelsButton.textContent = 'Levels'; levelsButton.setAttribute('aria-expanded', 'false');
  levels = buildLevels({ className: 'hub-player__levels', prefix: 'hub-level', rangeClass: 'hub-range' }); levels.hidden = true;
  trackList = document.createElement('ol'); trackList.className = 'hub-player__list'; trackList.dataset.control = 'track-list';
  playlist.forEach((track, index) => { const row = document.createElement('li'); const trackButton = document.createElement('button'); trackButton.type = 'button'; trackButton.dataset.track = String(index + 1); trackButton.textContent = track.id; trackButton.addEventListener('click', () => { selectTrack(index); renderStatus(); }); row.append(trackButton); trackList.append(row); });
  closeButton = button('hub-player__close', 'Close listening view', 'listening-close', X);
  root.append(coverButton, meta, seek, transport, levelsButton, levels, trackList, closeButton); slot.append(root); applyPresentation('collapsed'); renderStatus();
  previous.addEventListener('click', () => { previousTrack(); renderStatus(); }); next.addEventListener('click', () => { nextTrack(); renderStatus(); });
  playButton.addEventListener('click', () => { if (getMusicStatus().playing) pauseMusic(); else void playMusic(); renderStatus(); });
  musicMute.addEventListener('click', () => { setMusicMuted(!state.musicMuted); renderStatus(); });
  masterMute.addEventListener('click', async () => { const pending = toggleMasterAudio(); shown.delete('master-muted'); renderStatus(); await pending; shown.delete('master-muted'); renderStatus(); });
  expandButton.addEventListener('click', () => recompose(presentation === 'expanded' ? 'collapsed' : 'expanded'));
  levelsButton.addEventListener('click', () => setLevels(!levelsOpen)); coverButton.addEventListener('click', moveToListening); closeButton.addEventListener('click', returnFromListening);
  seek.addEventListener('input', () => { dragging = true; const max = Number(seek.max) || 0; seek.style.setProperty('--fill', max ? String(Number(seek.value) / max) : '0'); elapsed.textContent = time(Number(seek.value)); });
  seek.addEventListener('change', () => { seekMusic(Number(seek.value)); dragging = false; shown.delete('time'); renderStatus(); });
  root.addEventListener('keydown', event => { if (event.key === 'Escape' && presentation === 'listening') { event.preventDefault(); returnFromListening(); } });
  document.addEventListener('pointermove', pointerTilt, { passive: true });
  subscribe('masterMuted', () => { shown.delete('master-muted'); renderStatus(); }); subscribe('audioReady', () => { shown.delete('master-muted'); renderStatus(); }); subscribe('musicMuted', renderStatus); subscribe('trackIndex', renderStatus);
  return root;
}
export function updateHubPlayer() { renderStatus(); }
export function resetHubPlayer() { if (!root) return; flip?.kill(); flip = null; if (presentation === 'listening') { slot.append(root); listeningLayer.hidden = true; } applyPresentation('collapsed'); setLevels(false); gsap.set(root, { clearProps: 'transform,opacity' }); }
export function closeHubListening() { returnFromListening(); }
export function getHubPlayerDebug() { return { presentation, levelsOpen, listening: presentation === 'listening', track: getMusicStatus().trackIndex }; }
