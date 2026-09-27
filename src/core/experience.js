import { set, state } from './state.js';
import { lockScroll, unlockScroll } from '../scroll/scrollDrive.js';

export const EXPERIENCES = Object.freeze([
  'landing',
  'hub',
  'showcase',
  'tour',
  'complete',
]);

const IMMEDIATE_EDGES = new Set([
  'landing:hub',
  'hub:landing',
  'tour:complete',
  'complete:tour',
]);

const TIMED_EDGES = new Set([
  'hub:showcase',
  'showcase:hub',
  'hub:tour',
  'tour:hub',
  'complete:hub',
]);

let ownsScrollLock = false;

function edge(from, to) {
  return `${from}:${to}`;
}

function warn(message) {
  console.warn(`[gt3] experience transition refused: ${message}`);
}

export function canTransition(from, to) {
  const candidate = edge(from, to);
  return IMMEDIATE_EDGES.has(candidate) || TIMED_EDGES.has(candidate);
}

/** Move across an immediate experience edge. */
export function setExperience(to) {
  if (state.transition) {
    warn('a timed transition is already in flight');
    return false;
  }

  const candidate = edge(state.experience, to);
  if (!IMMEDIATE_EDGES.has(candidate)) {
    warn(`${state.experience} -> ${to} is not an immediate edge`);
    return false;
  }

  set('experience', to);
  return true;
}

/** Begin a click-driven, timed experience edge. Completion is owned by its choreography. */
export function beginTransition(to) {
  if (state.transition) {
    warn('a timed transition is already in flight');
    return false;
  }

  const from = state.experience;
  if (!TIMED_EDGES.has(edge(from, to))) {
    warn(`${from} -> ${to} is not a timed edge`);
    return false;
  }

  ownsScrollLock = !state.scrollLocked;
  if (ownsScrollLock) lockScroll();
  set('transition', { from, to });
  return true;
}

/** Finish the active timed edge and release only the lock this module acquired. */
export function completeTransition() {
  const transition = state.transition;
  if (!transition) {
    warn('there is no timed transition to complete');
    return false;
  }

  set('experience', transition.to);
  set('transition', null);
  if (ownsScrollLock) unlockScroll();
  ownsScrollLock = false;
  return true;
}

/** Boot-only restoration: accepts known experience values without requiring an edge. */
export function restoreExperience(key) {
  if (!EXPERIENCES.includes(key)) {
    warn(`${key} is not a valid experience`);
    return false;
  }

  set('experience', key);
  return true;
}
