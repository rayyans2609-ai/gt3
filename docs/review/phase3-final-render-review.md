# GT3 Phase 3 — final render / mechanics closure: owner review (2026-10-13)

This is the bounded final Phase 3 run, done per `GT3_PHASE3_FINAL_RENDER_HANDOFF_20261013`. It is **implemented and machine-verified (§5), not owner-accepted.** Your visual review is the only remaining gate before acceptance cleanup, push and merge. Nothing is pushed, and `main` is untouched.

## How to review

- **Code:** `phase3-integration` in `/Users/rayyansheikh/Desktop/gt3/.claude/worktrees/phase3b-aerial-camera`, at the SHA in §5.
- **Run:** the already-running server at **http://localhost:5173/**, which serves this worktree (hard-refresh with Cmd+Shift+R). If it is gone, run `npm run dev` from that folder.
- **URLs:**
  - `/`: default (full props, P1 grid);
  - `/?props=lean`: the lean comparison;
  - `/?grid=p2`: the P2 start slot.
- **Evidence:** before/after crops in `docs/review/p3z-render/images/` (index in `docs/review/p3z-render/NOTES.md`).

## 1. Outcomes per register item

| ID | Outcome | What changed (root cause) |
|---|---|---|
| R1 static jaggedness | **Fixed where proven; Lamborghini partly** | The scene rendered into **0-sample** composer targets: canvas MSAA (4×) never touched the 3D scene. Added SMAA before the grain pass. Geometry defects were fixed at source: curbs had an 8 m triangular "spear" taper and sampled different chords from the shoulders (now a 2.4 m closed nose on shared rings, with the verge contour kept smooth); the pit lane intersected terrain at 8 vertices (now ≥ 32 mm clear). Road-edge tessellation was already sub-pixel accurate (≤ 0.07 px chord error), so it was not retessellated. The Lamborghini's edges improve; its dark paint, small footprint and thin glossy details remain pixel-limited. No asset re-authoring. |
| G1 start grid | **Fixed** | Row pitch went from 16 m (only 1.8 m between boxes) to 26 m, with an 8 m stagger and 9.6 × 15.4 m bracket slots and 0.38 m paint following the grade. No corridor widening needed. The P1/P2 start pose and route mapping are unchanged. |
| P1 props | **Fixed** | **Full is the default**; `?props=lean` remains. Only the hairpin catch-fence panels (t .263–.308, which read as detached black blocks) and the stray marshal/service slab group (t .247) were removed. Armco, other barrier runs, tyre stacks and the remaining marshal/service group stay. |
| E1 placeholders | **Verified / fixed** | No trees remain. The stray slab group is removed, and curb tips and the pit-lane intersection are fixed (R1). |
| C1 checkpoints | **Verified, no change** | All 9 posts, beams and stripes are present; stripe centres match the swap locations (≤ 0.03 mm). |
| B1 braking boards | **Bug fixed; legibility deferred** | The atlas shader patch never applied, so every board showed the whole 150/100/50 sheet. Each board now shows its own number. Boards are still too small and foreshortened from the aerial camera to read reliably. Size, orientation and design are **Phase 8**. |
| H1 HUD | **Fixed** | Car name, headline and spec are plain **white** in Day and Night, with no halo or shadow. No layout, font or card change. |
| F1 finish | **Historical V1 restored** (§2) | The post-finish coast (V3) is removed. The current compact "GRAND TOUR COMPLETE" notice with **Replay Route** is kept. |
| T1 timer | **Verified, unchanged** | Starts on driving, pauses after about 1 s idle, resumes, freezes at the gantry crossing, survives reload, and resets on Replay. |
| S1 preserve | **Preserved** | Racing line, camera, width classes, gate sweep, Day crossfade / Night pulse, scroll and Night lighting: no source changes. |

## 2. Finish: V1 / V2 / V3 provenance

| | Commits | Mechanics |
|---|---|---|
| **V1** (restored) | `d1c779d` (Sep 27) … `8795519` (Oct 9, last build you reviewed before Option A); finish code unchanged since `56328db`/`5ec3867` | Gate at lap t 0.994 of a 5006.8 m lap; the route runs on 30 m. The car drives through the line under your scroll; at t ≥ 0.995 (**5 m past the line**) `lockScroll()` halts it where it stands, `mode='finish'` → `complete`, the finish SFX plays once and the card fades in. Scroll input is swallowed; **Replay Route** is the way back. Refresh restores the locked finish silently. |
| V2 | `2457b2c` + `9e27a72` (Oct 9, Option A) | Gantry moved to the route endpoint p = 1; bounded scroll *lands exactly on the line*, so the car centre stops on it. Adds a reverse-wheel/key escape that hides the card and jumps 2 m back. |
| V3 (cancelled) | `5566401` (Oct 12) | No lock: an 80 m scroll-controlled tail past the gantry under a frozen camera, a compact bottom notice with Replay Route, and the stopwatch. |

