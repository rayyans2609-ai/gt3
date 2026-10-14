# Phase 3 visual review — coupled candidates

Owner chooses; no candidate is accepted. Branch `p3r-visual`, product source `84c2f83` (earlier checkpoints `f3ea963`, `e02c6fd`), based on `ec9b697`. No push or merge.

Run from this worktree on an owned Vite server at 5199, under the shared heavy lock. URLs below need that server. A valid `look` owns the whole composition; existing `comp`/`cam` behavior remains exact when `look` is absent or invalid. Numeric development overrides still apply last.

| Candidate / exact URL | Distance / pitch / vertical FOV | Uniform hero | Road / median hero widths | Ordinary B line / curb target | Intent |
|---|---|---|---|---|---|
| glide+ — http://127.0.0.1:5199/?look=r1 | 240 m / 55.64° / 40° | 2.28× (+20%) | 16 m / 3.52 | ±3.93415 m (×1.15) / +6.128 m | Keep glide distance, enlarge hero and deepen roof view; one hairpin curb event. |
| closer — http://127.0.0.1:5199/?look=r2 | 218 m / 54.6° / 38° | 2.09× (+10%) | 15 m / 3.60 | ±3.76310 m (×1.10) / +5.799 m | Trade 22 m of distance and 2° of FOV for prominence with less hero oversizing. |
| bold — http://127.0.0.1:5199/?look=r3 | 240 m / 57.2° / 40° | 2.47× (+30%) | 17.2 m / 3.49 | ±4.10520 m (×1.20) / +6.557 m | Keep broad glide distance; largest hero, deepest pitch, two curb events. |

Yaw stays 75°, corridor camera, rail sigma 300 m, zone ±0.74 x / ±0.72 y, no corner holds. Fog remains distance-scaled; shadow scale 2. Road ratios use the existing upper-median normalized roster accessor width, matching the review package. Including Audi's wide wing/mirror envelope, ratios are 2.49 / 2.54 / 2.47 respectively.

Curb use is a compact C3 window at the left hairpin (t=0.283, radius 65 m). Bold adds the chicane left/exit apex (t=0.365, radius 70 m). Only these windows allow body overhang; the red/white curb is widened to the existing 2.6 m dimension, with smoothing and wheelbase margins. The ordinary B line remains geometry-led. No rendered racing-line guide. Candidate-only ground support fits cached tread footprints for all four tyres to the asphalt/curb surface, preserving uniform scale. The asphalt surface is 2 cm below the spline; the curb rises from +0.005 to +0.105 m.

## Measurements

Route-wide node projection at 501 points: glide+ **2.406–3.859%**, closer **2.543–4.109%**, bold **2.670–4.137%** of frame width. Same 4.6 m projected nose-to-tail metric as the review package. Browser rail projection confirms each range at the same 501 positions. A matched 501-point node baseline for B/glide is 1.878–3.318%; the old 2.0–2.8% review range used fewer representative browser points, so the ranges have different coverage.

Tyre/pivot browser check: **PASS all three**, 180 samples each (10 cars × 18 route positions), all four tyre footprints on real asphalt/curb triangles, uniform root/mount scale, zero console/page errors. Maximum contact errors: **0.84 / 0.75 / 0.93 cm**. Pivot measurement removes authored body roll and bob, as the existing verifier does. BMW has two supporting tyres on curb at t=0.283 for all presets and at t=0.365 for bold. All ten tread caches exist before readiness; switching models creates zero new caches. Their measured preload CPU scan totals were 247 / 148 / 149 ms; these are not startup deltas.

| Candidate | Camera / car path length, hairpin | Chicane | Conservative body margin to runoff at curb | Min ordinary asphalt body gap | Max path yaw vs road |
|---|---|---|---|---|---|
| glide+ | 0.915 (172.616 / 188.655 m) | 0.839 (199.696 / 238.004 m) | 0.993 m | 1.041 m | 6.67° |
| closer | 0.930 (175.770 / 188.989 m) | 0.839 (199.688 / 238.109 m) | 1.121 m | 0.981 m | 6.38° |
| bold | 0.923 (173.872 / 188.282 m) | 0.842 (199.653 / 237.081 m) | 0.806 m | 1.199 m | 9.23° |

