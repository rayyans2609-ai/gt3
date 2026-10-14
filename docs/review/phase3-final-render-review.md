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

1. **Edges:** road edges, curbs and grid paint at the parked grid and the hairpin. Are they clean enough now? (SMAA cost figures measured at native Retina on the intermediate build; the shipped default renders at DPR1, see §F.)
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
| Performance (Sol, intermediate build, SMAA only toggled; superseded by §F) | Measured | GPU p50 at native DPR2: rest 33.5 → 38.1 ms (+4.6); adaptive motion 10.2 → 11.8 ms (+1.6). SMAA adds about 62.5 MiB of screen targets at DPR2. No new GPU stall. The host paged around browser launches before and during the run, so perfect memory stability is **not** proven. Trackpad feel is your check. |

Evidence: `docs/review/p3z-render/` (render/grid/props before/after crops and data) and `docs/review/p3z-final/` (`finish-v1-day.png`, `finish-v1-night.png`, `timer-day.png`, `timer-night.png` showing the white HUD).

## 6. Routing

- **Opus (manager):** routing and integration. Its Anchor Task was the finish V1 forensics and restoration. The HUD and SPEC edits went through the fast path.
- **Sol `gpt-6.1-sol` @ xhigh:** execution lead for R1/G1/P1/E1/C1/B1. It spawned no children and kept the coupled diagnosis itself.
- **Luna `gpt-6-luna` @ high:** ran the integrated browser checks mechanically.
- **MCP / tools:**
  - Playwright and Chrome DevTools MCP were not needed. The repo's Puppeteer harnesses on real ANGLE/Metal GPU already covered capture, GPU timer queries and runtime state, and a second browser stack would have competed for the 8 GB host.
  - Context7 was not needed, because three.js internals were read from the installed source.
  - The frontend-design skill was not applicable, because HUD design work is deferred.

---

# Addendum — acceptance corrections (2026-10-13/14)

You accepted the rendering, finish, props and HUD, and accepted the Lamborghini as is. This round covers only your three items. **Not owner-accepted yet.**

## A. Performance and hitching — proven cause, measured fix (Sol @ xhigh)

> **Superseded in part by §F.** This section describes the *intermediate* build `6064a30` (native resolution at rest, DPR1 in motion). The owner later rejected that default as still hitching and chose **fixed DPR1 + SMAA**. The native-resolution figures and "no visible tradeoff at rest" claims below are history, not the shipped behaviour.

**Cause, proven by measurement.** The canvas still requested its own **4× MSAA** buffer. It only ever held the final full-screen image: the 3D scene renders off-screen, and SMAA handles its edges. Every scroll start and stop switches resolution (DPR 2 ↔ 1), and that resize of the MSAA canvas took a median **139 ms** in the current build, versus 50 ms before this Phase 3 run. That stall is the hitch.

**What was ruled out:**
- *Full props and the new geometry:* lean props behaves like the current build, while full props with SMAA off behaves like the baseline.
- *Garbage collection:* the largest collection was 5.7 ms in the traced window that had 100+ ms resize stalls.
- *The SMAA buffer rebuilds:* caching them cut allocations from about 98 to 2 but barely moved the slow frames, so it was not shipped.

**Fix (`f16f82b`, one file, `src/scene/sceneSetup.js`):**
- The canvas is single-sample: MSAA is off on the output only, and SMAA stays.
- The canvas stays at native size, with no reallocation on scroll start/stop. In motion it draws a smaller region, which is scaled to the same screen area.
- The 8-tap motion blur no longer runs at rest resolution on tiny residual speed.

The motion/rest resolution policy, **SMAA and full props are unchanged**.

**Matched before/after** (Chrome 155, Intel UHD 617, ANGLE/Metal, 1280×800 at DPR 2; A = pre-run `3d5c504`, B = `6d001ce`, E = fixed):

| | A baseline | B before | **E after** |
|---|---|---|---|
| Frame p50 / p95 / p99 | 17.6 / 43.4 / 80.1 ms | 19.0 / 47.8 / 82.7 ms | **18.9 / 35.0 / 63.2 ms** |
| Frames > 33 ms / > 50 ms per 10 s | 85.5 / 12.3 | 89.4 / 11.0 | **81.9 / 6.5** |
| Worst frame | 177 ms | 593 ms | **163 ms** |
| Worst frame ≤ 0.5 s after a switch (median) | — | 173 ms | **97 ms** |
| GPU p95 | 36.8 ms | 42.1 ms | **33.9 ms** |

Against B, frame p95 drops 27%, p99 drops 24%, and frames over 50 ms drop 41%. Same-view crops at rest (grid, hairpin, BMW) are **pixel-identical** to B, so the rendering improvement is fully kept.

**Tradeoff (intermediate build only):** none visible at rest. *The shipped default now differs: see §F, where the resting image is softer by design.*

**Remaining limits:**
- About 100 ms gaps right as scrolling starts persist in every build, including the pre-run baseline. Their cause is unproven.
- Native rest rendering is still above a 60 Hz frame budget on this GPU.
- Every timed run had small host paging (≤ 1.2 MB), so a perfectly clean-host comparison was impossible on this 8 GB Mac.

Scroll feel is your call.

Evidence: `docs/review/p3y-perf/NOTES.md` (full matrix: A, B, SMAA-off C, lean D, and seven intervention controls) and `docs/review/p3y-perf/images/`.

## B. Grid lateral spacing

