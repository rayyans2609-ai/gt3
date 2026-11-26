/**
 * edgeDrawer.js — global Landing / Hub / Showcase home for the substantial music view.
 *
 * The tab and panel share one translated shell: closed, only the tab occupies the right edge;
 * open, that same tab is carried to the panel's exposed left edge. The player itself remains a
 * view over audioManager, so opening this surface never resets playback or audio preferences.
 */

import { createElement, Music2 } from 'lucide';
import { state, subscribe } from '../core/state.js';
import { gsap, reducedMotion } from './motion.js';
import { initHubPlayer, updateHubPlayer } from './hubPlayer.js';
import { enableMasterSound, speakerIcon, toggleMasterSound } from './soundControl.js';
import { setThemeToggleHost } from './themeToggle.js';

const PANEL_WIDTH = 320;
const TAB_WIDTH = 46;
const DURATION = 0.34;
const EASE = 'power3.out';
const NOTICE_DELAY = 1500;
const NOTICE_SEEN_KEY = 'gt3:edgeSoundNoticeSeen';

let root = null;
let shell = null;
let panel = null;
let tab = null;
let notice = null;
let master = null;
let open = false;
let pending = false;
let noticeTimer = 0;

function supportedExperience(experience = state.experience) {
  return experience === 'landing' || experience === 'hub' || experience === 'showcase';
}

function drawerWidth() {
  if (!panel || !tab) return PANEL_WIDTH + TAB_WIDTH;
  return panel.offsetWidth + tab.offsetWidth;
}

function panelWidth() {
  return panel?.offsetWidth || PANEL_WIDTH;
}

function syncWidth() {
  const width = drawerWidth();
  document.documentElement.style.setProperty('--drawer-w', `${width}px`);
  if (!open && shell) gsap.set(shell, { x: panelWidth() });
  return width;
}

function dispatchDrawer(opening, duration = DURATION, ease = EASE) {
  const width = syncWidth();
  document.documentElement.dataset.drawer = opening ? 'open' : 'closed';
  window.dispatchEvent(new CustomEvent('gt3:drawer', {
    detail: { open: opening, width, duration, ease },
  }));
}

function renderMaster() {
  if (!master) return;
  const condition = pending ? 'starting' : !state.audioReady ? 'idle' : state.masterMuted ? 'muted' : 'on';
  master.dataset.sound = condition;
  master.disabled = pending;
  master.setAttribute('aria-pressed', String(condition === 'on'));
  master.setAttribute('aria-label', {
    starting: 'Starting sound', idle: 'Start sound', muted: 'Unmute all sound', on: 'Mute all sound',
  }[condition]);
}

function noticeSeen() {
  try { return sessionStorage.getItem(NOTICE_SEEN_KEY) === '1'; } catch { return false; }
}

function rememberNotice() {
  try { sessionStorage.setItem(NOTICE_SEEN_KEY, '1'); } catch { /* storage may be unavailable */ }
}

function hideNotice({ remember = false } = {}) {
  window.clearTimeout(noticeTimer);
  if (remember) rememberNotice();
  if (!notice) return;
  notice.remove();
  notice = null;
}

function maybeShowNotice() {
  window.clearTimeout(noticeTimer);
  if (!supportedExperience() || state.audioReady || noticeSeen() || notice) return;
  noticeTimer = window.setTimeout(() => {
    if (!supportedExperience() || state.audioReady || noticeSeen() || notice) return;
    notice = document.createElement('aside');
    notice.className = 'edge-sound-notice';
    notice.setAttribute('aria-label', 'Sound is off');
    const copy = document.createElement('span');
    copy.textContent = 'Sound is off';
    const enable = document.createElement('button');
    enable.type = 'button';
    enable.className = 'edge-sound-notice__enable';
    enable.textContent = 'Enable';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'edge-sound-notice__dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss sound notification');
    dismiss.textContent = '×';
    enable.addEventListener('click', async () => {
      enable.disabled = true;
      const enabled = await enableMasterSound();
      // A rejected browser activation leaves the invitation available; successful startup also
      // retires it through the audioReady subscription below.
      if (enabled || state.audioReady) hideNotice({ remember: true });
      else enable.disabled = false;
    });
    dismiss.addEventListener('click', () => hideNotice({ remember: true }));
    notice.append(copy, enable, dismiss);
    document.body.append(notice);
  }, NOTICE_DELAY);
}

