# W2 leg 2 — computed camera range; no visual acceptance

Historical leg-2 evidence below. [Leg-3 engineering update](../w2-leg3/README.md) supersedes
the solver, anchor policy, candidate diagnostics, aspect state and build/failure handling.

Worktree `/Users/rayyansheikh/Desktop/gt3/.claude/worktrees/p3-w2`, branch `p3-w2-composition`.
Start verified: HEAD `0967653`, clean status, exact cwd/branch. Source and harness tested at `442dd88`.
**Computed:** pure Node/Three.js geometry and poses, official roster GLB accessor bounds; no renderer.
**Reasoned:** feasibility, causal attribution, solver continuity, structural scope, risks.
**Unverified:** rendered composition, perceived prominence/legibility/calmness, occlusion, GPU performance/readiness, swap/gate response, wheel feel, build. Vite/browser/build were not started.

1. **Metric validity.** The old translation ratio already summed 3D camera path length / 3D car path length; it was meaningful, unlike endpoint displacement ratios. Its `headingChangeDeg: 0` was a literal, ambiguously named camera-heading placeholder, not a measured hairpin turn. The fixed diagnostic measures camera yaw sweep, car signed net heading and absolute sweep, both path lengths, endpoint displacements, spatial bounds and peak speeds at equal route-speed sampling (`scripts/check-composition-math.mjs:161–207`). Spans remain hairpin t=.263–.302 and chicane t=.328–.376 (`src/scene/compositionRail.js:11`); measured centreline sweeps are 112.52° and 77.22° (chicane net −0.49°). These are the defined curvature-core windows, not a claim to include every authored approach/exit metre. Camera sweep is measured zero. Recomputed leg-1 ratios: base .920/.980, a .849/.942, b .866/.949, c .858/.946. Ratios are diagnostics, never acceptance targets. Metric fix committed separately as `045f0e5`; its `leg1-*.json` snapshots retain the original sphere-based framing numbers. Final `*-leg1.json` use full bounds.

2. **Feasibility at leg 1.** No stationary camera can contain either measured corner at distance 140 m/FOV 32°/pitch 52° with these bounds. At 16:9 the nominal target-plane frame is 142.7 m wide and approximately 101.9 m along the ground; centreline corner extents in camera ground axes are 160.26×51.97 m and 199.77×124.94 m. The combined complex spans 429.57×286.61 m. Leg-1 central-zone half extents, after the conservative all-model/full-offset envelope, are a 34.1×18.9 m, b 30.0×13.8 m, c 31.8×16.1 m: “±25 m” was only an approximate description, not an isotropic world limit. Perspective corridor intersection confirms infeasibility (`scripts/check-composition-math.mjs:210–244`). At fixed leg-1 FOV/zone, conservative stationary minimum distances H/C are a 306.0/373.6 m, b 322.5/402.0 m, c 315.1/389.3 m. These are sufficient-envelope minima at a fixed target-height plane, not globally optimal camera designs. Framing, stationary observation and world containment can coexist after enlarging the view; preserving the intended *perceived* hero prominence at that view remains unverified and is a serious conflict (tables below).

3. **What forces following.** It is the framing tube: `limitX/Y = zone × depth × tan(FOV/2) − radius`, then pointwise projection and repeated light smoothing (`src/scene/aerialCamera.js:270–297`). The heavy Gaussian is repeatedly pulled toward the route because its feasible tube is narrow; 39–43% of leg-1 sampled rail projections are active. This is precomputed rail following, not proof that the live correction layer is active for 40% of rendered frames. The live hysteresis is separate (`src/scene/aerialCamera.js:346–369`). Terrain, fog and shadows never enter this rail constraint. Terrain margin is `max(1000, initialFogFar+250)` (`src/scene/environment.js:338`); the environment is built before theme scaling (`src/main.js:87–102`), so initial far=570 gives 1000 m. Camera far=3000 (`src/scene/sceneSetup.js:391`), fog scaling (`src/scene/sceneSetup.js:268–269`) and shadow extent (`src/scene/sceneSetup.js:48`) affect rendering, not this follow failure. The old guessed sphere also under-reported framing: full stressed boxes exceed leg-1 engage zones for b on 10.84% and c on 1.10% of sampled poses, while staying inside the viewport.

