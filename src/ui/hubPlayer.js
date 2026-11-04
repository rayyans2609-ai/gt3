/**
 * hubPlayer.js — the Hub presentation of the one global player (SPEC §7, §9).
 *
 * Same engine as the compact player (audioManager.js); this module is only a view. The cover
 * art rests on the Hub's start line; transport, seek and levels sit below it. Opening the
 * track list recomposes the same object instead of growing it: the cover recedes to a small
 * thumbnail and the six tracks take the space it left (SPEC §9 "recomposition, not growth").
 *
 * Nothing here can start audio except an explicit control press that already starts it in the
 * compact player (play or a track choice, SPEC §10). Volume levels never touch the context.
 */

import { createElement, Music4, Pause, Play, Plus, SkipBack, SkipForward, X } from 'lucide';
import {
  getMusicStatus, nextTrack, pauseMusic, playMusic, previousTrack, seekMusic, selectTrack,
  setEngineVolume, setMasterVolume, setMusicMuted, setMusicVolume,
} from '../audio/audioManager.js';
import { playlist } from '../data/playlist.js';
import { state, subscribe } from '../core/state.js';

const EASE = 'cubic-bezier(.22, .61, .36, 1)';
const OPEN_MS = 420;
const CLOSE_MS = 340;

let root = null;
let art;
let cover;
let coverToken = 0;
let list;
let label;
let clock;
let seek;
let playButton;
let muteButton;
let listButton;
let masterSlider;
let musicSlider;
let engineSlider;
let dragging = false;
let dragStartValue = null;
let listOpen = false;
let coverAnimation = null;
const shown = new Map();
const reduceMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

function show(key, value, write) {
  if (shown.get(key) === value) return;
  shown.set(key, value);
  write(value);
}

function icon(def) {
  return createElement(def, { 'stroke-width': 1.5, 'aria-hidden': 'true', focusable: 'false' });
}

function control(className, ariaLabel, ...icons) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `hub-player__control ${className}`;
  button.setAttribute('aria-label', ariaLabel);
  for (const def of icons) button.append(icon(def));
  return button;
}

