# Regression record — fixed DPR1 + SMAA default (`1f58a1a`)

Proportionate checks after the owner adopted fixed DPR1 + SMAA (2026-10-14). Real Chrome with ANGLE/Metal, an owned Vite server, one heavy workload at a time. This is a regression record, not a performance experiment. Owner acceptance is separate.

| Check | Result |
|---|---|
| Production build | PASS |
| `verify-facility` (default full + `?grid=p2&props=lean`) | PASS |
| `verify-timer-finish` | PASS 9/9 (V1 finish, lock, Replay, timer) |
| `verify-swap-response`, cold Day and Night | PASS 6/6 (zero new programs/textures/geometries/GL uploads at the first crossing) |
| `verify-font-variant` (default Neue Haas, `?font=sw`, `?font=sw&grid=p2`) | PASS (no clipping for any car; Geist Mono unchanged) |
| Resolution probe | PASS: `applied` 1 and a 1280×800 buffer in a 1280×800 window at rest, during a scroll burst, and after; no switching |
| `verify-checkpoints` (full script, all 11 phases) | **Intermittent: 2 of 3 runs on `1f58a1a` pass all 11 phases; 1 run failed 2 phases** (see below) |

## Checkpoint verifier: one intermittent failure, not reproduced

Run 1 (inside the first batch) failed two legacy phases: `real-wheel gate reversals` (a programmatic glide `seek(0.678, instant=false)` never started, with progress and target stuck at 0.6717) and `frame and swap diagnostics` (a later glide `seek(0.2)` could not move because the car was at the V1 completion lock, `mode: finish`, `locked: true`). The nine-gate crossing, discovery sweeps, instant seeks, reload, replay and captures all passed in that run.

Reruns of the identical full script on the same commit passed all 11 phases twice (run 2 and run 3). The pre-DPR1 adaptive build passes the same phases (its only failure is console errors from font 403s: the baseline worktree's `font/` symlink points outside Vite's allowed root, a harness artifact).

**Classification:** not reproduced and not attributable to DPR1 (the baseline passes these phases and the integrated build passed twice). Most likely a timing-sensitive legacy phase (wheel bursts and a programmatic glide at the edge of the bounded-scroll model) under host load; the second failing assertion is a knock-on of the first leaving the car at the V1 lock. **Not proven.** If a stuck programmatic glide is ever seen by hand, treat it as a real defect; the retained run-1 artifact is `regression/checkpoints-run1-FAILED.json`.

Earlier gates-only runs (Sol, on `p3y-perf`) skip these legacy phases, so they give no history for them.

## Not covered

No physical trackpad or scroll-feel test (owner's judgment). The Showcase is not wired into the current build; it shares the main renderer and would inherit the fixed DPR1 (recorded in SPEC §27 and §31 for Phase 6).
