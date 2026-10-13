/** V1 finish run-out (restored 2026-10-13). Logical route remains 0..1.
 *
 * Historical V1 (d1c779d..8795519, before Option A): the gate stood at lap t 0.994 of a
 * 5006.8 m lap, the route ran on to t 1.0 (30 m past the line) and completion fired at
 * t >= 0.995 (5 m past the line). The car carried its own driving through the line;
 * completion then locked scroll, halting it where it stood. Nothing moved afterwards.
 *
 * Option A ends logical progress at the gantry (p = 1), so the V1 run-out lives here as
 * physical metres beyond that line. This is not a post-finish coast: completion locks
 * the drive at FINISH_PAST_LINE_METERS, so the run-out is only reachable before finish.
 */
const V1_LAP_METERS = 5006.8196682221;
export const FINISH_TAIL_METERS = (1 - 0.994) * V1_LAP_METERS;            // 30.0 m
export const FINISH_PAST_LINE_METERS = (0.995 - 0.994) * V1_LAP_METERS;   // 5.0 m
