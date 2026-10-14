# GT3 Phase 3 MVP closure — owner review

The final Phase 3 engineering pass, per the 2026-10-12 brief. It is implemented and machine-verified, as detailed in §4. **It is not owner-accepted:** your visual review is the only remaining gate before acceptance cleanup, push and merge. Nothing is pushed and `main` is untouched.

## How to review

- **Code:** `phase3-integration` in `/Users/rayyansheikh/Desktop/gt3/.claude/worktrees/phase3b-aerial-camera`, at the SHA in §4.
- **Run:** `npm run dev` from that folder, or use the already-running server at `http://localhost:5173/` (hard-refresh with Cmd+Shift+R).
- **URLs:**
  - `/` — default: lean props, `pro` proportion, P1 grid start;
  - `/?props=full` — the fuller prop set, kept as a Phase 8 comparison;
  - `/?grid=p2`;
  - `/?look=p1` and `/?look=p2` — proportion alternatives from the previous run.
- **Day/Night toggle:** at the bottom edge.

## 1. Screenshot outcomes

| Screenshot / callout | Outcome | What changed |
|---|---|---|
| 01 · top-left "soft underglow", monospace small text | **Fixed** | Halo removed. Headline and spec in the UI sans, a little larger and bolder. The translucent card is **deferred** to Phases 4–6. |
| 01 · angular dark render along the corridor | **Removed** | It was the parallel pit-lane strip (50 rotated boxes). Gone from the default; in `?props=full` it is rebuilt as one joined strip. |
| 01 · grid slots too small | **Fixed** | Grid boxes enlarged so they frame the parked car (about 8.8 × 14.2 m at the default proportion), with 30 cm lines; P1 and P2. |
| 01 · bottom scroll cue should be more obvious | **Deferred** | Phases 4–5 start flow (five-lamp overlay). Unchanged here. |
| 02 · choppy/segmented white edge line | **Fixed** | Cause: a 15 cm line projects to under a pixel at the aerial distance, so it aliased. The line is now 25 cm with shader-level edge smoothing; placement unchanged. |
| 02 · low-poly trees | **Removed** | All 140 removed. Vegetation is deferred to Phase 8. |
| 02 · checkpoints too skinny | **Fixed** | Gate posts and beam thickened (beam underside clearance kept). A 2 m transverse stripe across the road under each of the nine gates. Full gateway redesign deferred to Phase 8. |
| 02 · track width could be more dynamic | **Deferred** | Phase 8. |
| 03 · fences/barriers ugly | **Removed from default** | Lean default keeps only the 150/100/50 braking boards at three genuine braking zones, two minimal barrier runs and the existing tyre stacks. Fencing is in `?props=full` only; its design is deferred to Phase 8. |
| 03 · bare grey/black runoff | **Fixed (provisional)** | Shoulders and runoff are a restrained sand-brown. Asphalt unchanged. Final materials deferred to Phase 8. |
| 03 · useless render (bottom right) | **Removed** | Service strip and marshal post. |
| 03 · lap timer | **Added** | See §2. |
| 03 · braking boards / sponsor gateways | **Kept / deferred** | Boards stay at the real braking zones. Sponsor-gateway checkpoints are a Phase 8 study. |
| 03 · behind-the-car camera mode | **Deferred** | Backlog, after Phase 8. |

## 2. New behaviour

**Lap timer** (bottom-left, `MM:SS.s`, weighted mono):
- starts on your first real scroll-driven travel after ready, never on load, restore or programmatic moves;
- counts forward and in reverse;
- pauses after 1 s without effective travel; trackpad smoothing alone can't keep it running;
- resumes when you drive again;
- freezes exactly at the finish crossing;
- keeps its time on reload, paused, and never counts time spent away;
- reversing back over the line and driving resumes the same stopwatch without a second completion;
- **Replay** resets it.

**Finish tail:**
- **At the crossing:** on the return gantry crossing the lap completes once and the timer freezes. The camera holds its finishing view.
- **The tail:** scrolling moves the car up to 80 m past the gantry to a stop that stays 371 m before checkpoint one. Nothing fires in the tail (no checkpoint, sound, swap or discovery).
- **First pass:** the first gantry pass is still neutral.
- **Reversing out:** this returns to normal driving.
- **Removed:** the old completion scroll lock and the 2 m reverse teleport.
- **Completion notice:** a compact notice with Replay replaces the obstructing scorecard.
- **Refresh:** a refresh drops the transient tail and restores at the gantry.