4. **Smallest structural change.** Enlarge the *projected observation footprint* and author the rail around feasible sectors; enlarging terrain alone does nothing to the framing inequalities. Merely widening the central zone at the original lens cannot fit the hairpin’s 160 m extent inside a nominal 143 m frame with room for the car. An additional full-viewport (NDC 1/1) conservative-envelope check at the actual rail-height plane still finds 140 m infeasible: b needs 173.01 m for H and 200.02 m for C, with no composition margin. Moving farther and/or widening FOV plus a broader composition zone is necessary. For b with FOV 40° and zone .76/.74, an entire-complex fixed point needs at least 452.0 m in the conservative test; at FOV 48° it needs 364.5 m, before spline slack and entry/exit guard. `wide` uses 440 m with that lens to retain those reserves. `hold` uses a smaller view and separate corner anchors; the resulting inter-corner pan is a measured quality risk, not a solution accepted by a low corner ratio. SPEC §15 (`SPEC.md:294–322`) authorizes lens/rail/framing iteration, and `SPEC.md:374` permits world enlargement only when structurally needed. Here existing terrain is sufficient: **terrain/ground change = 0 m**. No environment art, lighting or shadow tuning was added. The existing distance-relative fog rule applies to the new cameras; its values are recorded below.

5. **Strategy implemented.** Precompute convex perspective framing corridors from centreline positions plus a conservative sphere enclosing the current roster, roll/bob and the full racing-line amplitude (`src/scene/compositionRail.js:15–49`). Seed with a broad wrapped Gaussian; optionally intersect whole corner windows to obtain fixed observation anchors. Use one anchor over the connecting run when the *whole* complex intersection exists (`src/scene/compositionRail.js:107–153`). Solve minimum squared second differences under those constraints using 6000 accelerated projected-gradient iterations at load/resize (`src/scene/compositionRail.js:155–180`), then evaluate a periodic cubic B-spline (`src/scene/compositionRail.js:181–192`). This minimizes bending, not the camera/car ratio; fixed holds encode the SPEC observation-point intent. Fixed yaw/pitch, fixed height per lap, no history-dependent damping or live recentering in the new path. Every rendered pose is a pure function of t and the resolved viewport/configuration (`src/scene/aerialCamera.js:174–200`). The table solver is finite-iteration, not a certificate of the exact optimization minimum. This architecture is the engineering choice; **no product variant is selected**.

6. **Candidate range and independent parameters.** `?comp=base|a|b|c` still owns road/path/hero scale. Optional `?cam=glide|hold|wide` owns camera strategy; omitted, `leg1`, or an unknown camera value preserves the original composition camera. No-query base stays unchanged. Values resolve before scene imports (`src/main.js:26`, `src/scene/composition.js:51–82`). Dev-only numeric overrides remain validated; distance cap is now 520 m (`src/scene/composition.js:48–70`).

| Camera | Distance m | FOV | Yaw/pitch | NDC zone x/y | Seed σ m | Hold policy | Fog scale; shadow extent |
|---|---:|---:|---|---|---:|---|---|
| base | 54 | 40° | 75°/52° | legacy .76/.72 | legacy | legacy rail | 1; 60 m |
| leg1 a/b/c | 140 | 32° | 75°/52° | rail .55/.50 | 300 | original elastic rail | 2.593; 120 m |
| glide | 240 | 40° | 75°/52° | .74/.72 | 300 | no fixed holds | 4.444; 120 m |
| hold | 320 | 40° | 75°/52° | .76/.74 | 300 | separate H and C anchors | 5.926; 120 m |
| wide | 440 | 48° | 75°/52° | .76/.74 | 350 | one H-through-C anchor at 16:9 | 8.148; 120 m |

Road/path values remain a: 9.6 m road, hero 1.7, centreline; b: 14 m, hero 1.9, line ±3.421 m; c: 12 m, hero 1.8, line ±1.922 m (`src/scene/composition.js:27–33`, `src/scene/racingLine.js:18–23`).

