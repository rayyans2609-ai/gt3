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

export const VERSION = new URLSearchParams(globalThis.location?.search || '').get('version') === 'unlocked'
  ? 'unlocked'
  : 'locked';

export const UNLOCKED = VERSION === 'unlocked';