The cinematic completion transition stays in **Phase 7**.

## 3. Preserved

Racing-line weaving, camera, proportions, the Option A grid start, nine checkpoints with `gate=sweep`, Day crossfade / Night pulse, route persistence, reversibility, the accepted occlusion fixes, and unchanged Night rendering.

## 4. Verification

Final code is `8215f67`. Every heavy check ran through the canonical strict host gate, with no thresholds relaxed.

| Check | Result | Tested SHA |
|---|---|---|
| Build | PASS | 8215f67 |
| Timer + finish suite (10 checks: start rules, 1 s idle, resume, reverse, reload with no phantom time, blur, Day/Night contrast, neutral first pass, freeze once, tail fixed-view stop before CP1 with no effects, reverse-out continuity, completed reload + Replay) | PASS | 8215f67 |
| HUD suite, scenarios 1–7 (layout, info across crossings and retargets, ten-car text fit at 1600/1101 with the new typography, sound cue) | PASS | 8215f67 |
| HUD suite, remaining scenarios (narrow width, reduced motion, F key, Day/Night pass) | **NOT RUN: host-interrupted** (5 attempts stopped by the paging monitor) | — |
| Nine gates, cold first crossing with zero GL allocations, both directions | PASS (subcheck) | 8215f67 |
| Full checkpoint suite | PASS on WS-A branch; on the merged head it was host-interrupted before completion | 44f6e42 (WS-B changes no checkpoint code) |
| Smoke: `/`, `?look=p1`, `?props=full` | PASS | 8215f67 |
| Terrain occlusion, including t 0.63–0.70 | PASS | 44f6e42 (merge adds no geometry) |
| Day/Night swap response | PASS | 44f6e42 |
| Route persistence, scroll-before-ready, scroll pacing (cap) | PASS | 144593b (WS-A changes no input/session code) |
| Draw calls / triangles | Trees, fences and placeholders removed; stripes add one static draw (18 triangles). Measured after-perf PASS; the before-baseline harness failed on archived-source font serving, so the prior verified 9e27a72 numbers are the reference. | 44f6e42 |

**Fixed in this run (harness, not product):** the reverse-continuity check timed frames with the browser's frame timestamps instead of the app's clock. A delayed frame under host load looked like an 8 m jump. This was reproduced deliberately with a controlled 80 ms delay and fixed without loosening the 15 m / 230 m/s limits.

**To finish the host-blocked HUD/checkpoint suites on an idle Mac:**
```
GT3_BATCH_OUT=/Users/rayyansheikh/.claude/jobs/d1cd9f0a/tmp/p3m-int-final-06 /Users/rayyansheikh/.claude/jobs/d1cd9f0a/tmp/p3c-heavy.sh bash /Users/rayyansheikh/.claude/jobs/d1cd9f0a/tmp/p3m-int-resume-batch.sh
```

**Captures** (job folder):
- `p3m-int-final-04/shots/day-drive.png`, `night-drive.png` — merged head;
- `p3m-scene-captures/` — per-feature, including `?props=full` and `?grid=p2`;
- `p3m-finish-target-finish/tail-stop-day.png`, `tail-stop-night.png`.

**Not machine-verifiable (yours):** look and feel, timer placement, tail stop composition, real wheel/trackpad feel, Night appearance.

## 5. Your visual checklist

1. Top-left identity in Day and Night: no glow, sans copy, legible over the green terrain. Sol flagged Day contrast as worth your look.
2. Edge lines through corners: smooth now?
3. Start: do the grid boxes frame the car? (`/` and `?grid=p2`)
4. Checkpoints: thicker gate plus stripe. Do they read as a car-change point?
5. Default (lean) furniture vs `?props=full`: is the default sparse but credible?
6. Sand-brown runoff and shoulders: acceptable as provisional?
7. No trees, sawtooth strips or stray blocks anywhere on the lap.
8. Timer: placement and readability; pauses about 1 s after you stop; resumes; freezes at the finish.
9. Finish: first pass does nothing; on return, the camera holds while you scroll the car to a stop; reversing out works.
10. Night: looks the same as before apart from the cheap fixes.

## 6. Still open (yours)

- Visual acceptance of everything in §1–2, especially the timer placement, the 80 m tail stop and real mouse/trackpad feel.
- From before: camera stillness, 512-px textures, startup time and `compileAsync`.
- Then acceptance cleanup: remove losing params and dev labels. Push and merge only on your word.