7. **Risks and failures.** `glide` remains a substantial corner follower despite smoother motion; it does not fulfill “barely moves.” `hold` is stationary inside each core window but shifts motion into the 130 m intervening run: approximately 234 m/s peak camera speed at the declared 50 m/s route proxy, and high acceleration/jerk. It misses the calm-transition intent; a zero corner ratio does not excuse it. `wide` avoids that inter-corner transfer at 16:9, but the projected car length falls to roughly 0.69–1.74% of frame width (11–28 px at 1600 px): **hero prominence is at serious risk**. Its entry/exit movement is not visually accepted. These tradeoffs are retained as comparison evidence, not tuned toward a ratio threshold. At 4:3, b/hold cannot fit its guarded chicane hold and falls back to the framed rail (`unavailableHolds` reports it); b/wide needs separate anchors and loses the whole-complex hold. Resizing recomputes the rail and can hitch; initial Node rail computation was about 0.5–0.9 s in final runs, not browser readiness evidence. Cast-shadow coverage remains capped at ±120 m and can visibly end inside the wider frame. Fog far can exceed camera far; sky/terrain joins, occlusion by relief/props, actual silhouette size and thin-line aliasing need GPU review. Pose acceleration scales with actual route speed squared and jerk with its cube; scroll speed changes add temporal acceleration. Sampling and conservative GLB boxes are not rendered-pixel proof. New roster bounds require revisiting the enclosing-sphere constants.

8. **Function-level guidance / delivered changes.** `buildCompositionRail()` constructs corridors/anchors/table, `at(t,out)` evaluates four spline supports, `corridorPose()` creates the fixed-orientation pose and `corridorUpdate()` uses it directly. `snap()`/instant-seek use that same pose; `railPoseAt()` now dispatches correctly for legacy, sector and corridor (`src/scene/aerialCamera.js:117–143`, `src/scene/aerialCamera.js:406–413`). New cameras have zero sampled seam/reverse position error, zero continuous-update pose error and zero continuous-update snap events. Comparing no-query current and `0967653` camera modules over 1800 forward/reverse update/snap samples produced exactly zero position/quaternion-component difference and equal FOV. Browser harness supports the independent matrix and collision-safe capture names; it also measures separate H/C path/heading metrics and stops treating a rotated world AABB as canonical car width (`scripts/verify-composition.mjs:20–25`, `scripts/verify-composition.mjs:42–54`, `scripts/verify-composition.mjs:120–144`, `scripts/verify-composition.mjs:219–238`). No scroll, morph, cars/warm-up/readiness, HUD/player/theme UI or audio code changed.

## Per-candidate diagnostics — computed, 16:9

H/C = the declared hairpin/chicane windows. Path m columns show **camera/car** 3D travel; ratios are path-length ratios. Peak speed, acceleration and jerk are whole-lap spatial finite differences at 0.5 m spacing converted using a declared constant **50 m/s route speed** (`scripts/check-composition-math.mjs:248–270`); they are not actual scroll timing. Every row has measured camera heading sweep 0°, snap-pose seam/reverse error 0 m and 0 continuous-update snap events. New cameras additionally have exact direct-pose/update equality. Full JSON includes car heading, net displacement, peak-speed ratio, spatial extents, per-model reach and route-point data.

