import { getMusicStatus, nextTrack, pauseMusic, playMusic, previousTrack, seekMusic, selectTrack, setMusicMuted } from '../audio/audioManager.js';
import { state, set, subscribe } from '../core/state.js';

let player;
let label;
let playButton;
let current;
let total;
let seek;
let musicMute;
let listButton;
let list;
let dragging = false;
let dragStartValue = null;
let listOpen = false;
let lastTrack = -1;
// Last values written to the DOM. renderStatus() runs every frame while the player is open,
// so it only touches the DOM when a displayed value actually changes.
const shown = new Map();

function show(key, value, write) {
  if (shown.get(key) === value) return;
  shown.set(key, value);
  write(value);
}

const icons = {
  previous: '<path d="M5 5v14M19 5 8 12l11 7z"/>',
  next: '<path d="M19 5v14M5 5l11 7L5 19z"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  pause: '<path d="M8 5v14m8-14v14"/>',
  music: '<path d="M9 18V5l11-2v13M9 10l11-2"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
};

function button(className, ariaLabel, icon) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `audio-control ${className}`;
  element.setAttribute('aria-label', ariaLabel);
  element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[icon]}</svg>`;
  return element;
}

function time(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function renderStatus() {
  const status = getMusicStatus();
  const duration = status.duration > 0 ? status.duration : 0;
  show('label', status.id, (v) => { label.textContent = v; });
  show('total', duration > 0 ? time(duration) : '--:--', (v) => { total.textContent = v; });
  show('seekDisabled', duration <= 0, (v) => { seek.disabled = v; });
  show('seekMax', String(duration), (v) => { seek.max = v; });
  if (!dragging) {
    // The thumb moves at most a pixel or two per second, so follow the displayed second.
    const second = Math.floor(Math.min(status.currentTime, duration || status.currentTime));
    show('current', time(second), (v) => { current.textContent = v; });
    show('seekValue', `${status.trackIndex}:${second}`, () => { seek.value = String(Math.min(status.currentTime, duration)); });
  }
  show('playing', status.playing, (playing) => {
    playButton.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
    playButton.setAttribute('aria-pressed', String(playing));
    playButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[playing ? 'pause' : 'play']}</svg>`;
  });
  show('musicMuted', state.musicMuted, (muted) => {
    musicMute.setAttribute('aria-pressed', String(muted));
    musicMute.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
  });
  if (lastTrack !== status.trackIndex) {
    lastTrack = status.trackIndex;
    for (const item of list.children) {
      const selected = Number(item.dataset.trackIndex) === lastTrack;
      item.classList.toggle('is-current', selected);
      item.setAttribute('aria-current', selected ? 'true' : 'false');
    }
  }
}

function renderOpen() {
  player.setAttribute('aria-hidden', String(!state.playerOpen));
  player.inert = !state.playerOpen;
  if (state.playerOpen) renderStatus();
  else if (player.contains(document.activeElement)) document.querySelector('.audio-launcher')?.focus();
}

export function initPlayer() {
  if (player) return player;
  const layer = document.getElementById('audio-layer');
  if (!layer) throw new Error('Expected #audio-layer');
  player = document.createElement('section');
  player.id = 'music-player';
  player.className = 'music-player';
  player.setAttribute('aria-label', 'Music player');

  const heading = document.createElement('div');
  heading.className = 'music-player__heading';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'music-player__eyebrow';
  eyebrow.textContent = 'NOW PLAYING';
  label = document.createElement('strong');
  label.className = 'music-player__track';
  heading.append(eyebrow, label);

  const transport = document.createElement('div');
  transport.className = 'music-player__transport';
  const previous = button('music-player__previous', 'Previous track', 'previous');
  playButton = button('music-player__play', 'Play music', 'play');
  const next = button('music-player__next', 'Next track', 'next');
  transport.append(previous, playButton, next);

  const timeline = document.createElement('div');
  timeline.className = 'music-player__timeline';
  current = document.createElement('span');
  current.className = 'music-player__time';
  seek = document.createElement('input');
  seek.className = 'music-player__seek';
  seek.type = 'range';
  seek.min = '0';
  seek.max = '0';
  seek.step = '0.1';
  seek.value = '0';
  seek.setAttribute('aria-label', 'Seek music');
  total = document.createElement('span');
  total.className = 'music-player__time';
  timeline.append(current, seek, total);

  const footer = document.createElement('div');
  footer.className = 'music-player__footer';
  musicMute = button('music-player__mute', 'Mute music', 'music');
  const listCaption = document.createElement('span');
  listCaption.textContent = 'TRACKS';
  listButton = document.createElement('button');
  listButton.type = 'button';
  listButton.className = 'audio-control music-player__list-toggle';
  listButton.textContent = '+';
  listButton.setAttribute('aria-label', 'Show track list');
  listButton.setAttribute('aria-controls', 'music-player-tracks');
  footer.append(musicMute, listCaption, listButton);

  list = document.createElement('div');
  list.id = 'music-player-tracks';
  list.className = 'music-player__list';
  list.inert = true;
  for (let i = 0; i < 6; i++) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'audio-control music-player__list-item';
    item.textContent = `track_${i + 1}`;
    item.dataset.trackIndex = String(i);
    item.addEventListener('click', () => { selectTrack(i); renderStatus(); });
    list.append(item);
  }
  player.append(heading, transport, timeline, footer, list);
  layer.append(player);

  previous.addEventListener('click', () => { previousTrack(); renderStatus(); });
  next.addEventListener('click', () => { nextTrack(); renderStatus(); });
  playButton.addEventListener('click', () => {
    if (getMusicStatus().playing) pauseMusic();
    else void playMusic();
    renderStatus();
  });
  musicMute.addEventListener('click', () => { setMusicMuted(!state.musicMuted); renderStatus(); });
  listButton.addEventListener('click', () => {
    listOpen = !listOpen;
    list.inert = !listOpen;
    player.classList.toggle('is-list-open', listOpen);
    listButton.setAttribute('aria-expanded', String(listOpen));
    listButton.setAttribute('aria-label', listOpen ? 'Hide track list' : 'Show track list');
  });
  listButton.setAttribute('aria-expanded', 'false');
  seek.addEventListener('input', () => {
    dragging = true;
    show('current', time(Number(seek.value)), (v) => { current.textContent = v; });
  });
  seek.addEventListener('change', () => {
    seekMusic(Number(seek.value));
    dragging = false;
    shown.delete('seekValue');
    renderStatus();
  });
  // A drag released at its starting value fires no 'change', so clear the drag on release.
  // A drag that moved keeps dragging until 'change' commits, so the commit is never lost.
  seek.addEventListener('pointerdown', () => { dragStartValue = seek.value; });
  const endDrag = () => {
    if (dragStartValue !== null && seek.value === dragStartValue) {
      dragging = false;
      shown.delete('seekValue');
    }
    dragStartValue = null;
  };
  seek.addEventListener('pointerup', endDrag);
  seek.addEventListener('pointercancel', endDrag);
  document.addEventListener('pointerdown', (event) => {
    if (state.playerOpen && !layer.contains(event.target)) set('playerOpen', false);
  });
  subscribe('playerOpen', renderOpen);
  subscribe('experience', (_, previous) => {
    if (previous !== state.experience) set('playerOpen', false);
  });
  subscribe('transition', (transition) => {
    if (transition !== null) set('playerOpen', false);
  });
  renderOpen();
  return player;
}

/** Called by the existing RAF. Status is read only while the player is open. */
export function updatePlayer() {
  if (state.playerOpen) renderStatus();
}
