/**
 * motion.js — GSAP for UI choreography, ticked by GT3's one frame loop (ARCHITECTURE: single RAF).
 *
 * GSAP normally drives itself with its own requestAnimationFrame loop, and it restarts that loop
 * whenever a tween is created (gsap-core `_ticker.wake()`). Removing `updateRoot` from the ticker
 * (the documented manual mode) would still leave that empty loop running, so instead:
 *   1. when this module evaluates, the ticker is put to sleep (cancelling the frame GSAP requested
 *      at import, before it can run),
 *   2. its `wake` is replaced with a no-op, so new tweens never restart an independent loop,
 *   3. main.js calls `gsap.ticker.tick()` once per GT3 frame (`installMotion(registerUpdate)`),
 *      which runs GSAP's own listeners (updateRoot) with its normal frame count and lag smoothing.
 * `window.__gt3.motion` exposes counters so a harness can prove GSAP owns no rAF.
 */

import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Flip } from 'gsap/Flip';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(CustomEase, DrawSVGPlugin, Flip, SplitText);

// Shared GT3 eases (the CSS token cubic-bezier(.22,.61,.36,1) and two signature curves).
CustomEase.create('gt3', '0.22, 0.61, 0.36, 1');
CustomEase.create('gt3.out', '0.16, 1, 0.3, 1');
CustomEase.create('gt3.launch', '0.7, 0, 0.18, 1');

let installed = false;
const stats = { ticks: 0, wakeRequests: 0 };
const ticker = gsap.ticker;

// At module evaluation, in the same task as GSAP's own import-time wake: cancel the frame it
// just requested and make every later wake (each new tween calls it) a counted no-op.
ticker.sleep();
ticker.wake = () => { stats.wakeRequests += 1; };

export function installMotion(registerUpdate) {
  if (installed) return gsap;
  installed = true;
  registerUpdate(() => {
    stats.ticks += 1;
    ticker.tick();
  });
  if (typeof window !== 'undefined') {
    window.__gt3 = window.__gt3 || {};
    window.__gt3.motion = { stats, gsap, installedAt: performance.now() };
  }
  return gsap;
}

export const reducedMotion = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

export { gsap, Flip, SplitText };
