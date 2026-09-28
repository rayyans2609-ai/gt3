import { set, state, subscribe } from '../core/state.js';

let control = null;

export function initThemeToggle() {
  if (control) return control;
  const host = document.getElementById('hud-bottomright');
  if (!host) throw new Error('Expected an existing #hud-bottomright');

  control = document.createElement('button');
  control.type = 'button';
  control.className = 'theme-toggle';
  control.addEventListener('click', () => set('theme', state.theme === 'day' ? 'night' : 'day'));
  subscribe('theme', (theme) => { control.textContent = theme.toUpperCase(); });
  control.textContent = state.theme.toUpperCase();
  host.append(control);
  return control;
}