function time(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function level(name, ariaLabel, initial, onInput) {
  const wrap = document.createElement('label');
  wrap.className = 'hub-level';
  const text = document.createElement('span');
  text.className = 'hub-level__name';
  text.textContent = name;
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'hub-range hub-level__input';
  input.min = '0';
  input.max = '1';
  input.step = '0.01';
  input.value = String(initial);
  input.setAttribute('aria-label', ariaLabel);
  input.style.setProperty('--fill', String(initial));
  input.addEventListener('input', () => {
    input.style.setProperty('--fill', input.value);
    onInput(Number(input.value));
  });
  wrap.append(text, input);
  return { wrap, input };
}

function syncLevel(input, value) {
  if (Number(input.value) === value) return;
  input.value = String(value);
  input.style.setProperty('--fill', String(value));
}

/** Swap the artwork without a hard cut: a short dip, the new image, a short rise. */
function setCover(index) {
  const src = playlist[index]?.cover;
  if (!src || cover.dataset.src === src) return;
  const token = ++coverToken;
  const first = !cover.dataset.src;
  cover.dataset.src = src;
  const swap = () => {
    if (token !== coverToken) return;
    cover.src = src;
    const reveal = () => {
      if (token !== coverToken) return;
      cover.classList.remove('is-swapping');
    };
    if (cover.complete) reveal();
    else {
      cover.addEventListener('load', reveal, { once: true });
      cover.addEventListener('error', reveal, { once: true });
    }
  };
  if (first || reduceMotion?.matches) { swap(); return; }
  cover.classList.add('is-swapping');
  window.setTimeout(swap, 140);
}

function renderStatus() {
  const status = getMusicStatus();
  const duration = status.duration > 0 ? status.duration : 0;
  setCover(status.trackIndex);
  show('label', status.id, (v) => { label.textContent = v; });
  show('seekDisabled', duration <= 0, (v) => { seek.disabled = v; });
  show('seekMax', String(duration), (v) => { seek.max = v; });
  if (!dragging) {
    const second = Math.floor(Math.min(status.currentTime, duration || status.currentTime));
    show('clock', `${time(second)}|${duration > 0 ? time(duration) : '--:--'}`, (v) => {
      const [now, total] = v.split('|');
      clock.firstChild.textContent = now;
      clock.lastChild.textContent = total;
    });
    show('seekValue', `${status.trackIndex}:${second}:${duration}`, () => {
      const value = Math.min(status.currentTime, duration);
      seek.value = String(value);
      seek.style.setProperty('--fill', duration > 0 ? String(value / duration) : '0');
    });
  }
  show('playing', status.playing, (playing) => {
    playButton.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
    playButton.setAttribute('aria-pressed', String(playing));
    playButton.dataset.state = playing ? 'playing' : 'paused';
    root.classList.toggle('is-playing', playing);
  });
  show('musicMuted', state.musicMuted, (muted) => {
    muteButton.setAttribute('aria-pressed', String(muted));
    muteButton.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
    root.classList.toggle('is-music-muted', muted);
  });
  show('track', status.trackIndex, (current) => {
    for (const item of list.children) {
      const button = item.firstChild;
      const selected = Number(button.dataset.trackIndex) === current;
      item.classList.toggle('is-current', selected);
      button.setAttribute('aria-current', selected ? 'true' : 'false');
    }
  });
}

/**
 * FLIP the cover between its two compositions. The first rect is read from wherever the
 * cover is drawn right now, so a toggle mid-animation reverses from that point, never snaps.
 */
function recompose(open) {
  const first = cover.getBoundingClientRect();
  coverAnimation?.cancel();
  listOpen = open;
  root.classList.toggle('is-list-open', open);
  list.inert = !open;
  listButton.setAttribute('aria-expanded', String(open));
  listButton.setAttribute('aria-label', open ? 'Hide track list' : 'Show track list');
  if (reduceMotion?.matches || typeof cover.animate !== 'function') return;
  const last = cover.getBoundingClientRect();
  if (!last.width || !first.width) return;
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / last.width;
  const sy = first.height / last.height;
  coverAnimation = cover.animate([
    { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
    { transformOrigin: '0 0', transform: 'none' },
  ], { duration: open ? OPEN_MS : CLOSE_MS, easing: EASE });
  coverAnimation.onfinish = () => { coverAnimation = null; };
}

export function initHubPlayer(container) {
  if (root) return root;
  root = document.createElement('section');
  root.className = 'hub-player';
  root.setAttribute('aria-label', 'Music');

  // ---- above the line: artwork, or thumbnail + track list ----
  art = document.createElement('div');
  art.className = 'hub-player__art';
  cover = document.createElement('img');
  cover.className = 'hub-player__cover';
  cover.alt = '';
  cover.decoding = 'async';
  cover.draggable = false;
  list = document.createElement('ol');
  list.className = 'hub-player__list';
  list.id = 'hub-player-tracks';
  list.inert = true;
  playlist.forEach((track, index) => {
    const item = document.createElement('li');
    item.style.setProperty('--i', String(index));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hub-player__track';
    button.dataset.trackIndex = String(index);
    const name = document.createElement('span');
    name.textContent = track.id;
    const bars = document.createElement('span');
    bars.className = 'hub-player__eq';
    bars.setAttribute('aria-hidden', 'true');
    bars.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
    button.append(name, bars);
    button.addEventListener('click', () => { selectTrack(index); renderStatus(); });
    item.append(button);
    list.append(item);
  });
  art.append(cover, list);

  // ---- below the line: label + clock, seek, transport, levels ----
  const body = document.createElement('div');
  body.className = 'hub-player__body';

  const meta = document.createElement('div');
  meta.className = 'hub-player__meta';
  label = document.createElement('strong');
  label.className = 'hub-player__label';
  clock = document.createElement('span');
  clock.className = 'hub-player__clock';
  clock.append(document.createElement('span'), document.createElement('span'));
  meta.append(label, clock);

  seek = document.createElement('input');
  seek.type = 'range';
  seek.className = 'hub-range hub-player__seek';
  seek.min = '0';
  seek.max = '0';
  seek.step = '0.1';
  seek.value = '0';
  seek.setAttribute('aria-label', 'Seek music');

  const transport = document.createElement('div');
  transport.className = 'hub-player__transport';
  const previous = control('hub-player__previous', 'Previous track', SkipBack);
  playButton = control('hub-player__play', 'Play music', Play, Pause);
  const next = control('hub-player__next', 'Next track', SkipForward);
  muteButton = control('hub-player__mute', 'Mute music', Music4);
  listButton = control('hub-player__list-toggle', 'Show track list', Plus, X);
  listButton.setAttribute('aria-controls', list.id);
  listButton.setAttribute('aria-expanded', 'false');
  const spacer = document.createElement('span');
  spacer.className = 'hub-player__spacer';
  transport.append(previous, playButton, next, spacer, muteButton, listButton);

  const levels = document.createElement('div');
  levels.className = 'hub-player__levels';
  const master = level('Master', 'Master volume', state.masterVolume, setMasterVolume);
  const music = level('Music', 'Music volume', state.musicVolume, setMusicVolume);
  // Engine is heard only in the Grand Tour (SPEC §10); its level is set here for the next drive.
  const engine = level('Engine', 'Engine volume', state.engineVolume, setEngineVolume);
  masterSlider = master.input;
  musicSlider = music.input;
  engineSlider = engine.input;
  levels.append(master.wrap, music.wrap, engine.wrap);

  body.append(meta, seek, transport, levels);
  root.append(art, body);
  container.append(root);

  previous.addEventListener('click', () => { previousTrack(); renderStatus(); });
  next.addEventListener('click', () => { nextTrack(); renderStatus(); });
  playButton.addEventListener('click', () => {
    if (getMusicStatus().playing) pauseMusic();
    else void playMusic();
    renderStatus();
  });
  muteButton.addEventListener('click', () => { setMusicMuted(!state.musicMuted); renderStatus(); });
  listButton.addEventListener('click', () => recompose(!listOpen));
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && listOpen) {
      recompose(false);
      listButton.focus();
    }
  });

  seek.addEventListener('input', () => {
    dragging = true;
    const max = Number(seek.max) || 0;
    seek.style.setProperty('--fill', max > 0 ? String(Number(seek.value) / max) : '0');
    clock.firstChild.textContent = time(Number(seek.value));
  });
  seek.addEventListener('change', () => {
    seekMusic(Number(seek.value));
    dragging = false;
    shown.delete('seekValue');
    shown.delete('clock');
    renderStatus();
  });
  seek.addEventListener('pointerdown', () => { dragStartValue = seek.value; });
  const endDrag = () => {
    if (dragStartValue !== null && seek.value === dragStartValue) {
      dragging = false;
      shown.delete('seekValue');
      shown.delete('clock');
    }
    dragStartValue = null;
  };
  seek.addEventListener('pointerup', endDrag);
  seek.addEventListener('pointercancel', endDrag);

  subscribe('masterVolume', (value) => syncLevel(masterSlider, value));
  subscribe('musicVolume', (value) => syncLevel(musicSlider, value));
  subscribe('engineVolume', (value) => syncLevel(engineSlider, value));
  renderStatus();
  return root;
}

/** Per frame while the Hub is on screen (main.js RAF); writes only changed values. */
export function updateHubPlayer() {
  if (root) renderStatus();
}

/** Leaving the Hub resets the list to its resting composition (SPEC §25 player-state rule). */
export function resetHubPlayer() {
  if (!root || !listOpen) return;
  coverAnimation?.cancel();
  coverAnimation = null;
  listOpen = false;
  root.classList.remove('is-list-open');
  list.inert = true;
  listButton.setAttribute('aria-expanded', 'false');
  listButton.setAttribute('aria-label', 'Show track list');
}
