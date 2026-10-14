# W2 leg 3 — engineering corrections; no visual acceptance

Start: exact cwd `/Users/rayyansheikh/Desktop/gt3/.claude/worktrees/p3-w2`, clean `p3-w2-composition`, HEAD `4dfc2c9`; `40e116e` is an ancestor and HEAD contains the integration harness updates. Fetched `origin/p3-cloud-review-w2` and read its review with `git show`; read leg 2, master context and SPEC §15.
Runtime code tested at `d7d14ac`; final diagnostic logging/evidence is in this report commit. **COMPUTED:** Node/Three.js poses, all-ten GLB accessor boxes and spatial proxies. **UNVERIFIED:** GPU/rendering, visual acceptance, browser resize/readiness and bundler build. No Vite, Chrome, browser harness or `npm run build` was started; no push, main edit, branch switch or history rewrite.

## Review decisions and implementation

- **Adopt §6.1.** Old b/glide moves 40.503 m between 6000 and 18000 iterations. Added β=1e-4 Gaussian seed tether, adaptive gradient restart, and a projected-gradient residual stop bounding Euclidean error to the unique minimizer by 0.05 m. Failure to converge within 12000 iterations throws into the build guard. β=1e-3 also converges (1450 iterations, 303.996 ms in the saved trial), but b/glide becomes .921/.843 H/C, 55.87/31.80/138.84 speed/acceleration/jerk. Retained β=1e-4 for this engineering comparison, without selecting a product camera.
- **Adopt §4.2.** Guarded polygons now use closest-pair anchors; a lone or combined hold projects the mean seed into its feasible polygon. b/hold anchor gap is 222.9 m versus the reviewed 334.9 m. With the tether, centroid → closest pair lowers peak speed 231.47→154.31, acceleration 426.72→292.86 and jerk 4398.41→3019.41. Corrected the misleading entry/exit-reserve comment: the NDC slack is the reserve. These improvements do not make a strict hold perceptually calm.
- **Adopt §4.3; qualify its predictions.** `?cam=soft`: 400 m, FOV 40°, yaw/pitch 75°/52°, zone .76/.74, seed σ=300 m, α=.05, w_C=10, raised-cosine easing 120 m, **no locks**. The review’s α=.05/40 m figures used an untethered objective; they cannot be reused after the correctness fix. Our 400/40 m easing trial is .250/.270 H/C and 98.87/125.42/270.93. The 120 m easing setting supplies a calmer-motion comparison with more residual corner travel; it is not a winner.
- **Adopt the minimum §5 remedy.** Active hold state, unavailable holds, aspect, solver/dense residual, fallback/error, attempts and cache state appear in `window.__gt3.comp.railRuntime` (also `aerial.rail`); the dev label displays holds/aspect/fallback. Soft has no stationary-feasibility switch. Strict hold/wide still have feasibility transitions; this is explicit, not claimed continuous. The label’s DOM appearance remains unverified.
- **Adopt §6.2 guard/residual and height-plane consistency.** Failed first build uses the leg-1 sector formulation at 140 m/32°; failed resize retains the last good table. A failed aspect is not retried per frame. Both real infeasible-distance tests ran 200 finite-pose updates with one failed attempt, then recovered. A retained rail can violate framing at the new aspect; the degraded fallback is not a new framing guarantee. Dev/Node build asserts 4096 interpolated sphere-envelope samples at the true zone; production skips this assertion. Feasibility diagnostics now use the rail’s 1024-sample mean height.
- **Adopt cheap cost reductions.** Reuse iterate/projection buffers, pack corridor edges, precompute neighbor/lock flags. Paired b/soft build: 1070.307→641.922 ms, **0 m** maximum pose difference at 4096 samples. Normal rebuild moved into the existing 60 ms debounced resize task; an eight-table exact-aspect cache avoids bucket jumps and repeated solves. Revisit test cost was 0.010 ms with no added build. The task still blocks the browser main thread; this is not browser hitch proof.
- **Deferred by dispatch:** hero-scale experiments and shadow-window changes. No terrain, world, scroll, HUD, warm-up, audio or rendering-policy edits. Corner spans remain authored (.263–.302/.328–.376); trackCurve has no diff against leg 1. Curvature-derived spans and the minor stale corridor `carNdc` field were not expanded into this bounded pass.