Corner metric matches the review package: sum 3D settled camera travel divided by sum driven-path travel, 400 subdivisions, hairpin t=0.263–0.302 and chicane t=0.328–0.376. These are deterministic node measurements, not a claim of human camera feel. Camera heading sweep is 0° in both spans for every candidate. Camera translation is still ~84–93% of car travel; none establishes SPEC's “barely moves” observation. No taste winner is inferred.

## Verification

- `node scripts/check-composition-math.mjs r1` (and r2/r3): numeric output; asserted by presets check.
- `node scripts/check-composition-presets.mjs ec9b697`: PASS — 25 old queries exact; four default mesh buffers exact; 600 default rig poses exact; 8192 route samples per candidate for body support/ordinary asphalt locality; frame/gate/world/seam/reversal assertions.
- `node scripts/check-composition-base.mjs ec9b697`: PASS — 1800 forward/back camera poses, position/quaternion/FOV identical (difference 0).
- `node scripts/check-composition-rail.mjs r1` (and r2/r3): PASS — converged; continuing solver changes rail by ≤0.00365 m.
- `node scripts/check-composition-guard.mjs first r1` / `resize r1` (and r2/r3): PASS — one infeasible attempt, 200 finite frames without retry, correct fallback, recovery/cache.
- `npm run build`: PASS at product source `84c2f83`.
- `GT3_LOOKS=r1 GT3_TS=<18 points> node scripts/verify-hero-pivot.mjs` (and r2/r3): PASS, numbers above.
- `GT3_LOOKS=r1 GT3_LEAN=1 node scripts/verify-composition.mjs` (and r2/r3): PASS via collector plus saved-artifact assertions — ready, no rail fallback, zero errors, zero edge rays at three Day review frames, fixed yaw/pitch, seam difference 0, motion snaps 0, camera correction 0%. Settled forward/back camera differences ≤0.734 mm, quaternion difference 0, with route targets within 1e-7 progress. The assertion tolerance is 2 mm for that sampling precision.
- Composition scope: r1 retains its valid same-source 48×27 frame grid and full forward/back hairpin/chicane wheel run; only pose/resize evidence was replaced using `GT3_RECHECK_POSES=<prior JSON>`. R2/r3 use a 24×14 grid and forward/back hairpin-curb wheel run, t=0.273–0.293. Gate poses cover t=0.39 and finish; these have no browser edge sweep. Desktop resize: 16:9 → 4:3 → 16:9, no holds skipped. Pure-node corner travel above uses the full fixed spans for all three.
- `GT3_READ_RESULT=<composition JSON> node scripts/verify-composition.mjs`: PASS for completed candidate artifacts. R2's collector completed but initially exited FAIL because a 10-micron comparison contradicted the 1e-7-progress stop tolerance; the artifact passes the corrected 2-mm assertion without repeating unaffected GPU work. R1's earlier resize/browser-environment and raw-scroll-target harness defects were corrected and those scopes rerun.
- `GT3_CONFIGS=look=r1 GT3_TS=<15 points> node scripts/verify-occlusion.mjs` (and r2/r3): PASS — 15/15 points each at 1600×900, 24×14 frame grid, terrain-car ray hits 0, hidden-road cells 0, errors 0. Every probe hits visible road cells; minima 3 / 2 / 3. Paused sweeps resumed from source-pinned per-point checkpoints; all 45 final probes completed.