| comp/cam | H path m | H ratio | C path m | C ratio | Peak cam m/s | Peak acc m/s² | Peak jerk m/s³ |
|---|---:|---:|---:|---:|---:|---:|---:|
| base | 180.34/196.01 | 0.920 | 235.77/240.52 | 0.980 | 52.01 | 269.46 | 27178.48 |
| a-leg1 | 166.34/196.01 | 0.849 | 226.52/240.52 | 0.942 | 50.98 | 126.59 | 12659.82 |
| b-leg1 | 165.05/190.55 | 0.866 | 226.09/238.32 | 0.949 | 51.03 | 119.07 | 11907.47 |
| c-leg1 | 165.62/192.92 | 0.858 | 226.25/239.27 | 0.946 | 51.00 | 122.41 | 12241.45 |
| a-glide | 153.07/196.01 | 0.781 | 210.81/240.52 | 0.876 | 48.65 | 12.68 | 3.00 |
| b-glide | 153.51/190.55 | 0.806 | 213.39/238.32 | 0.895 | 48.64 | 13.07 | 3.35 |
| c-glide | 153.30/192.92 | 0.795 | 212.22/239.27 | 0.887 | 48.65 | 12.90 | 3.12 |
| a-hold | 0.00/196.01 | 0.000 | 0.00/240.52 | 0.000 | 233.52 | 412.33 | 4248.25 |
| b-hold | 0.00/190.55 | 0.000 | 0.00/238.32 | 0.000 | 233.52 | 412.33 | 4248.21 |
| c-hold | 0.00/192.92 | 0.000 | 0.00/239.27 | 0.000 | 233.52 | 412.33 | 4248.23 |
| a-wide | 0.00/196.01 | 0.000 | 0.00/240.52 | 0.000 | 95.02 | 41.28 | 423.18 |
| b-wide | 0.00/190.55 | 0.000 | 0.00/238.32 | 0.000 | 94.99 | 41.87 | 429.52 |
| c-wide | 0.00/192.92 | 0.000 | 0.00/239.27 | 0.000 | 95.00 | 41.27 | 423.08 |

Framing projects the full scaled accessor boxes of **all ten models**, at the actual line and both maximum line offsets, with ±3.4° roll and full bob envelope at 2001 lap samples (`scripts/check-composition-math.mjs:108–151`). Reach x/y is the maximum absolute projected bound, not centre-point NDC. Every new row has **0% bounds outside its configured zone and 0% outside the viewport**. Leg1 b/c exceed their engage zone on 10.84%/1.10% of samples, respectively. Base/a do not.

Road widths = asphalt width / median-roster-width and / widest-roster-width, including mirrors/wing. Projected L% is the min/max all-model nose-to-tail screen-vector length divided by frame width over 18 representative poses, with actual perspective/heading/grade, no occlusion (`scripts/check-composition-math.mjs:349–360`). Coverage is median/max non-occluded asphalt silhouette fraction at 48×27 cell centres over those poses (`scripts/check-composition-math.mjs:319–348`). It is a geometric legibility proxy, not perceived road readability.

| comp/cam | Reach x/y NDC | Projected L% range | Road in hero widths med/widest | Road coverage med/max % | Minimum terrain gap m | Exposed rays | World expansion m |
|---|---:|---:|---:|---:|---:|---:|---:|
| base | 0.327/0.515 | 5.24–6.76 | 7.01/4.96 | 28.94/32.18 | 892.1 | 0 | 0 |
| a-leg1 | 0.604/0.565 | 4.35–5.88 | 2.83/2.00 | 9.03/11.96 | 885.3 | 0 | 0 |
| b-leg1 | 0.685/0.697 | 4.89–6.55 | 3.69/2.61 | 13.19/17.36 | 886.9 | 0 | 0 |
| c-leg1 | 0.648/0.631 | 4.63–6.22 | 3.34/2.36 | 11.34/14.97 | 886.2 | 0 | 0 |
| a-glide | 0.697/0.678 | 1.83–2.79 | 2.83/2.00 | 4.48/6.87 | 786.1 | 0 | 0 |
| b-glide | 0.693/0.670 | 2.13–3.12 | 3.69/2.61 | 6.79/10.26 | 782.1 | 0 | 0 |
| c-glide | 0.695/0.674 | 1.98–2.95 | 3.34/2.36 | 5.79/8.87 | 783.9 | 0 | 0 |
| a-hold | 0.726/0.713 | 1.35–2.33 | 2.83/2.00 | 3.63/5.32 | 739.1 | 0 | 0 |
| b-hold | 0.723/0.697 | 1.51–2.59 | 3.69/2.61 | 5.94/7.41 | 735.4 | 0 | 0 |
| c-hold | 0.725/0.703 | 1.43–2.46 | 3.34/2.36 | 4.78/6.48 | 737.0 | 0 | 0 |
| a-wide | 0.708/0.714 | 0.69–1.56 | 2.83/2.00 | 2.24/3.47 | 486.5 | 0 | 0 |
| b-wide | 0.715/0.702 | 0.79–1.74 | 3.69/2.61 | 3.16/5.17 | 485.7 | 0 | 0 |
| c-wide | 0.712/0.707 | 0.74–1.65 | 3.34/2.36 | 2.78/4.71 | 486.1 | 0 | 0 |

