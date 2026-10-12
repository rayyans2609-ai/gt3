/** Minimal input-owned stopwatch. No wall-clock timestamps are persisted. */
import { state, set } from './state.js';

export const LAP_IDLE_MS = 1000;
export const LAP_MIN_SPEED_MPS = 0.5;

/** Pure clock used by the runtime and deterministic timer checks. */
export function createLapTimer(elapsedMs = 0) {
  let elapsed = elapsedMs, running = false, frozen = false;
  let lastTick = null, lastTravel = -Infinity;
  function advance(now) {
    if (running && lastTick !== null) {
      elapsed += Math.max(0, Math.min(now, lastTravel + LAP_IDLE_MS) - lastTick);
      if (now >= lastTravel + LAP_IDLE_MS) running = false;
    }
    lastTick = now;
  }
  return {
    tick(now, { driving = false, finished = false, enabled = true } = {}) {
      advance(now);
      if (!enabled || finished) running = false;
      if (finished) frozen = true;
      else if (driving && enabled) {
        // Reverse-out continues the same stopwatch, with no time from the frozen interval.
        frozen = false;
        running = true;
        lastTravel = now;
      }
      return { elapsedMs: elapsed, running, frozen };
    },
    pause(now, finished = false) {
      advance(now); running = false; frozen = finished; lastTravel = -Infinity;
      return { elapsedMs: elapsed, running, frozen };
    },
    reset() { elapsed = 0; running = false; frozen = false; lastTick = null; lastTravel = -Infinity; },
  };
}
let timer = null;
function publish(value) {
  set('lapElapsedMs', value.elapsedMs);
  set('lapRunning', value.running);
  set('lapFrozen', value.frozen);
}
function clock() { return timer ??= createLapTimer(state.lapElapsedMs); }
export function updateLapTimer(now, options) { publish(clock().tick(now, options)); }
export function pauseLapTimer(now = performance.now(), finished = state.progress >= 1) {
  publish(clock().pause(now, finished));
}
export function resetLapTimer() {
  clock().reset();
  publish({ elapsedMs: 0, running: false, frozen: false });
}
export function formatLapTime(ms) {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  return `${String(Math.floor(tenths / 600)).padStart(2, '0')}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}