## Final per-candidate diagnostics — 16:9

H/C are 3D camera/car path-length ratios over the declared core windows. Speed/acceleration/jerk are **spatial** finite differences at 0.5 m, converted at a declared constant 50 m/s route speed, not wheel timings or acceptance thresholds. L% is non-occluded all-model projected length range. Build ms includes the dev dense assertion and is elapsed Node time; the host varied.

| comp/cam | H/C | Peak m/s | Acc m/s² | Jerk m/s³ | Reach x/y NDC | L% range | Build ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| base/leg1 | 0.920/0.980 | 52.01 | 269.46 | 27178.48 | 0.327/0.515 | 5.24–6.76 | 1.1 |
| a/leg1 | 0.849/0.942 | 50.98 | 126.59 | 12659.82 | 0.604/0.565 | 4.35–5.88 | 121.4 |
| a/glide | 0.840/0.832 | 48.70 | 29.79 | 46.83 | 0.711/0.687 | 1.73–2.78 | 340.2 |
| a/hold | 0.000/0.000 | 144.65 | 275.78 | 2843.45 | 0.727/0.696 | 1.38–2.17 | 394.1 |
| a/wide | 0.000/0.000 | 153.95 | 289.77 | 3005.82 | 0.697/0.683 | 0.69–1.30 | 514.4 |
| a/soft | 0.365/0.392 | 76.71 | 55.01 | 170.94 | 0.727/0.702 | 1.03–1.76 | 571.2 |
| b/leg1 | 0.866/0.949 | 51.03 | 119.07 | 11907.47 | 0.685/0.697 | 4.89–6.55 | 121.6 |
| b/glide | 0.880/0.839 | 50.55 | 29.83 | 51.16 | 0.704/0.675 | 2.00–3.11 | 333.6 |
| b/hold | 0.000/0.000 | 154.31 | 292.86 | 3019.41 | 0.724/0.697 | 1.60–2.40 | 387.7 |
| b/wide | 0.000/0.000 | 155.97 | 293.98 | 3049.49 | 0.692/0.695 | 0.78–1.45 | 483.1 |
| b/soft | 0.378/0.399 | 77.22 | 55.37 | 173.12 | 0.725/0.693 | 1.19–1.99 | 552.2 |
| c/leg1 | 0.858/0.946 | 51.00 | 122.41 | 12241.45 | 0.648/0.631 | 4.63–6.22 | 113.2 |
| c/glide | 0.863/0.836 | 49.72 | 29.82 | 51.87 | 0.705/0.681 | 1.87–2.95 | 350.3 |
| c/hold | 0.000/0.000 | 149.98 | 285.20 | 2940.51 | 0.725/0.700 | 1.50–2.28 | 432.6 |
| c/wide | 0.000/0.000 | 155.07 | 292.09 | 3029.94 | 0.694/0.690 | 0.73–1.37 | 686.6 |
| c/soft | 0.372/0.396 | 76.99 | 55.21 | 172.13 | 0.726/0.697 | 1.11–1.88 | 637.6 |

Glide b changed from leg-2 .806/.895 and 48.64/13.07/3.35 to **.880/.839 and 50.55/29.83/51.16**. Wide b changed from 94.99/41.87/429.52 to **155.97/293.98/3049.49**: the unique tethered solution increases hard-hold entry/exit motion. No smoothness gain is inferred from convergence alone.
Every new-camera row: 0% full boxes outside zone/viewport; 0 m seam/reversal/update-pose error; 0 continuous-update snaps; measured camera yaw sweep 0°. Full framing uses all ten models, actual and ±FULL offsets, ±3.4° roll/full bob at 2001 lap samples. Leg1 b/c retain 10.84%/1.10% engage-zone excursions, with 0% viewport excursions.
Entry/exit audit uses ±20 m windows around each H/C boundary (15 all-ten stressed poses each in the lap grid): b/hold maxima .681/.552, .162/.500, .457/.530, .667/.600; b/wide .589/.628, .210/.600, .056/.265, .690/.451. All a/b/c new rows have zero boundary-zone excursions. Dense sphere-envelope checks additionally cover 4096 interpolated samples; worst residual across the 12 new 16:9 rows is −1.851 m (inside). Actual occlusion and rendered margins remain browser work.

