import { state, subscribe } from '../core/state.js';
import { PRESETS, applyTimeOfDay } from '../scene/timeOfDay.js';

const LABELS = Object.freeze({
  dawn: 'DAWN',
  morning: 'MORNING',
  afternoon: 'AFTERNOON',
  dusk: 'DUSK',
  night: 'NIGHT',
});

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

export function initTodSelector() {
  if (control) return control;

  const host = document.getElementById('hud-topright');
  if (!host) throw new Error('Expected an existing #hud-topright');

  control = document.createElement('div');
  control.className = 'tod-control';
  control.dataset.expanded = 'false';
  assignStyles(control, {
    position: 'relative',
    width: '142px',
    marginTop: '14px',
    marginLeft: 'auto',
    color: 'var(--paper)',
    fontFamily: 'var(--font-ui)',
    pointerEvents: 'auto',
  });

  const trigger = buttonReset(document.createElement('button'));
  trigger.type = 'button';
  trigger.className = 'tod-trigger';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  assignStyles(trigger, {
    display: 'block',
    width: '100%',
    padding: '5px 1px 7px',
    borderBottom: '1px solid var(--hair)',
    color: 'rgba(237, 233, 227, .72)',
    textAlign: 'right',
    transition: `color 420ms ${EASE}, border-color 420ms ${EASE}`,
  });

  const currentLabel = document.createElement('span');
  currentLabel.className = 'tod-current';
  currentLabel.textContent = LABELS[state.timeOfDay] ?? LABELS.afternoon;
  trigger.append(currentLabel);

  const menu = document.createElement('div');
  menu.id = 'tod-menu';
  menu.className = 'tod-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Time of day');
  trigger.setAttribute('aria-controls', menu.id);
  assignStyles(menu, {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    maxHeight: '0px',
    marginTop: '0px',
    padding: '0 13px',
    overflow: 'hidden',
    opacity: '0',
    transform: 'translateY(-5px)',
    border: '1px solid transparent',
    background: 'rgba(11, 11, 12, .42)',
    backdropFilter: 'blur(18px) saturate(120%)',
    WebkitBackdropFilter: 'blur(18px) saturate(120%)',
    pointerEvents: 'none',
    transition: `max-height 620ms ${EASE}, opacity 420ms ${EASE}, transform 620ms ${EASE}, margin-top 620ms ${EASE}, padding 620ms ${EASE}, border-color 420ms ${EASE}`,
  });

  const optionControls = new Map();
  for (const key of Object.keys(PRESETS)) {
    const option = buttonReset(document.createElement('button'));
    option.type = 'button';
    option.className = 'tod-option';
    option.dataset.timeOfDay = key;
    option.setAttribute('role', 'menuitemradio');
    option.tabIndex = -1;
    assignStyles(option, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      minHeight: '30px',
      width: '100%',
      padding: '0',
      color: 'rgba(237, 233, 227, .56)',
      textAlign: 'left',
      transition: `color 420ms ${EASE}`,
    });

    const marker = document.createElement('span');
    marker.className = 'tod-option-rule';
    marker.setAttribute('aria-hidden', 'true');
    assignStyles(marker, {
      display: 'block',
      width: '13px',
      height: '1px',
      flex: '0 0 13px',
      background: 'var(--gold)',
      opacity: '0',
      transform: 'scaleX(.35)',
      transformOrigin: 'left center',
      transition: `opacity 420ms ${EASE}, transform 520ms ${EASE}`,
    });

    const label = document.createElement('span');
    label.textContent = LABELS[key];
    option.append(marker, label);
    menu.append(option);
    optionControls.set(key, { option, marker });
  }

  control.append(trigger, menu);
  // Append only: the unlocked readout and any other HUD children remain untouched.
  host.append(control);

  let expanded = false;

  function setExpanded(next) {
    expanded = Boolean(next);
    control.dataset.expanded = String(expanded);
    trigger.setAttribute('aria-expanded', String(expanded));
    menu.style.maxHeight = expanded ? '188px' : '0px';
    menu.style.marginTop = expanded ? '7px' : '0px';
    menu.style.padding = expanded ? '8px 13px' : '0 13px';
    menu.style.opacity = expanded ? '1' : '0';
    menu.style.transform = expanded ? 'translateY(0)' : 'translateY(-5px)';
    menu.style.borderColor = expanded ? 'var(--hair)' : 'transparent';
    menu.style.pointerEvents = expanded ? 'auto' : 'none';
    trigger.style.color = expanded
      ? 'rgba(237, 233, 227, .92)'
      : 'rgba(237, 233, 227, .72)';
    for (const { option } of optionControls.values()) option.tabIndex = expanded ? 0 : -1;
  }

  function reflectSelection(key) {
    if (!Object.hasOwn(PRESETS, key)) return;
    currentLabel.textContent = LABELS[key];
    for (const [optionKey, { option, marker }] of optionControls) {
      const active = optionKey === key;
      option.setAttribute('aria-checked', String(active));
      option.style.color = active
        ? 'rgba(237, 233, 227, .92)'
        : 'rgba(237, 233, 227, .56)';
      marker.style.opacity = active ? '1' : '0';
      marker.style.transform = active ? 'scaleX(1)' : 'scaleX(.35)';
    }
  }

  trigger.addEventListener('click', () => setExpanded(!expanded));
  for (const [key, { option }] of optionControls) {
    option.addEventListener('click', () => {
      applyTimeOfDay(key);
      setExpanded(false);
      trigger.focus({ preventScroll: true });
    });
  }

  document.addEventListener('pointerdown', (event) => {
    if (expanded && !control.contains(event.target)) setExpanded(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !expanded) return;
    setExpanded(false);
    trigger.focus({ preventScroll: true });
  });

  subscribe('timeOfDay', reflectSelection);
  reflectSelection(state.timeOfDay);
  setExpanded(false);
  return control;
}
