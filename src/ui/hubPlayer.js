/**
 * hubPlayer.js — the Hub presentation of the one global player (SPEC §7, §9).
 *
 * A view over audioManager.js only. Its parts are flat siblings laid out by CSS grid, so the
 * track-list `+` can recompose the same object (SPEC §9 "recomposition, not growth"): the cover
 * recedes to a thumbnail, the six tracks take the space it frees, the outer bounds stay put.
 * GSAP Flip animates between the two layouts and reverses from wherever it is when toggled.
 * Two shapes serve the Hub directions: `row` (cover beside its controls) and `column`.
 *
 * Nothing here starts audio except play or a track choice, which already do in the compact
 * player (SPEC §10). Levels come from the shared audioLevels.js and never touch the context.
 */

import { createElement, Music4, Pause, Play, Plus, SkipBack, SkipForward, X } from 'lucide';
import {
  getMusicStatus, nextTrack, pauseMusic, playMusic, previousTrack, seekMusic, selectTrack, setMusicMuted,
} from '../audio/audioManager.js';
import { playlist } from '../data/playlist.js';
import { state } from '../core/state.js';
import { buildLevels } from './audioLevels.js';
import { Flip, gsap, reducedMotion } from './motion.js';

let root = null;
let parts = [];
let cover;
let list;
let label;
let clock;
let seek;
let playButton;
let muteButton;
let listButton;
let dragging = false;
let dragStartValue = null;
let listOpen = false;
let flip = null;
let coverToken = 0;
const shown = new Map();

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
    const reveal = () => { if (token === coverToken) cover.classList.remove('is-swapping'); };
    if (cover.complete) reveal();
    else {
      cover.addEventListener('load', reveal, { once: true });
      cover.addEventListener('error', reveal, { once: true });
    }
  };
  if (first || reducedMotion.matches) { swap(); return; }
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

function applyOpen(open) {
  listOpen = open;
  root.classList.toggle('is-list-open', open);
  list.inert = !open;
  listButton.setAttribute('aria-expanded', String(open));
  listButton.setAttribute('aria-label', open ? 'Hide track list' : 'Show track list');
}

/** Recompose with Flip; a toggle mid-flight starts from the current, in-between layout. */
function recompose(open) {
  if (reducedMotion.matches) { applyOpen(open); return; }
  const before = Flip.getState(parts);
  flip?.kill();
  gsap.killTweensOf(list.children);
  applyOpen(open);
  flip = Flip.from(before, {
    targets: parts,
    duration: open ? 0.52 : 0.42,
    ease: 'gt3.out',
    scale: true,
    absolute: true,
    onEnter: (els) => gsap.fromTo(els, { opacity: 0 }, { opacity: 1, duration: 0.3, delay: 0.16, ease: 'gt3' }),
    onLeave: (els) => gsap.to(els, { opacity: 0, duration: 0.14, ease: 'gt3' }),
    onComplete: () => { flip = null; },
  });
  if (open) {
    gsap.fromTo(list.children, { opacity: 0, x: -8 },
      { opacity: 1, x: 0, duration: 0.42, ease: 'gt3.out', stagger: 0.035, delay: 0.16 });
  }
}

export function initHubPlayer(container, { shape = 'column' } = {}) {
  if (root) return root;
  root = document.createElement('section');
  root.className = 'hub-player';
  root.dataset.shape = shape;
  root.setAttribute('aria-label', 'Music');

  cover = document.createElement('img');
  cover.className = 'hub-player__cover';
  cover.alt = '';
  cover.decoding = 'async';
  cover.draggable = false;

  list = document.createElement('ol');
  list.className = 'hub-player__list';
  list.id = 'hub-player-tracks';
  playlist.forEach((track, index) => {
    const item = document.createElement('li');
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
  const spacer = document.createElement('span');
  spacer.className = 'hub-player__spacer';
  transport.append(previous, playButton, next, spacer, muteButton, listButton);

  const levels = buildLevels({ className: 'hub-player__levels', prefix: 'hub-level', rangeClass: 'hub-range' });

  parts = [cover, list, meta, seek, transport, levels];
  root.append(...parts);
  container.append(root);
  applyOpen(false);

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
  flip?.kill();
  flip = null;
  gsap.set([...parts, ...list.children], { clearProps: 'all' });
  applyOpen(false);
}