- **Columns:** now 7 m either side of centre (was 6 m). The gap between neighbouring boxes grows from **2.38 m to 4.38 m**.
- **Unchanged:** slot size (9.62 × 15.42 m), 26 m row pitch, 8 m stagger, P1/P2 distance, route mapping and lap progression.
- **Start pose:** the parked car moves with its slot and stays centred, with 1.0 m each side.
- **Road:** the closest paint-to-asphalt edge is 8.28 m, so no widening.

## C. Switzer typography variant

- **Default:** `/` stays **Neue Haas Grotesk**.
- **Variant:** `/?font=sw` switches to **Switzer** (variable, weights 100–900, regular and italic) in the display and UI roles. It combines with other options, e.g. `/?font=sw&grid=p2` or `/?font=sw&props=lean`.
- **Unchanged:** Geist Mono (timer) and the braking-board canvas text.
- **Applied before first paint**, so there's no flash of the wrong font.
- **Local-only fonts.** The Switzer files are *not* committed: like the Neue Haas trial files, they live in the git-ignored `font/` folder, which this worktree has. A fresh checkout falls back to Neue Haas/Helvetica.
- **License:** Fontshare FF EULA (`font/Switzer_Complete/License/FFL.txt`). It allows web use; committing the files is a decision for when you pick the permanent font.

## D. Verification

Integrated head `phase3-integration`: performance and grid were tested at `3d65541`; the font at `7bde9b3`, which adds only `?font=sw`-scoped CSS and tests. Real Chrome with ANGLE/Metal, an owned Vite server, one heavy job at a time.

| Check | Result |
|---|---|
| Production build | PASS |
| `verify-facility` (default full / `?grid=p2&props=lean`) | PASS: all ten slots at ±7 m, parked car to slot error 0, neutral first pass, V1 finish, locked silent refresh, Replay |
| `verify-timer-finish` | **PASS 9/9**: the V1 finish, lock and Replay are unaffected by the render fix |
| `verify-font-variant` (default / `?font=sw` / `?font=sw&grid=p2`) | PASS: flag set before first paint; Switzer loaded only for the variant; Geist Mono unchanged; grid query combined; all ten cars' name and headline at natural height (no clipping); 0 HTTP errors |
| node: tour progress / finish state / lap timer | PASS |
| Sol (`p3y-perf`) | build; all nine checkpoints in both directions with 0 crossing GL uploads; cold Day and Night first crossings; viewport/resize checks at 1440×900 DPR2, 1360×850 DPR1 and 1280×800 DPR2 |

**Font fix found by verification.** Switzer's taller metrics clipped the car name, and the headline for six cars with two-line headlines, by about 2 px. Fixed only under `?font=sw`: name line height 1.2, and the identity lines keep their natural height. The Neue Haas layout is unchanged.

Evidence: `docs/review/p3y-perf/` (performance matrix, crops, data) and `docs/review/p3y-final/` (grid at ±7 m for P1 and P2; start card, HUD and identity comparisons for default vs Switzer).

## E. Your checks

1. **Hitching:** scroll start/stop, cruise, the hairpin and a checkpoint on `/`. Is it smooth enough now?
2. **Rendering:** **not** unchanged: the adopted fixed DPR1 default renders softer than the build you accepted for sharpness (§F). Check that the softness is acceptable on edges, curbs, grid paint and cars.
3. **Grid:** is the lateral spacing right at 7 m (`/` and `/?grid=p2`)?
4. **Font:** compare `/` and `/?font=sw` across the start card, HUD, finish notice and edge controls.

## F. Owner decision — fixed DPR1 + SMAA adopted as the Phase 3 default (2026-10-14)

**Decision.** The owner manually compared fixed DPR1, DPR1.25 and DPR1.5 (each with SMAA) against the previous adaptive default and chose **fixed DPR1 + SMAA** as the Phase 3 default. In substance: a much smoother experience with a slightly softer image, accepted. This is an explicit owner-approved performance/quality tradeoff.

**What changed in code.** In `src/scene/sceneSetup.js`: a new exported constant `RENDER_DPR = 1`; `ADAPTIVE_RES.high` and `ADAPTIVE_RES.low` are both set to it, and `resizeScene` sets `high` to it, so dynamic idle/motion resolution switching is inert by construction. SMAA, the single-sample canvas (no canvas MSAA), full props, geometry, finish, checkpoints, HUD, grid and Switzer (`?font=sw`, Neue Haas default) are unchanged. Commit: `1f58a1a`.

**What the image looks like.** Rest and motion both render at one buffer pixel per CSS pixel (a 1280x800 buffer in a 1280x800 window) and are scaled up on a DPR2 display, so the image is softer than the previous native-resolution rest rendering. Measured earlier on this branch, start/stop and sustained scrolling hitches were substantially reduced versus the adaptive default; the owner judged this by hand.

**Evidence.** Earlier comparisons are preserved on branch `p3x-perf` (not merged) and copied into `docs/review/p3x-perf/` (matrix, transition windows, crops). The adaptive default measured a start-window worst-frame median of about 142 ms with 24 of 24 starts over 50 ms; fixed DPR1 + SMAA measured about 35 ms with 1 of 24 over 50 ms (headless measurement; physical feel is the owner's judgment). Continuous-scroll outliers still exist.

**Still open / not claimed.** Hitching is reduced, not eliminated. The `?pace=30` experimental pacing was not adopted and is not in the default. Checkpoint-specific hitching was not investigated to a conclusion and is deferred unless it reappears under this configuration. No physical trackpad acceptance is claimed. Phase 3 final acceptance remains the owner's.

**Verification.** Regression checks on the adopted default are recorded in the batch report at `docs/review/p3x-perf/REGRESSION-1f58a1a.md` (written by the manager after the run). Refer to that file for results.
