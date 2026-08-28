import './styles/base.css';
import * as THREE from 'three';
import { state } from './core/state.js';
import { Clock } from './core/clock.js';

const clock = new Clock();
const updates = [];
const resizeHandlers = new Set();
let resizeTimer;
let didLogFirstFrame = false;

export function registerUpdate(fn) {
  updates.push(fn);

  return () => {
    const index = updates.indexOf(fn);
    if (index !== -1) updates.splice(index, 1);
  };
}

export function onResize(fn) {
  resizeHandlers.add(fn);
  return () => resizeHandlers.delete(fn);
}

window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    for (const handler of resizeHandlers) {
      handler(window.innerWidth, window.innerHeight);
    }
  }, 100);
});

function frame() {
  const dt = clock.tick();

  if (!didLogFirstFrame) {
    console.info(`GT3 frame loop alive (Three.js r${THREE.REVISION})`);
    didLogFirstFrame = true;
  }

  for (const update of updates) {
    update(dt, state);
  }

  window.requestAnimationFrame(frame);
}

window.requestAnimationFrame(frame);
