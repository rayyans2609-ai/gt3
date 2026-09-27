export const state = {
  progress: 0,
  targetProgress: 0,
  velocity: 0,
  speed01: 0,
  started: false,
  activeCarIndex: 0,
  unlocked: new Set(),
  mode: 'race',
  scrollLocked: false,
  theme: 'day',
  experience: 'landing',
  transition: null,
};

const subscribers = new Map();

export function set(key, value) {
  if (!(key in state)) {
    throw new TypeError(`Unknown state key: ${key}`);
  }

  const previous = state[key];
  const isObject = value !== null && typeof value === 'object';

  if (!isObject && Object.is(previous, value)) return;

  state[key] = value;

  for (const subscriber of subscribers.get(key) ?? []) {
    subscriber(value, previous);
  }
}

export function subscribe(key, fn) {
  if (!(key in state)) {
    throw new TypeError(`Unknown state key: ${key}`);
  }

  const listeners = subscribers.get(key) ?? new Set();
  listeners.add(fn);
  subscribers.set(key, listeners);

  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) subscribers.delete(key);
  };
}
