/**
 * Unlocked image-integrity controls for the post chain (P3u Stage 2, W4).
 *
 * Locked never reads this module's effects: sceneSetup only calls in here on the
 * SETTINGS.output path. `?integrity=off` restores the Stage 1 unlocked chain for review.
 */
import { UNLOCKED } from '../core/renderProfile.js';

const params = new URLSearchParams(globalThis.location?.search || '');
export const INTEGRITY = UNLOCKED && params.get('integrity') !== 'off';
export const GRAIN_MODE = INTEGRITY && params.get('grain') === 'css' ? 'css' : 'pixel';

// Same hash, seeds and amplitudes as the Stage 1 output stage: only the position of
// grain and dither in the chain changes, not their character.
const GRAIN_GLSL = /* glsl */ `
  float gt3Random(vec2 point) {
    return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
  }
`;

/**
 * Animated grain and the ±½-code dither must follow SMAA. Ahead of it, every frame's new
 * grain seed perturbs SMAA's colour-edge test (threshold 0.1, local-contrast adaptation),
 * so edges near the threshold re-blend differently each frame and shimmer at rest. The
 * dither belongs at the last float→8-bit boundary, which is SMAA's screen write.
 *
 * Patches SMAAPass's neighbourhood-blend material in place (no extra fullscreen pass) and
 * shares the output pass's existing uTime/uGrainAmount uniform objects, so every caller
 * that drives `passes.wash.uniforms.uTime` keeps working unchanged.
 */
export function moveGrainAfterAA(smaaPass, washUniforms, renderDpr = 1) {
  const material = smaaPass._materialBlend;
  if (!material) throw new Error('SMAAPass blend material not found (three.js internals changed)');
  material.uniforms.uTime = washUniforms.uTime;
  material.uniforms.uGrainAmount = washUniforms.uGrainAmount;
  material.uniforms.uGrainCell = { value: renderDpr };
  // Review option `grain=css`: one grain sample per CSS pixel, bilinearly interpolated
  // between samples. That is locked's DPR1 grain after the browser's 2x upscale, at any
  // render DPR. The default keeps Stage 1's per-backing-pixel (finer) grain.
  const grain = GRAIN_MODE === 'css'
    ? `vec2 grainCell = gl_FragCoord.xy / uGrainCell - 0.5, grainBase = floor(grainCell), grainF = grainCell - grainBase;
      vec2 grainSeed = vec2(uTime * 47.0, uTime * 29.0);
      float grain = mix(mix(gt3Random(grainBase + grainSeed), gt3Random(grainBase + vec2(1.0, 0.0) + grainSeed), grainF.x),
        mix(gt3Random(grainBase + vec2(0.0, 1.0) + grainSeed), gt3Random(grainBase + vec2(1.0) + grainSeed), grainF.x), grainF.y);`
    : 'float grain = gt3Random(gl_FragCoord.xy + vec2(uTime * 47.0, uTime * 29.0));';
  const call = 'gl_FragColor = SMAANeighborhoodBlendingPS( vUv, vOffset, tColor, tDiffuse );';
  if (!material.fragmentShader.includes(call)) throw new Error('SMAA blend entry point not found');
  material.fragmentShader = material.fragmentShader
    .replace('void main() {', `uniform float uTime;
      uniform float uGrainAmount;
      uniform float uGrainCell;
      ${GRAIN_GLSL}
      void main() {`)
    .replace(call, `${call}
      ${grain}
      gl_FragColor.rgb += (grain - 0.5) * uGrainAmount;
      // +/- half an 8-bit code at the final quantisation, decorrelated from the grain.
      gl_FragColor.rgb += (gt3Random(gl_FragCoord.yx + vec2(19.19, 73.73)) - 0.5) / 255.0;`);
  material.needsUpdate = true;
}
