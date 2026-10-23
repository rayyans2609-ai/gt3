/**
 * homeControl.js — the small back/home control in the Grand Tour edge row (SPEC §25 "Leaving
 * Grand Tour mid-run"): scroll drives the route, so leaving needs a deliberate click. It returns
 * to the (provisional) Hub with route position and discoveries preserved. Phase 5 may restyle it.
 */

const HOME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 11.2 12 5l7.5 6.2"/><path d="M6.8 9.6V19h10.4V9.6"/></svg>';

let button = null;

export function initHomeControl({ onHome }) {
  if (button) return button;
  const host = document.getElementById('hud-bottomright');
  if (!host) throw new Error('Expected an existing #hud-bottomright');
  button = document.createElement('button');
  button.type = 'button';
  button.className = 'home-control';
  button.setAttribute('aria-label', 'Return to the Hub');
  button.innerHTML = HOME_ICON;
  button.addEventListener('click', () => onHome?.());
  host.prepend(button);
  return button;
}