## Iteration independence

β=1e-4. Compare the stop point with exactly 3× its iterations, forcing continued work; 4096 pose comparisons. No diagnostic threshold is a product acceptance rule.

| b/cam | Stop / longer iterations | Stop bound m | Max difference m |
|---|---:|---:|---:|
| glide | 4050 / 12150 | 0.04703 | 0.001847 |
| hold | 5000 / 15000 | 0.04868 | 0.002747 |
| wide | 7000 / 21000 | 0.04569 | 0.003474 |
| soft | 7850 / 23550 | 0.04639 | 0.002753 |

## Soft frontier actually tried — comp b, 16:9

β=1e-4 throughout; FOV 40°. These are measured frontier points, not visual rankings. `soft-frontier.json` records effective parameters and tuning-run times (before buffer optimization); independence is tested separately above.

| Distance m | α | w_C | Ease m | H/C | Peak / acc / jerk |
|---:|---:|---:|---:|---:|---:|
| 320 | 0.05 | 3 | 40 | 0.527/0.559 | 68.88/49.19/89.11 |
| 320 | 0.05 | 10 | 40 | 0.261/0.280 | 104.91/132.79/286.58 |
| 360 | 0.05 | 10 | 40 | 0.254/0.275 | 101.76/128.95/278.43 |
| 400 | 0.05 | 10 | 40 | 0.250/0.270 | 98.87/125.42/270.93 |
| 400 | 0.05 | 30 | 40 | 0.108/0.117 | 121.34/204.66/569.16 |
| 400 | 0.05 | 1 | 40 | 0.776/0.809 | 47.59/26.05/49.59 |
| 360 | 0.1 | 10 | 40 | 0.208/0.221 | 98.00/142.64/357.47 |
| 400 | 0.1 | 10 | 40 | 0.204/0.216 | 94.99/138.18/346.63 |
| 360 | 0.2 | 10 | 40 | 0.180/0.199 | 94.33/161.10/474.51 |
| 400 | 0.2 | 10 | 40 | 0.170/0.180 | 87.32/149.22/439.94 |
| 400 | 0.5 | 10 | 40 | 0.146/0.162 | 80.07/168.75/642.99 |
| 400 | 0.05 | 10 | 80 | 0.331/0.352 | 76.39/69.33/410.65 |
| 400 | 0.05 | 10 | 120 | 0.378/0.399 | 77.22/55.37/173.12 |
| 400 | 0.05 | 10 | 200 | 0.435/0.456 | 75.03/36.85/115.17 |
| 400 | 0.1 | 10 | 120 | 0.311/0.342 | 76.51/62.92/214.58 |

## Aspect behavior — base control and comp b

Cells = active hold policy / peak proxy speed m/s / % zone excursions. HC=one combined hard hold; H+C=separate hard holds; H=hairpin only. Soft remains the same objective across aspects. Every new-camera aspect row has 0% viewport excursions and exact seam/reversal/update equality; worst dense residual is −1.866 m. Leg1’s zone excursions are retained evidence, not newly accepted behavior.

| Camera | 16:9 | 16:10 (1.6) | 1.5 | 4:3 |
|---|---|---|---|---|
| base | legacy / 52.01 / 0.00 | legacy / 52.01 / 0.00 | legacy / 52.01 / 0.00 | legacy / 52.01 / 0.00 |
| leg1 | sector / 51.03 / 10.84 | sector / 50.19 / 11.04 | sector / 50.19 / 11.84 | sector / 50.19 / 12.59 |
| glide | none / 50.55 / 0.00 | none / 51.61 / 0.00 | none / 53.10 / 0.00 | none / 55.05 / 0.00 |
| hold | H+C / 154.31 / 0.00 | H+C / 171.46 / 0.00 | H+C / 181.39 / 0.00 | H / 83.43 / 0.00 |
| wide | HC / 155.97 / 0.00 | H+C / 163.74 / 0.00 | H+C / 156.09 / 0.00 | H+C / 143.42 / 0.00 |
| soft | soft / 77.22 / 0.00 | soft / 77.17 / 0.00 | soft / 75.90 / 0.00 | soft / 76.60 / 0.00 |

