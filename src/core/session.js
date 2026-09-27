import { set, state, subscribe } from './state.js';
import { EXPERIENCES } from './experience.js';

const STORAGE_KEY = 'gt3.session.v1';
const VALID_SESSION_VALUES = Object.freeze({
  theme: new Set(['day', 'night']),
  experience: new Set(EXPERIENCES),
});
const SESSION_KEYS = Object.freeze(Object.keys(VALID_SESSION_VALUES));
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
  for (const key of SESSION_KEYS) {
    if (VALID_SESSION_VALUES[key].has(saved?.[key])) set(key, saved[key]);
  }

  for (const key of SESSION_KEYS) subscribe(key, writeSession);
}