Runtime commands use `GT3_URL=http://127.0.0.1:5199`, native Metal Chrome, one page/profile at a time. Pivot `GT3_TS`: `0.02,0.1,0.25,0.275,0.279,0.283,0.287,0.291,0.355,0.361,0.365,0.369,0.375,0.4,0.55,0.7,0.85,0.97`. Occlusion `GT3_TS`: `0.02,0.1,0.18,0.265,0.283,0.3,0.335,0.352,0.365,0.465,0.63,0.68,0.7,0.85,0.97`. Source-pinned resume retains completed probes only when the product tree, configs and sample list match.

## Tradeoffs and review boundary

- Glide+ and bold preserve distance, but both grow the physical road to preserve car/road/line clearance. The hero remains deliberately oversized. The strongest body/roll envelope can extend 1.61 / 1.48 / 1.80 m beyond asphalt at the selected curb windows; it remains on curb, before runoff.
- Closer gives up 9.2% distance and ~14% horizontal world span at the target plane compared with 240 m / FOV 40. Its hero scale stays lower, but the hairpin camera travel ratio increases to 0.93.
- Bold amplifies the chicane heading sweep to ~80° versus ~70° for the one-curb candidates. This is a real stronger cornering treatment, for owner review.
- Legibility, believable circuit proportion, curb-use taste, camera/scroll feel and the winner need owner live review. Machine measurements do not accept these. Night, real trackpad feel and final performance acceptance remain unverified by this pass. Full checkpoint/discovery sequences were not re-run; their state/scroll/morph logic is unchanged in the diff. Only selected look presets add the cache preparation before readiness.

## Owner captures and changed files

Day, 1600×900, three route points per candidate. Hairpin entry and apex are separate frames for the one-curb candidates; bold shows both curb apexes.

| Candidate | Straight (t=0.02) | Hairpin | Curb corner |
|---|---|---|---|
| glide+ | [PNG](r1_start-straight_day.png) | [Entry, t=0.265](r1_hairpin-entry_day.png) | [Apex, t=0.283](r1_hairpin-apex_day.png) |
| closer | [PNG](r2_start-straight_day.png) | [Entry, t=0.265](r2_hairpin-entry_day.png) | [Apex, t=0.283](r2_hairpin-apex_day.png) |
| bold | [PNG](r3_start-straight_day.png) | [Apex, t=0.283](r3_hairpin-apex_day.png) | [Chicane exit apex, t=0.365](r3_chicane-out_day.png) |

Product files: `src/scene/composition.js` (query presets), `racingLine.js` (local curb windows), `track.js` (curb width at those windows), `compositionRail.js` (curb-aware framing radius), `carRig.js` (uniform ground support/cache), `src/main.js` (preload cache and development label). No `SPEC.md` changes.

Verification files: `scripts/check-composition-{math,rail,guard,presets}.mjs`, `scripts/verify-{composition,hero-pivot,occlusion}.mjs`. `check-composition-base.mjs` is reused unchanged. Review artifacts are this README, the nine PNGs and [metrics.json](metrics.json) (numeric/browser summaries and raw-artifact hashes); raw JSON/profile/log files remain outside the clone in `/tmp/gt3-p3r-visual/`.

Host handling: shared mkdir lock, owned strict-port Vite 5199, serial Chrome pages with dedicated profiles, two-sample preflight, deterministic degradation monitor and TERM by recorded owned PID. Broader batches stopped cleanly on host degradation; completed same-source evidence was retained. Recovery used serial lean scopes and fresh preflight rather than overlapping jobs. Timing data is host-contaminated; it does not establish final performance acceptance. Terrain verification completed its separate 15-point route sweep for each look. The owned Vite server and browser were stopped after every batch; final cleanup is checked before handoff.

Read-only handoff refs: `main` remains `665d5ccb`; `phase3-integration` moved outside this task from `ec9b697` to `c69aafc` (gate-work merge). Evidence here is pinned to the `p3r-visual` product source `84c2f83`; validation against that newer integration build remains UNVERIFIED. This task wrote only `p3r-visual` and its off-repo temp evidence.
