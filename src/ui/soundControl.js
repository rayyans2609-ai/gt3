import { isMuted, setMasterMuted, startAudio } from '../audio/audioManager.js';

const EASE = 'cubic-bezier(.22, .61, .36, 1)';
let control = null;

function assignStyles(element, styles) {
  Object.assign(element.style, styles);
  return element;
}

function buttonReset(button) {
  return assignStyles(button, {
    appearance: 'none',
    WebkitAppearance: 'none',
    border: '0',
    borderRadius: '0',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    fontSize: '10px',
    fontWeight: '300',
    letterSpacing: '.14em',
    lineHeight: '1.2',
    textTransform: 'uppercase',
  });
}

/** Mount the explicit, trusted-gesture audio control once. */
export function initSoundControl() {
  if (control) return control;

  const host = document.getElementById('hud-topright');
  if (!host) throw new Error('Expected an existing #hud-topright');

  control = buttonReset(document.createElement('button'));
  control.type = 'button';
  control.className = 'sound-control';
  control.setAttribute('aria-label', 'Sound');
  assignStyles(control, {
    position: 'relative',
    zIndex: '5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    width: '142px',
    marginTop: '14px',
    marginLeft: 'auto',
    padding: '5px 1px 7px',
    borderBottom: '1px solid var(--hair)',
    color: 'rgba(237, 233, 227, .56)',
    textAlign: 'right',
    pointerEvents: 'auto',
    transition: `color 420ms ${EASE}, opacity 420ms ${EASE}`,
  });

  const marker = document.createElement('span');
  marker.setAttribute('aria-hidden', 'true');
  assignStyles(marker, {
    display: 'block',
    width: '13px',
    height: '1px',
    background: 'var(--gold)',
    opacity: '.35',
    transform: 'scaleX(.55)',
    transformOrigin: 'right center',
    transition: `opacity 420ms ${EASE}, transform 520ms ${EASE}`,
  });

  const label = document.createElement('span');
  control.append(marker, label);
  host.append(control);

  let started = false;
  let starting = false;

  function render() {
    const muted = started && isMuted();
    const on = started && !muted;
    label.textContent = starting ? 'Sound…' : on ? 'Sound On' : 'Sound Off';
    control.setAttribute('aria-pressed', String(on));
    control.disabled = starting;
    control.style.cursor = starting ? 'wait' : 'pointer';
    control.style.opacity = starting ? '.5' : '1';
    marker.style.opacity = on ? '1' : '.35';
    marker.style.transform = on ? 'scaleX(1)' : 'scaleX(.55)';
  }

  control.addEventListener('click', async () => {
    if (starting) return;
    if (started) {
      setMasterMuted(!isMuted());
      render();
      return;
    }

    starting = true;
    render();
    const ok = await startAudio();
    starting = false;
    if (ok) started = true;
    render();
  });

  render();
  return control;
}
