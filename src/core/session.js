import { ROUTE_MAPPING, GRID_DISTANCE, TRACK_LENGTH, TOUR_LENGTH, CHECKPOINT_T, progressAtRouteT } from '../scene/trackCurve.js';
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
  lapElapsedMs: { has: (value) => Number.isFinite(value) && value >= 0 },
  finishAcknowledged: { has: (value) => typeof value === 'boolean' },
  routeProgress: { has: (value) => Number.isFinite(value) && value >= 0 && value <= 1 },
});
const STATE_SESSION_KEYS = Object.freeze(Object.keys(VALID_SESSION_VALUES)
  .filter((key) => !['routeProgress', 'lapElapsedMs'].includes(key)));
const ROUTE_WRITE_INTERVAL_MS = 350;
let initialized = false;
let restoredRouteProgress = null;
let routeProgress = 0;
let routeWriteTimer = 0;
let routePersistenceStarted = false;

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
    const value = Object.fromEntries(STATE_SESSION_KEYS.map((key) => [key, state[key]]));
    value.routeProgress = routeProgress;
    value.lapElapsedMs = state.lapElapsedMs;
    value.routeMapping = ROUTE_MAPPING;
    value.routeGridDistance = GRID_DISTANCE;
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
  for (const key of STATE_SESSION_KEYS) {
    if (VALID_SESSION_VALUES[key].has(saved?.[key])) set(key, saved[key]);
  }
  if (VALID_SESSION_VALUES.routeProgress.has(saved?.routeProgress)) {
    restoredRouteProgress = migrateRouteProgress(saved);
    routeProgress = restoredRouteProgress;
  }
  if (restoredRouteProgress !== null && VALID_SESSION_VALUES.lapElapsedMs.has(saved?.lapElapsedMs)) {
    set('lapElapsedMs', saved.lapElapsedMs);
  }
  set('lapFrozen', restoredRouteProgress === 1);
  const unlocked = new Set([0]);
  if (Array.isArray(saved?.unlocked)) {
    for (const index of saved.unlocked) {
      if (Number.isInteger(index) && index >= 0 && index < CARS.length) unlocked.add(index);
    }
  }
  set('unlocked', unlocked);

  for (const key of STATE_SESSION_KEYS) subscribe(key, writeSession);
  subscribe('unlocked', writeSession);
}

/** The valid route position captured during this tab session, if any. */
export function getRestoredRouteProgress() {
  return restoredRouteProgress;
}

/** Persist an accepted route position without writing on every animation frame. */
export function persistRouteProgress(progress, { flush = false } = {}) {
  if (!VALID_SESSION_VALUES.routeProgress.has(progress)) return;
  routeProgress = progress;
  if (flush) {
    if (routeWriteTimer) window.clearTimeout(routeWriteTimer);
    routeWriteTimer = 0;
    writeSession();
    return;
  }
  if (routeWriteTimer) return;
  routeWriteTimer = window.setTimeout(() => {
    routeWriteTimer = 0;
    writeSession();
  }, ROUTE_WRITE_INTERVAL_MS);
}

/** Begin observing the live drive only after any saved position has been restored. */
export function startRoutePersistence() {
  if (routePersistenceStarted) return;
  routePersistenceStarted = true;
  const flush = () => persistRouteProgress(state.progress, { flush: true });
  subscribe('progress', (progress) => persistRouteProgress(progress));
  subscribe('lapElapsedMs', () => persistRouteProgress(state.progress));
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/** Preserve old world positions and completed state without replaying effects. */
export function migrateRouteProgress(saved) {
  const p = saved.routeProgress;
  if (saved.routeMapping !== ROUTE_MAPPING) {
    if (p === 0) return 0;
    if (p >= .995) return 1;
    return progressAtRouteT(p);
  }
  const oldDistance = Number.isFinite(saved.routeGridDistance) ? saved.routeGridDistance : GRID_DISTANCE;
  if (oldDistance === GRID_DISTANCE) return p;
  const mapped = Math.min(1, Math.max(0, (p * (TRACK_LENGTH + oldDistance) - oldDistance + GRID_DISTANCE) / TOUR_LENGTH));
  // Round-off during a grid alternative change must not move a saved exact
  // checkpoint to its previous-car side. This is < 0.00001 mm on this circuit.
  return CHECKPOINT_T.find(t => Math.abs(t - mapped) < 1e-12) ?? mapped;
}