At 16:10 wide’s closest-pair gap is 4.5 m, but its **whole-lap** peak remains 163.74 m/s at entry: anchor gap does not explain all motion after tethering. At 4:3 hold reports unavailable chicane. The hard-hold cliffs remain a known quality risk; the runtime/label makes them reviewable. Soft peak varies 75.90–77.22 across these viewports.
Cold b rail-init ms across 16:9/1.6/1.5/4:3 (separate processes): glide 388.3/354.3/355.0/371.0; hold 461.2/406.0/523.6/465.5; wide 516.7/462.6/446.7/576.1; soft 578.1/499.1/571.6/636.7. `solver-b-glide.json` preserves the step-1 run; other candidate JSONs contain final runs. Full aspect times remain in `aspects.json`; timing is host-contaminated and not a browser readiness comparison.

## Reproduction, invariance and commits

`node scripts/check-composition-math.mjs b 1.7777777777777777 soft` (substitute a/c, cam or aspect); `node scripts/check-composition-rail.mjs b soft`; `node scripts/check-composition-guard.mjs first` and `resize`; `node scripts/check-composition-base.mjs`. For frontier reproduction, pass β then a JSON settings argument using `effectiveParameters` plus `"frontier":true`.
Base invariance: **1800 forward/reverse update/snap samples**, bit-exact position/quaternion components and equal FOV versus `0967653`; serialized poses also match the pre-edit snapshot byte for byte (SHA256 `7616a0d115c15f1b808819458f1bbef1929c4927c5d3362f157b0451d55918cb`). This proves the camera trace, not rendered pixels or unrelated integrated work.
All nine changed/new JS/MJS files passed `node --check`; `git diff --check` passed. The browser harness’s candidate list includes soft; it was **not run**.
Ranked commits: `9008b7d` solver; `87d5deb` anchors; `b57e272` soft; `52beffc` aspect state; `b38e5ba` guard/dense assertion; `d7d14ac` buffers/cache/resize task. Final evidence, base-check helper and report are the commit owning this README. Leg-2 README links here as superseding engineering evidence.

## Exact browser checks still needed — manager-owned lane

1. Pin served worktree/commit. Run baseline with `GT3_COMPS=base,a,b,c GT3_CAMS=leg1`, then `GT3_COMPS=a,b,c GT3_CAMS=glide,hold,wide,soft` using the manager’s `GT3_URL`/capture directory and `scripts/verify-composition.mjs` (build is also manager-owned).
2. At 16:9, 1.6, 1.5 and 4:3, inspect full-model framing/occlusion and ±FULL-offset envelope near H/C entries/exits; broad approaches, the inter-corner pan and exits; perceived car size, thin-road legibility and calmness. Soft residual motion and wide’s .78–1.45% b car length especially need human review.
3. Continuous forward/reverse wheel input, jitter, instant seek, seam/replay and held-rest poses; check amplification and absence of rendered snaps/hunting. Capture Day/Night core and ±20/±100 m approach/exit sequences.
4. Resize across wide’s ≈1.616 combined-hold threshold and hold’s ≈1.370 chicane threshold, through all four aspects and back to cached aspects. Verify label/runtime state, main-thread stall/frame timings, exact pose restoration and cache reuse. `?comp=b&cam=soft&dist=30` in dev must show one leg-1 fallback/error, finite frames and no repeating build exceptions; validate recovery on a valid reload.
5. Inspect existing shadow-window/fog/relief/terrain joins and gate/contact-shadow interaction without changing their policies. Existing all-ten road-edge/post margins are unchanged; perceived hero prominence, occlusion and Day/Night are unverified. No product winner or Phase 3 acceptance is asserted.
