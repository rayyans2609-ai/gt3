/** Presentation-only distance past the return gantry. Logical route remains 0..1.
 * Deliberately bounded well before checkpoint one. Refresh restores the gantry,
 * not this transient offset; Phase 7 owns the eventual completion transition.
 */
export const FINISH_TAIL_METERS = 80;
