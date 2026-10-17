/**
 * transmissionBudget.js — unlocked-only bound on three's transmission pass (P3u W6).
 *
 * Two roster cars (Ferrari 488: 7 materials, Aston Martin Vantage: 5) use MeshPhysical
 * transmission on their glazing. Whenever one is visible, WebGLRenderer re-renders every
 * opaque object into a private target first: 4x MSAA, half float, a full mip chain, at the
 * full drawing-buffer size. At the unlocked DPR that work appears abruptly at the gate
 * crossfade into those cars and measured 25-155 ms GPU frames at Quality (W6 REPORT).
 *
 * The glazing only samples that target (roughness-blurred) over a few hundred pixels. Here it
 * is rendered at CSS-pixel density — the density locked has always used — and single-sample:
 * the GPU work drops ~4x per sample and ~4x per pixel at Quality, and the target's memory
 * with it. Locked is untouched: this module does nothing unless UNLOCKED.
 *
 * Relies on three r180's transmission target shape (samples 4, mipmapped, no depth resolve).
 * If a later three changes it, the guard simply stops matching and behaviour reverts to stock.
 */
import { UNLOCKED, SETTINGS } from '../core/renderProfile.js';

export const TRANSMISSION_SCALE = UNLOCKED ? 1 / SETTINGS.dpr : 1;

export function budgetTransmission(renderer) {
  if (!UNLOCKED || !renderer) return;
  renderer.transmissionResolutionScale = TRANSMISSION_SCALE;
  const setRenderTarget = renderer.setRenderTarget, seen = new WeakSet();
  renderer.setRenderTarget = function (target, ...rest) {
    // The transmission target is created lazily by the renderer (also during warm-up);
    // drop its multisampling once, before its first (re)allocation is used.
    if (target && !seen.has(target) && target.samples > 0
      && target.texture.generateMipmaps && target.resolveDepthBuffer === false) {
      seen.add(target);
      target.samples = 0;
      target.dispose();
    }
    return setRenderTarget.call(this, target, ...rest);
  };
}
