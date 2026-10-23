/**
 * hub.js — PROVISIONAL Phase 5 Hub (owner, 2026-10-24): a theme field and one START RACE
 * button that enters the Grand Tour. Nothing else. The real Hub (SPEC §5, §9) replaces this
 * surface in Phase 5; only the entry wiring in main.js is meant to outlive it.
 *
 * The field is the same colour the Landing transition resolves into, so it covers the canvas
 * seamlessly; main.js switches the canvas to the Tour underneath it before fading it out.
 */

let root = null;
let button = null;
let status = null;
let ready = false;
let onStart = null;
let presence = -1;
let interactive = null;

function render(readiness) {
  if (!button) return;
  const loading = readiness.status === 'loading';
  const failed = readiness.status === 'failed';
  ready = !loading && !failed;
  button.disabled = !ready;
  button.setAttribute('aria-busy', String(loading));
  status.textContent = failed ? 'Route unavailable'
    : loading ? `Preparing the grid ${String(Math.round(readiness.progress * 100)).padStart(2, '0')}%` : '';
}

export function initHub({ onStartRace }) {
  root = document.getElementById('hub');
  if (!root) throw new Error('Expected #hub');
  button = root.querySelector('.hub-start');
  status = root.querySelector('.hub-status');
  onStart = onStartRace;
  button.addEventListener('click', () => { if (ready) onStart?.(); });
}

/** Mirror the one Tour readiness decision (main.js) on the button. */
export function setHubReadiness(readiness) {
  render(readiness);
}

/** Field coverage from the Landing transition (0..1); the button is usable only at rest. */
export function setHubPresence(value, canInteract) {
  if (!root) return;
  const next = Math.round(value * 1000) / 1000;
  if (next !== presence) {
    presence = next;
    root.style.opacity = String(next);
    root.hidden = next <= 0;
  }
  if (canInteract !== interactive) {
    interactive = canInteract;
    root.classList.toggle('is-interactive', canInteract);
  }
}

/** Fade the field away over the Tour (Hub -> Grand Tour handoff). */
export function leaveHub(durationMs) {
  return new Promise((resolve) => {
    root.classList.remove('is-interactive');
    interactive = false;
    root.style.transition = `opacity ${durationMs}ms var(--ease)`;
    root.style.opacity = '0';
    window.setTimeout(() => {
      root.hidden = true;
      presence = 0;
      root.style.transition = '';
      resolve();
    }, durationMs);
  });
}

/** Bring the field up over the Tour (Grand Tour -> Hub); the Hub is interactive once opaque. */
export function coverHub(durationMs) {
  return new Promise((resolve) => {
    root.hidden = false;
    root.style.transition = 'none';
    root.style.opacity = '0';
    void root.offsetWidth;
    root.style.transition = `opacity ${durationMs}ms var(--ease)`;
    root.style.opacity = '1';
    window.setTimeout(() => {
      root.style.transition = '';
      presence = 1;
      resolve();
    }, durationMs);
  });
}
