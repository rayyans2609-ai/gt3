import { state, subscribe } from '../core/state.js';

/**
 * First-Tour-entry sound cue (SPEC §10): a small "Sound" label with a fine pointer
 * line above the audio anchor. Purely visual -- it never initializes audio.
 *
 * Shown once per browser session, only when the Tour has actually started (main
 * wires showSoundCue to the start screen's dismissal-complete signal) and audio is
 * off or unusable. Retired by any engagement with either Sound control (speaker
 * or launcher, including before Tour entry), by audio becoming usable, by the
 * player opening, or after a timeout.
 */

const SEEN_KEY = 'gt3:soundCueSeen';
const VISIBLE_MS = 6000;
const LEAVE_MS = 260;

let layer = null;
let cue = null;
let retired = false;
let hideTimer = 0;
let removeTimer = 0;

function seen() {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

function markSeen() {
  try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* storage unavailable: the in-memory flag still holds */ }
}

function retire() {
  if (retired) return;
  retired = true;
  markSeen();
  window.clearTimeout(hideTimer);
  if (!cue) return;
  cue.classList.remove('is-visible');
  const node = cue;
  cue = null;
  window.clearTimeout(removeTimer);
  removeTimer = window.setTimeout(() => node.remove(), LEAVE_MS);
}

/** Wire retirement listeners. Safe before the Tour starts; call after initSoundControl. */
export function initSoundCue() {
  if (layer) return;
  layer = document.getElementById('audio-layer');
  if (!layer) throw new Error('Expected #audio-layer');
  layer.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.audio-speaker, .audio-launcher')) retire();
  }, true);
  subscribe('audioReady', (ready) => { if (ready) retire(); });
  subscribe('playerOpen', (open) => { if (open) retire(); });
}

/** Start the cue now if eligible. Called once, on dismissal-complete. */
export function showSoundCue() {
  if (!layer || retired || cue || seen()) return;
  if (state.audioReady || state.playerOpen) return;
  markSeen();
  cue = document.createElement('div');
  cue.className = 'sound-cue';
  cue.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'sound-cue__label';
  label.textContent = 'Sound';
  const line = document.createElement('span');
  line.className = 'sound-cue__line';
  cue.append(label, line);
  layer.append(cue);
  // Force a style flush so the fade-in transition runs from the hidden state.
  void cue.offsetWidth;
  cue.classList.add('is-visible');
  hideTimer = window.setTimeout(retire, VISIBLE_MS);
}
