import { set, state, subscribe } from './state.js';
import { EXPERIENCES } from './experience.js';
import { CARS } from '../data/cars.js';

const STORAGE_KEY = 'gt3.session.v1';
const VALID_SESSION_VALUES = Object.freeze({
  theme: new Set(['day', 'night']),
  experience: new Set(EXPERIENCES),
  masterMuted: { has: (value) => typeof value === 'boolean' },
  musicMuted: { has: (value) => typeof value === 'boolean' },
  trackIndex: { has: (value) => Number.isInteger(value) && value >= 0 && value < 6 },
  trackPosition: { has: (value) => Number.isFinite(value) && value >= 0 },
  playIntent: { has: (value) => typeof value === 'boolean' },
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
    value.unlocked = [...state.unlocked].filter((index) =>
      Number.isInteger(index) && index >= 0 && index < CARS.length).sort((a, b) => a - b);
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
  const unlocked = new Set([0]);
  if (Array.isArray(saved?.unlocked)) {
    for (const index of saved.unlocked) {
      if (Number.isInteger(index) && index >= 0 && index < CARS.length) unlocked.add(index);
    }
  }
  set('unlocked', unlocked);

  for (const key of SESSION_KEYS) subscribe(key, writeSession);
  subscribe('unlocked', writeSession);
}
