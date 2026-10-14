import { setMasterMuted, startAudio } from '../audio/audioManager.js';
import { state, set, subscribe } from '../core/state.js';

let layer;
let speaker;
let launcher;
let pending = false;

const speakerIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="speaker-wave" d="M16 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/><path class="speaker-slash" d="M17 9l5 6m0-6l-5 6"/></svg>`;

function render() {
  if (!speaker) return;
  const condition = pending ? 'starting' : !state.audioReady ? 'idle' : state.masterMuted ? 'muted' : 'on';
  speaker.dataset.sound = condition;
  speaker.setAttribute('aria-label', {
    starting: 'Starting sound', idle: 'Start sound', muted: 'Unmute all sound', on: 'Mute all sound',
  }[condition]);
  speaker.setAttribute('aria-pressed', String(condition === 'on'));
  speaker.disabled = pending;
  launcher.setAttribute('aria-expanded', String(state.playerOpen));
  launcher.setAttribute('aria-label', state.playerOpen ? 'Close music player' : 'Open music player');
  layer.classList.toggle('is-open', state.playerOpen);
}

/** Mount the global audio anchor in the Grand Tour edge row. */
export function initSoundControl() {
  if (layer) return layer;
  layer = document.getElementById('audio-layer');
  if (!layer) throw new Error('Expected #audio-layer');

  const anchor = document.createElement('div');
  anchor.className = 'audio-anchor';
  speaker = document.createElement('button');
  speaker.type = 'button';
  speaker.className = 'audio-control audio-speaker';
  speaker.innerHTML = speakerIcon;
  launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'audio-control audio-launcher';
  launcher.innerHTML = '<span class="glyph glyph-plus" aria-hidden="true">+</span>' +
    '<span class="glyph glyph-close" aria-hidden="true">×</span>';
  launcher.setAttribute('aria-controls', 'music-player');
  anchor.append(speaker, launcher);
  layer.append(anchor);

  speaker.addEventListener('click', async () => {
    if (pending) return;
    if (state.audioReady) {
      setMasterMuted(!state.masterMuted);
      return;
    }
    setMasterMuted(false);
    pending = true;
    render();
    try {
      await startAudio();
    } finally {
      pending = false;
      render();
    }
  });
  launcher.addEventListener('click', () => set('playerOpen', !state.playerOpen));
  subscribe('audioReady', render);
  subscribe('masterMuted', render);
  subscribe('playerOpen', render);
  render();
  return layer;
}
