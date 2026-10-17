/**
 * renderProfile.js — the Grand Tour experience profile (SPEC §31; Phase 3 reopening 2026-10-16).
 *
 * `?version=unlocked` selects the higher-fidelity technical profile. Anything else, including
 * no parameter and `?version=locked`, is the owner-accepted Phase 3 experience (fixed DPR1 +
 * SMAA, 2026-10-14), which must render exactly as accepted.
 *
 * Selected only by the explicit URL. Never by host, GPU, OS or benchmark result. Unrelated to
 * the locked/unlocked car identities (progression), which never read this module.
 *
 * Contract for shared code: read UNLOCKED once at module scope and keep the locked branch
 * textually identical to the accepted values, so locked output cannot drift.
 */

const params = new URLSearchParams(globalThis.location?.search || '');
export const VERSION = params.get('version') === 'unlocked' ? 'unlocked' : 'locked';
export const UNLOCKED = VERSION === 'unlocked';
export const QUALITY_MODE = UNLOCKED && params.get('mode') === 'quality' ? 'quality' : 'smooth';
const requestedTone = params.get('tone');
const requestedReflection = params.get('refl');
// Owner-approved Stage 1 unlocked look (2026-10-17): split tone (Neutral Day / ACES Night),
// mid reflections, quarter Day car specular. The URL overrides remain for review comparisons.
export const TONE = UNLOCKED && ['aces', 'agx', 'neutral', 'split'].includes(requestedTone) ? requestedTone : 'split';
export const REFLECTION = UNLOCKED && ['low', 'mid', 'high'].includes(requestedReflection) ? requestedReflection : 'mid';

// Review-only T5 controls; locked ignores both.
export const CAR_SPECULAR = UNLOCKED && params.get('carspec') !== 'full' ? 0.25 : 1;
export const NIGHT_CAR_TOE = UNLOCKED && TONE === 'neutral' && params.get('nightcar') === 'toe';

// Stage 1 candidates, not the Stage 2 frontier verdict. Both use the accepted SMAA,
// shadow and texture choices; only fixed resolution differs. No host selection.
const unlockedThemes = Object.freeze({
  day: Object.freeze({ exposure: { aces: 0.265, agx: 0.16, neutral: 0.35 }, reflection: { low: 0.35, mid: 0.7, high: 1.4 },
    // Linear HDR endpoints inverted through this tone + sRGB transform to keep
    // the accepted displayed fog/sky colors. Exposure alone cannot match these.
    atmosphere: {
      aces: {fog: [0.9167012, 0.852154, 0.5667138], horizon: [1.3677423, 1.0965862, 0.587203], zenith: [0.2052935, 0.4078435, 0.6237547]},
      agx: {fog: [1.7594547, 1.6682301, 0.8583113], horizon: [3.2461371, 2.5232345, 0.8466975], zenith: [0.1885852, 0.4707076, 0.8754394]},
      neutral: {fog: [0.9722074, 0.9111275, 0.6302821], horizon: [1.3694432, 1.1548581, 0.6872787], zenith: [0.2235489, 0.4123189, 0.6302269]},
    },
  }),
  night: Object.freeze({ exposure: { aces: 0.29, agx: 0.17, neutral: 0.13 }, reflection: { low: 0.07, mid: 0.14, high: 0.28 },
    // Linear HDR endpoints inverted through this tone + sRGB transform to keep
    // the accepted displayed fog/sky colors. Exposure alone cannot match these.
    atmosphere: {
      aces: {fog: [0.0530046, 0.0755678, 0.129054], horizon: [0.0543397, 0.079098, 0.1378194], zenith: [0.0157363, 0.0242109, 0.0440163]},
      agx: {fog: [0.0528805, 0.0670719, 0.1174459], horizon: [0.0541023, 0.0697661, 0.1258653], zenith: [0.018563, 0.024587, 0.0421053]},
      neutral: {fog: [0.2141968, 0.241157, 0.3175701], horizon: [0.2180967, 0.2485147, 0.3354783], zenith: [0.0792371, 0.0846394, 0.0993592]},
    },
  }),
});
export const SETTINGS_TABLE = Object.freeze({
  locked: Object.freeze({ dpr: 1, output: false, carEnvironment: false }),
  // Stage 2 interface (manager, 2026-10-17). W3 owns the values; W5 consumes textureSet and
  // anisotropy in the loader. Absent keys mean the accepted locked behaviour.
  'unlocked/smooth': Object.freeze({ dpr: 1.5, output: true, carEnvironment: true, themes: unlockedThemes,
    textureSet: 'tour', anisotropy: 1 }),
  'unlocked/quality': Object.freeze({ dpr: 2, output: true, carEnvironment: true, themes: unlockedThemes,
    textureSet: 'tour', anisotropy: 1 }),
});
export const SETTINGS = SETTINGS_TABLE[UNLOCKED ? `unlocked/${QUALITY_MODE}` : 'locked'];
