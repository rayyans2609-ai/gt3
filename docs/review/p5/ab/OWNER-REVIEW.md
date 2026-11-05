# Phase 5 Hub — A/B review package (candidates, NOT accepted)

Two complete, competing Hub candidates for your live comparison. Neither is preselected, and nothing here is human-accepted. Built under Opus-led Autonomous Mode on the M4 (run `p5-hub`, epoch 2).

- **Branch:** `p5-hub-candidate`
- **Final commit:** the tip of `p5-hub-candidate`. Captures, manifest and runtime evidence were made at `4d8f78a`, the last code commit; the commits after it are documentation only.
- **GitHub:** https://github.com/rayyans2609-ai/gt3/tree/p5-hub-candidate
- `main` is untouched.

## Open them

**On the M4:**
```
cd ~/Documents/rayyan/gt3/.claude/worktrees/p5-hub
npm run dev            # then open a NEW browser tab (a new tab starts on the Landing)
```
- **A — Precision Plan:** http://localhost:5173/?hub=a
- **B — Dimensional Circuit:** http://localhost:5173/?hub=b

Scroll down through the Landing into the Hub, and scroll up to reverse. The parameter stays put through refreshes. A bare URL opens A only because the harnesses need a fixed default; it isn't a preference.

**Anywhere else:**
- `git fetch origin && git switch p5-hub-candidate && npm ci`
- Copy the licensed `font/` folder in (it's git-ignored).
- Run `npm run dev`.

## The two candidates
Both draw the same real circuit and the same discovery state. Each has its own composition, typography and motion.

| | A — Precision Plan | B — Dimensional Circuit |
|---|---|---|
| Idea | The Hub as an architectural drawing sheet: flat, no depth | A restrained, lit maquette of the circuit on the field |
| Circuit | Top-down hairline plan of the real asphalt edges, start checker, checkpoints numbered 01–09 | A thin ribbon of the same edges with a chamfer catching one key light, side faces and a contact shadow, seen at the Tour's own angle |
| START RACE | Display Medium, set in the infield's clear space | Display Bold capitals, floating in the infield |
| Navigation | A ruled title block (GT3, Cars, Showcase, Day/Night, player) instead of a navbar | A quiet index top-left; the player and theme toggle in a layered console strip |
| Your-position marker | Ink in Day, yellow in Night (same chevron as the minimap) | A raised steel-blue pin in Day, yellow in Night |
| Cars | The sheet re-plots larger; orthogonal leader callouts per checkpoint (name, or "?" until discovered) | The camera eases closer; gate posts rise; a discovered car stands as a turning scale model on its checkpoint |
| Listening | The cover takes the sheet; the six tracks as a drawing "schedule"; the circuit shrinks to a key plan | The cover becomes a thin card with depth; the maquette recedes behind a veil |
| Day/Night | Drafting switch; one hairline sweep crosses the sheet | Pressed toggle; the key light travels and the shadows sweep |
| Launch | The plan tilts up from top-down into the Tour's angle and dives onto the road | The camera descends into the maquette and the real Tour rises through it |
| Rendering cost | DOM/SVG only; no canvas draws in the Hub | Shared renderer, on demand: 0 draws at a settled rest, about 7 calls per redraw |

**Shared by both:**
- **States:** Race, Cars and Listening.
- **Player:** collapsed, expanded track list and full Listening view, as one object that transforms.
- **Mute and levels:** master mute in the player in every state, collapsed included; the global speaker isn't part of the Hub. Master, Music and Engine levels sit behind "Levels".
- **Showcase:** an honest deferral ("Showcase opens in the next build."). The future contract is `requestShowcase({ carIndex })`.
- **Signature launch:** the camera-aware circuit-to-road dive. The real Tour camera follows the interpolated path, so the drawn edges land on the rendered road.
- **Unchanged:** lamps only from a standing start, mid-route resume, persistence and the audio lifecycle.

## Also in this branch (your bounded refinements)
- **Landing:**
  - Click-and-drag McLaren orbit: free yaw, ±8° pitch, damped settle. It never disturbs scroll or the surface push.
  - A slightly livelier pointer and light response.
  - A sharper `GT3` wordmark that exits letter by letter with the scroll, reversibly.
  - A stronger `A Grand Tour` subtitle, and a scroll cue in the Tour's SCROLL TO RACE language ("Scroll to enter", provisional).
- **Tour:**
  - The brown bottom-left controls are now cool steel blue in Day and navy/yellow in Night.
  - The minimap car marker is persistently red in both themes; only the minimap marker is red.

## Evidence
- **Stills:** `stills/` (22, 1440×900 unless named `-1280`).
- **Motion:** `clips/` (7 MP4s, headless Chrome screencast with real frame timing; timing is approximate). Stills can't prove motion feel; please judge it live.
- **Index:** `manifest.json` lists every file, the SHA and the URL state.

## Verification (machine, M4 `m4-16gb`, headless Chrome on Metal, each run through `scripts/run-harness.sh` with provenance)

| Check | Result | Commit |
|---|---|---|
| Camera math (`check-circuit-camera`): 18 variant/viewport/progress cases | PASS: `poseAt(1)` equals the live camera; all 9,106 edge points match the asphalt mesh vertices exactly | `28d2294` |
| Signature launch (`verify-hub-launch --runs=3`), A and B, grid and mid-route resume | PASS 12/12. Alignment of drawn edges against the rendered road mesh: max 0.0007 px, median 0.0004 px. Lamps only from the grid; route position and marker preserved after Home | `f4dd721` |
| Launch frame pacing with nothing else on the host (preflight perf) | Warm (both A and B): dive p50/p95/max 16.7/16.7–16.8/16.8 ms, 0 frames over 25 ms; Home at most one 33 ms frame, 0 over 50 ms. **Cold first launch in a fresh browser** (see limitations): A's first dive max 50 ms (1 frame over 50), first Home max 133 ms (3 over 50) | `f4dd721` |
| Hub states (`verify-hub-states`), A and B, Day and Night | PASS. Race/Cars/Listening, collapsed/expanded, master mute visible and independent of music mute, seeded discovery (found 2 and 5 only; locked cars expose no name), Showcase deferral without navigation, `track_1`…`track_6` in order, no control overlaps, Escape back from Listening, theme flip | `10b162d` |
| Entry (`verify-entry-sequence`), A and B | PASS: five lamps only from a standing start, input locked through the reds, mid-route resume without lamps, Home during the reds | `57b463a` |
| Landing ↔ Hub ↔ Tour (`verify-landing-flow`), A and B | PASS (A re-run after the subtitle change: PASS 16/16) | `57b463a` / `ec32ba9` |
| Audio lifecycle (`verify-audio-lifecycle`), A and B | PASS 12/12 each: gesture-only start, music continues into the Tour and back, engine/SFX stop on Home, independent mutes | `57b463a` |
| GSAP on the single RAF (`verify-motion-ticker`), A and B | PASS: 0 GSAP-owned frames; B draws 0 frames once settled | `57b463a` |
| Landing drag (`verify-landing-drag`) | PASS: yaw changes, pitch clamped ±8°, velocity decays, the Sound control never starts a drag, scroll still reaches the Hub, push pose unaffected | `81ef9d9` |
| Route persistence, input before ready, Home from finish | PASS | `81ef9d9` |
| Tour edge row and compact player (`verify-controls`) | PASS | `57b463a` |
| B canvas cost (Spector) | 0 GL commands at a settled rest ("no frames with gl commands"); about 7 calls per Race redraw, plus the scale model's own calls in Cars | `81ef9d9` |
| Production build | PASS at every commit (the motion chunk with GSAP stays ~113 KB) | all |

## Limitations and deferred
- Measured on the M4 only, in headless Chrome. The Intel dive is unmeasured; on the Intel, run `scripts/run-harness.sh scripts/verify-hub-launch.mjs --runs=3`.
- **First launch after a refresh straight into the Hub hitches.** In a fresh browser, the first START RACE and the first Home compile Tour and Landing shaders on the spot: a few frames of 50–133 ms. Warm launches are clean for both candidates. Arriving from the Landing warms the Tour during the Hub's rest; only the refresh-into-Hub path pays it. Pre-warming the Landing scene for Home on that path is the obvious next step; it wasn't changed here without its own measurement.
- The alignment figure is geometric: drawn edge points against the rendered road mesh's vertices. The handoff itself is a perceptual judgment.
- `verify-hud.mjs` still checks the pre-Phase-5 start prompt, which the entry overlay replaced before this run. That's a stale harness, not a regression; the edge row is covered by `verify-controls` and the captures.
- **Known cosmetic remnants:**
  - In A's Listening view, a few faint, short hairline fragments remain near the title and at the bottom of the schedule.
  - In B's Cars view, the transient "Showcase opens in the next build." line can sit over the ribbon while it's shown.
- Not built: the Phase 6 Showcase (only its contract and the deferral exist), a separate SFX level, and replacement SFX.
- **SPEC deltas you directed, recorded here and not yet written into SPEC.md:**
  - Cars is circuit exploration and Showcase is a separate control (§25).
  - Master mute recomposes into the Hub player (§8; it never vanishes).
  - The Landing wordmark, subtitle and cue were reopened (§23).

## What only you can judge
1. A vs B, or elements of each, as the Hub direction.
2. The START RACE/circuit relationship in each, with the player collapsed and expanded.
3. The launch and Home choreography in each, and whether the handoff reads as entering the real road.
4. Cars: callouts (A) vs turning scale models (B). Is B's in-scene model worth its cost?
5. Listening: the schedule and key plan (A) vs the depth card (B).
6. Day/Night: the hairline sweep (A) vs the travelling key light (B).
7. Landing: drag feel, wordmark exit, subtitle weight, "Scroll to enter".
8. Tour: the steel-blue/navy control palette and the red minimap marker.