**How V1 sits on Option A** (`4940169`):
- The Option A route still ends logically at the gantry (p = 1). Checkpoints, persistence and the first neutral crossing are untouched.
- V1's 30 m run-out lives in the existing `finishTailMeters` channel.
- V3's two "land on the gantry" clamps are removed, so your own driving carries the car through the line.
- Completion fires at **+5.0 m** and locks the drive; nothing moves afterwards.
- The camera follows the car normally (V3's frozen camera is removed).
- The stopwatch freezes at the line itself.
- The newer notice UI is kept unchanged.

**Compatibility note.** Under V1 a programmatic seek *to* the line no longer completes. Only driving through it does, as in V1, where the threshold sat past the gate.

## 3. Your checklist (subjective only)

1. **Edges:** road edges, curbs and grid paint at the parked grid and the hairpin. Are they clean enough now? (SMAA costs about +4.6 ms GPU at rest at native Retina and about +1.6 ms in motion.)
2. **Lamborghini** next to another car. Is the remaining small glossy-detail roughness acceptable for Phase 3, or a Phase 6/8 asset item?
3. **Grid:** do the stagger, spacing and slot fit around the car read as a credible grid (P1 default, and `?grid=p2`)?
4. **Full props** at the hairpin and elsewhere: is the selective removal right, or is anything else still a "black block"?
5. **Finish:** drive a full lap. The first gantry pass does nothing; on return the car crosses, stops about 5 m past the line, and the notice and Replay Route appear. Does this match the V1 you remember?
6. **Decision:** under V1, scrolling backwards at the finish does nothing (Replay is the only exit). V2's reverse-escape was intentionally not kept. Keep it this way?
7. **HUD:** white top-left text over Day and Night terrain, readable for all ten cars?
8. **Braking boards:** fine to leave their legibility to Phase 8?

## 4. Deferred (not Phase 3; also in SPEC §31)

- **Phases 4–6:**
  - HUD typography and backing card;
  - track map;
  - start card and scroll cue;
  - the five-lamp start;
  - timer styling.
- **Phase 7:** the designed completion experience. It replaces the interim notice and the V1 lock.
- **Phase 8:**
  - braking-board size and design;
  - fencing/barrier design and prop density;
  - runoff materials;
  - vegetation;
  - track width dynamics;
  - checkpoint gateways;
  - elevation and banking;
  - Night lighting.
- **Backlog:** behind-car camera.

## 5. Verification

Tested code: `phase3-integration` at `ea72eda` (facility, persistence, build) and `d5ca42e` (timer + finish; differs from `ea72eda` only in one test tolerance). Real Chrome with ANGLE/Metal on the Intel UHD 617, an owned Vite server, one heavy workload at a time, and memory pressure normal at every gate.

| Check | Result | Scope |
|---|---|---|
| Production build | PASS | `vite build` on the integrated head |
| `verify-timer-finish` | **PASS 9/9**, 0 console errors | Stopwatch start, idle pause, resume, reverse, blur, reload; Day/Night timer contrast; neutral first gantry; **V1: freezes at the line, completes past it, drive locked; no coast or reverse escape; completed reload restores locked and silent; Replay Route resets** |
| `verify-facility` (default full / `?grid=p2&props=lean`) | PASS | Grid slot = parked rig, neutral first pass, return-line V1 completion, locked silent refresh, reverse swallowed, Replay reset, re-arm |
| `verify-route-persistence` | PASS 6/6 | Default/pace restore, fresh context, finish-state refresh, old-session migration, console |
| `check-finish-state`, `check-lap-timer`, `check-tour-progress` (node) | PASS | V1 state machine, timer clock, Option A mapping |
| Sol batch (`p3z-render`, reused) | PASS | 9 checkpoints × 2 directions (18 crossings, 0 GL uploads); cold Day and Night first crossing; §30.6 occlusion at 11 targeted points; pit-lane/terrain ray checks; static curb/profile; build. Reused because the finish changes only act at p ≥ 1 (the camera run-out offset is 0 elsewhere). |
| Performance (Sol, same source, SMAA only toggled) | Measured | GPU p50 at native DPR2: rest 33.5 → 38.1 ms (+4.6); adaptive motion 10.2 → 11.8 ms (+1.6). SMAA adds about 62.5 MiB of screen targets at DPR2. No new GPU stall. The host paged around browser launches before and during the run, so perfect memory stability is **not** proven. Trackpad feel is your check. |

Evidence: `docs/review/p3z-render/` (render/grid/props before/after crops and data) and `docs/review/p3z-final/` (`finish-v1-day.png`, `finish-v1-night.png`, `timer-day.png`, `timer-night.png` showing the white HUD).

## 6. Routing

- **Opus (manager):** routing and integration. Its Anchor Task was the finish V1 forensics and restoration. The HUD and SPEC edits went through the fast path.
- **Sol `gpt-6.1-sol` @ xhigh:** execution lead for R1/G1/P1/E1/C1/B1. It spawned no children and kept the coupled diagnosis itself.
- **Luna `gpt-6-luna` @ high:** ran the integrated browser checks mechanically.
- **MCP / tools:**
  - Playwright and Chrome DevTools MCP were not needed. The repo's Puppeteer harnesses on real ANGLE/Metal GPU already covered capture, GPU timer queries and runtime state, and a second browser stack would have competed for the 8 GB host.
  - Context7 was not needed, because three.js internals were read from the installed source.
  - The frontend-design skill was not applicable, because HUD design work is deferred.