function applyExperience(experience = state.experience) {
  const visible = supportedExperience(experience);
  if (!visible) setDrawerOpen(false);
  root.hidden = !visible;
  root.setAttribute('aria-hidden', String(!visible));
  if (visible) {
    setThemeToggleHost(panel.querySelector('.edge-drawer__footer'));
    maybeShowNotice();
  } else {
    setThemeToggleHost();
    hideNotice();
  }
}

/** Open or close the one physical drawer object. Safe to call before initialization. */
export function setDrawerOpen(nextOpen) {
  const next = Boolean(nextOpen) && supportedExperience();
  if (!shell || next === open) return;
  open = next;
  tab.setAttribute('aria-expanded', String(open));
  tab.setAttribute('aria-label', open ? 'Close music controls' : 'Open music controls');
  root.classList.toggle('is-open', open);
  const reduce = reducedMotion.matches;
  const duration = reduce ? 0 : DURATION;
  const ease = reduce ? 'none' : EASE;
  dispatchDrawer(open, duration, ease);
  gsap.killTweensOf(shell);
  if (reduce) {
    gsap.set(shell, { x: open ? 0 : panelWidth() });
  } else {
    gsap.to(shell, { x: open ? 0 : panelWidth(), duration, ease, overwrite: true });
  }
  if (!open && panel.contains(document.activeElement)) tab.focus();
}

export function isDrawerOpen() {
  return open;
}

export function initEdgeDrawer() {
  if (root) return root;
  root = document.createElement('aside');
  root.id = 'edge-drawer';
  root.className = 'edge-drawer';
  root.setAttribute('aria-label', 'Music controls');

  shell = document.createElement('div');
  shell.className = 'edge-drawer__shell';
  tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'edge-drawer__tab';
  tab.setAttribute('aria-label', 'Open music controls');
  tab.setAttribute('aria-controls', 'edge-drawer-panel');
  tab.setAttribute('aria-expanded', 'false');
  tab.append(createElement(Music2, { 'stroke-width': 1.6, 'aria-hidden': 'true', focusable: 'false' }));

  panel = document.createElement('div');
  panel.id = 'edge-drawer-panel';
  panel.className = 'edge-drawer__panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Music player');
  initHubPlayer(panel, { shape: 'drawer' });

  const footer = document.createElement('div');
  footer.className = 'edge-drawer__footer';
  master = document.createElement('button');
  master.type = 'button';
  master.className = 'audio-control audio-speaker edge-drawer__speaker';
  master.innerHTML = speakerIcon;
  footer.append(master);
  panel.append(footer);
  shell.append(tab, panel);
  root.append(shell);
  document.body.append(root);

  tab.addEventListener('click', () => setDrawerOpen(!open));
  master.addEventListener('click', async () => {
    if (pending) return;
    pending = !state.audioReady;
    renderMaster();
    try { await toggleMasterSound(); } finally { pending = false; renderMaster(); }
  });
  document.addEventListener('pointerdown', (event) => {
    if (open && !root.contains(event.target) && !notice?.contains(event.target)) setDrawerOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) setDrawerOpen(false);
  }, true);
  subscribe('audioReady', (ready) => {
    renderMaster();
    if (ready) hideNotice({ remember: true });
    else maybeShowNotice();
  });
  subscribe('masterMuted', renderMaster);
  subscribe('experience', applyExperience);
  window.addEventListener('resize', syncWidth);
  open = false;
  syncWidth();
  document.documentElement.dataset.drawer = 'closed';
  renderMaster();
  applyExperience();
  return root;
}

/** Called by the single app RAF; delegates status refresh to the reused player view. */
export function updateEdgeDrawer() {
  if (root && !root.hidden) updateHubPlayer();
}
