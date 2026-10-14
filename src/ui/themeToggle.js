import { set, state, subscribe } from '../core/state.js';

let group = null;
let options = [];

// Inline SVG strokes (~1.5 px, round caps) matching the speaker icon's line language.
const SUN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4m0 13.6v2.4M2.8 12h2.4m13.6 0h2.4M5.5 5.5l1.7 1.7m9.6 9.6 1.7 1.7m0-12.9-1.7 1.7m-9.6 9.6-1.7 1.7"/></svg>';
// Filled crescent: an outer disc minus an offset inner disc (mask cutout), so the
// body stays substantial — thickest part ~45 % of the outer diameter — with a
// clean inner gap. Painted with fill (see the night-option override in hud.css),
// matching the sun icon's optical weight at the same 24 px viewBox.
const MOON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs><mask id="gt3-moon-cut"><rect x="0" y="0" width="24" height="24" fill="white"/><circle cx="16.2" cy="9.2" r="4.9" fill="black"/></mask></defs><circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" mask="url(#gt3-moon-cut)"/></svg>';

function render(theme = state.theme) {
  if (!group) return;
  group.dataset.active = theme;
  for (const option of options) {
    const checked = option.dataset.value === theme;
    option.setAttribute('aria-checked', String(checked));
    // Roving tabindex: only the selected option is in the Tab order.
    option.tabIndex = checked ? 0 : -1;
  }
}

function onKeyDown(event) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  const current = options.findIndex((option) => option.dataset.value === state.theme);
  let next = current < 0 ? 0 : current;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (next + 1) % options.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (next - 1 + options.length) % options.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = options.length - 1;
  const value = options[next].dataset.value;
  if (state.theme !== value) set('theme', value);
  options[next].focus();
}

/**
 * Learn the player's real width and publish it as the shared --player-w the
 * edge-row recomposition reads. offsetWidth ignores the open/close transform,
 * so this is the true layout width in every state. Falls back to the CSS
 * 274 px until the player exists (themeToggle mounts before initPlayer).
 */
function syncPlayerWidth() {
  const player = document.querySelector('.music-player');
  const width = player ? player.offsetWidth : 0;
  if (width > 0) document.documentElement.style.setProperty('--player-w', `${width}px`);
}

export function initThemeToggle() {
  if (group) return group;
  const host = document.getElementById('hud-bottomright');
  if (!host) throw new Error('Expected an existing #hud-bottomright');

  group = document.createElement('div');
  group.className = 'theme-segmented';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Theme');

  const thumb = document.createElement('span');
  thumb.className = 'theme-segmented__thumb';
  thumb.setAttribute('aria-hidden', 'true');
  group.append(thumb);

  const defs = [
    { value: 'day', label: 'Day', icon: SUN_ICON },
    { value: 'night', label: 'Night', icon: MOON_ICON },
  ];
  options = defs.map((def) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'theme-segmented__option';
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-label', def.label);
    option.dataset.value = def.value;
    option.innerHTML = def.icon;
    // Clicking the active side is a no-op; each side is an independent target.
    option.addEventListener('click', () => {
      if (state.theme !== def.value) set('theme', def.value);
    });
    option.addEventListener('keydown', onKeyDown);
    group.append(option);
    return option;
  });

  host.append(group);

  subscribe('theme', render);
  render(state.theme);

  // Drive the edge-row recomposition from state: the body class slides
  // #hud-bottomright past the player's outer edge in step with open/close.
  subscribe('playerOpen', (open) => {
    document.body.classList.toggle('is-player-open', open);
    syncPlayerWidth();
  });
  document.body.classList.toggle('is-player-open', state.playerOpen);

  // The player mounts after this control, so watch for it and track resizes.
  syncPlayerWidth();
  const layer = document.getElementById('audio-layer');
  if (layer && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.music-player')) return;
      syncPlayerWidth();
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(syncPlayerWidth).observe(document.querySelector('.music-player'));
      }
      observer.disconnect();
    });
    observer.observe(layer, { childList: true });
  }
  window.addEventListener('resize', syncPlayerWidth);

  return group;
}
