import { set, state, subscribe } from './state.js';

const STORAGE_KEY = 'gt3.session.v1';
const SESSION_KEYS = Object.freeze(['theme']);
const VALID_THEMES = new Set(['day', 'night']);
let initialized = false;

function readSession() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function writeSession() {
  try {
    const value = Object.fromEntries(SESSION_KEYS.map((key) => [key, state[key]]));
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

/** Restore only known, valid session values and persist later changes. */
export function restoreSession() {
  if (initialized) return;
  initialized = true;

  const saved = readSession();
  if (VALID_THEMES.has(saved?.theme)) set('theme', saved.theme);

  subscribe('theme', writeSession);
}