World check: eight edge/corner rays × two relief-envelope heights × 18 poses (288 rays/row), conservative terrain vertical range derived from route extrema ±(5.2+19+9) m. Ground intersections stay within the existing outer rectangle and camera far in every row (`scripts/check-composition-math.mjs:286–317`, `src/scene/environment.js:165–176`). This checks structural outer-boundary containment, not actual mesh triangulation, infield holes or occlusion. No world enlargement is required by this check.

All-ten roll-expanded road-edge minimum gaps (actual path): base 5.509 m; a 2.265 m; b 0.743 m; c 1.393 m. Worst FULL-offset checkpoint-post / finish-post gaps: a 4.245/3.965 m, b 2.576/2.401 m, c 3.294/3.070 m. These are unchanged by camera choice; every checkpoint and the finish are included (`scripts/check-composition-math.mjs:33–81`). Beam dimensions, mounts and GPU warm-up were not edited. Actual mesh/post interaction and the contact shadow remain browser checks.

## Review URLs and manager-scheduled verification

Base: `http://127.0.0.1:5192/` (or `?comp=base`). Leg1 controls: `http://127.0.0.1:5192/?comp=a`, `?comp=b`, `?comp=c`. Port is illustrative until the manager starts its assigned Vite lane.

- `http://127.0.0.1:5192/?comp=a&cam=glide`
- `http://127.0.0.1:5192/?comp=b&cam=glide`
- `http://127.0.0.1:5192/?comp=c&cam=glide`
- `http://127.0.0.1:5192/?comp=a&cam=hold`
- `http://127.0.0.1:5192/?comp=b&cam=hold`
- `http://127.0.0.1:5192/?comp=c&cam=hold`
- `http://127.0.0.1:5192/?comp=a&cam=wide`
- `http://127.0.0.1:5192/?comp=b&cam=wide`
- `http://127.0.0.1:5192/?comp=c&cam=wide`

Existing `?scroll=` remains W3-owned; `?gate=quiet` still suppresses the W4 gate response. Add it only for comparisons that intend a quiet gate. The browser harness currently adds it to its URLs and records the exact URL/config.

Node reproduction: `node scripts/check-composition-math.mjs b 1.7777777777777777 wide`; substitute a/c and glide/hold; omit cam/aspect for leg1. One process per configuration. JSON files here contain all 13 baseline/16:9 cases and b/hold, b/wide at 4:3.

Later browser matrix: `GT3_URL=http://127.0.0.1:5192 GT3_COMPS=a,b,c GT3_CAMS=glide,hold,wide GT3_CAPTURE_DIR=<manager-assigned-folder> node scripts/verify-composition.mjs`. Baseline remains `GT3_COMPS=base,a,b,c GT3_CAMS=leg1`. **Not executed here.**

All six changed JS/MJS files passed `node --check`; `git diff --check` was clean. All listed Node runs exited 0. This is computed evidence, not visual PASS or product acceptance. A manager-owned browser session still needs actual full-car framing/occlusion, broad and full corner approach/exit motion, live reversals, instantaneous seek/resize, Day/Night terrain/shadow/fog edges, gate/contact-shadow response and representative captures. Healthy-readiness cold/warm hitch comparisons (base vs comp b, sound off/on), GPU timings and build remain unverified. No W4b runtime baseline is asserted.

Commits: `045f0e5` metric fix and original-camera snapshots; `442dd88` camera strategy/config, Node diagnostics and browser parameter support. Numeric evidence is recorded in the following evidence commit (see the final worker report for its hash).
