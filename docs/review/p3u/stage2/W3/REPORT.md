# W3 — rendering fidelity frontier

Run `p3u/e1/W3`, Sol High, base `ebad49e`. Wave A evidence on the M4; no children dispatched. No push or merge. Round 1 was interrupted by quota after its texture captures completed. Round 2 retained those captures and the valid short Day runs. The screen is locked in round 2: deterministic viewport-emulated captures are permitted, but all new performance runs are **pending unlock**. Wave B still owns sustained acceptance.

## Diagnosis and approach

The current directional shadow covers 120 × 120 world units at 2048²: 5.859 cm per texel. Its light-space projection translates continuously with the car, changing the fractional sampling phase of **stationary** scenery. PCFSoft filtering hides some jaggedness but cannot prevent that crawl. Shrinking coverage would bring back distant-shadow popping, so coverage is preserved.

Map resolution is only part of the perceived weakness. The dark asphalt, substantial unshadowed hemisphere/ambient fill, car reflections, and (especially at Night) the existing rim light limit cast-shadow contrast. The car already has a separate soft contact ellipse. A bigger map cannot make these shadows substantially darker. The existing transparent checkpoint posts/beams also deliberately do not cast; making their semi-transparent visual surfaces cast fully opaque depth silhouettes would introduce a different inconsistency.

A separate real omission: opaque pit-wall, concrete/steel barriers and marshal structure receive shadows but do not cast. Enabling casting on these existing meshes grounds them in the existing light. Flat service paint, translucent gates and fence panels remain outside that change.

## Implementation

- Unlocked directional shadows use a world-anchored light-space texel grid. The orthographic projection centre moves by at most half a texel; light position/direction and the original depth range remain intact. Both the sampling matrix and caster-culling frustum are rebuilt together. Theme transitions use their current light-space basis.
- The original `SHADOW_TUNE`, including ±60 extent, near 0.5, far 260 and normal bias 0.02, remains untouched. Higher map resolution is an unlocked settings override. No large acne or detached-shadow defect in the reviewed views justified changing bias or forcing a different shadow side.
- Unlocked opaque furniture and the pit wall now cast shadows. Only gated casting flags/imports change in `trackFurniture.js` and `startFacility.js`; W4 coordination note is in `local/handoffs/W3-shadow-flags.md` and its W4 worktree counterpart.
- Existing Day/Night lighting, split tone, reflection strengths, quarter Day indirect car specular and contact-shadow treatment stay at the owner-approved values. No new light, fixture, geometry or camera treatment is introduced.

## Owner-visible evidence

These are reviewable differences, not a claim of owner aesthetic approval. The native-view change in map sharpness is restrained; the motion-stability improvement is stronger than a still image conveys.

- [Car shadow sheet, Day and Night](shadows.png): before / stabilized 2048 / stabilized 4096, identical DPR 1.5 and lighting. Crops are enlarged 2× with nearest-neighbour sampling to expose edges.
- [Opaque pit-wall casting, Day and Night](casters.png): isolates the added caster flags, keeping 4096 stabilized shadows in both columns. No exposure or shadow-darkness increase.
- [Car occlusion near gate/finish](objects.png): before / after map comparison in both themes; finish truss occlusion is preserved.
- [Mode and AA comparison](modes-aa.png): DPR 1.5 SMAA vs DPR 2 SMAA / actual scene MSAA 2 / MSAA 4. Same shadow settings, texture set and lighting.
- [Texture comparison, Day and Night](textures.png): tour/anisotropy 1, tour/anisotropy 8, full/anisotropy 8 at DPR 2 SMAA. All three are T1 harness candidates, not W5 loader validation.
- [Gantry/road AA crop at native screenshot pixels](gantry-aa.png): includes thin truss, shadow edges, road paint and car. MSAA treats geometry coverage; SMAA also treats image-space livery and shadow edges. Neither is a universal improvement.

The controlled static-scene test freezes scene, camera, time and grain, then translates only the light and a detached light target along light-space X. At 0.1 texel the legacy map changes 4,905 pixels in the Day grid view (maximum channel delta 156); the stabilized 4096 map changes **zero**. Night grid: 1,517 changed pixels versus zero. At 0.5 texel: Day 6,781 versus zero, Night 3,738 versus zero. At whole-texel steps the residual is at most 17 pixels / one code value, consistent with floating-point roundoff. This isolates projection crawl; it does not promise to remove aliasing from moving silhouettes or a rotating light during a theme transition. Full rows are in `captures.json`.

## Recommendations and cost

The recommended values are:

| Setting | Smooth | Quality |
|---|---|---|
| Fixed DPR | 1.5 | 2 |
| AA | SMAA | SMAA |
| Directional map / filter | 4096² / PCFSoft | 4096² / PCFSoft |
| Texel stabilization | enabled | enabled |
| Extent / depth / normal bias | ±60 / 0.5–260 / 0.02 | ±60 / 0.5–260 / 0.02 |
| Car texture set | tour (512) | tour (512) |
| Anisotropy | 8 | 8 |
| Existing tone / reflections / Day car specular | split / mid / 0.25 | split / mid / 0.25 |

The values are implemented in `renderProfile.js`; SMAA remains the existing pass. W5's merged loader must consume the texture/filter values. Anisotropy 8 is a visual recommendation with **GPU cost pending unlock**; no sustained acceptance is implied. Do not impose an FPS cap or deliberately slow Quality.

The larger map plus missing opaque casters is indistinguishable from baseline cost in the single Smooth Day run (GPU p95 15.13 vs 15.10 ms; neither run has a RAF interval above 25 ms). This supports keeping the restrained sharpness improvement alongside stabilization, subject to sustained memory/pacing review.

Actual scene MSAA 2× and 4× were verified in GL (the device reports both sample counts for RGBA16F). Smooth MSAA2 has two 50 ms RAF intervals, both during morphs; the SMAA run has none above 25 ms. Quality MSAA4 has 23 intervals above 25 ms, 21 above 33 ms and 3 above 50 ms, maximum 83.4 ms, with GPU p95 30.29 ms. These single sessions do not prove the source of each stall. In particular, two morph-window hitches do not disqualify MSAA2: the round-2 temporal results below show a real benefit. MSAA4's 30.29 ms GPU p95 is a much less attractive Quality trade for a mode intended to remain perceptually smooth near 50–60 FPS. SMAA also treats livery and shadow edges; MSAA resolves geometry coverage. The diagnostics multisample only the scene input and disable the SMAA draw; unused SMAA intermediate allocations remain resident in these trials. No product MSAA branch is shipped.

### AA motion decision (round 2, W4 R1)

[Machine-readable temporal results](aa-temporal.json) preserve the complete 18-scenario matrix. The W4 integrity harness and its exact page helper are used from a local snapshot: only import paths and an optional per-configuration candidate argument were added. The flicker metric, scenario poses, production frame path and fixed 1/60 s step are unchanged. The page-helper SHA is recorded. Run configuration: `GT3_W4_SET=t123-creep,grid-creep,fence-creep GT3_W4_GRAIN=live`, 36 recorded frames after 10 settling frames. Each mode tests SMAA, scene MSAA2 and scene MSAA4; actual GL samples are 0/2/4. Tour textures, anisotropy 1 and stabilized 4096 shadows are constant. These are viewport-emulated **image measurements, not timing results**.

Flicker = two consecutive opposite-sign luma differences, both ≥8 codes. Strong = both ≥24 codes. Values are events per frame per MP; each cell orders **T1 / grid-gantry / fence**. Lower is better, but reductions in small events cannot hide an increase in strong reversals.

| Mode / AA | Flicker per frame per MP: T1 / grid / fence | Strong per frame per MP: T1 / grid / fence |
|---|---|---|
| smooth-smaa | 445.6 / 534.7 / 322.7 | 47.5 / 125.9 / 55.1 |
| smooth-msaa2 | 161.8 / 308.3 / 198.8 | 47.2 / 110.4 / 61.3 |
| smooth-msaa4 | 175.0 / 324.4 / 195.5 | 43.3 / 61.3 / 40.8 |
| quality-smaa | 301.9 / 520.1 / 312.7 | 41.9 / 124.3 / 45.4 |
| quality-msaa2 | 179.5 / 291.6 / 209.0 | 57.5 / 114.7 / 80.3 |
| quality-msaa4 | 185.0 / 296.5 / 188.7 | 29.9 / 86.7 / 50.2 |

MSAA2 reduces total events relative to same-DPR SMAA by **63.7% / 42.3% / 38.4%** for Smooth and **40.6% / 43.9% / 33.2%** for Quality (T1 / grid / fence). That is a meaningful motion benefit, not a still-only edge improvement. However, Quality MSAA2 increases strong T1/fence events **37.2% / 77.0%**, and Smooth MSAA2 increases strong fence events 11.1%. Disabling SMAA leaves image-space texture/shadow aliasing untreated. MSAA4 makes some strong edges steadier, especially the Smooth gantry, but does not consistently lower total events beyond MSAA2, and its measured Quality GPU p95/pacing cost is unattractive.

**Decision:** retain SMAA in both shipped mode rows for this patch. Quality MSAA2 remains the first alternative to test after unlock, and Smooth MSAA2 also has a real small-event benefit. Neither is rejected on average FPS or the two isolated morph hitches. Adopting either requires the corrected integrated live-grain comparison plus its GPU/pacing result; Quality MSAA2 cost is currently unmeasured. No TAA/history pipeline is introduced in this bounded patch.

**Limit:** this is one short sequence per configuration on W3's pre-W4 chain. In that chain grain passes through SMAA and can perturb its edge decisions; W4 fixes that interaction. These numbers therefore cannot establish how much MSAA still adds over the merged SMAA baseline. W4's relocated grain must also remain active in the MSAA diagnostic (see integrated verification below). Motion crops/heatmaps and raw frames are retained under `local/evidence/p3u/W3/r2-aa/<configuration>/`; `r2-aa.sh` and the local harness snapshot preserve reproduction details. The old still and short-perf evidence was retained rather than rerun.

### Texture and material decision

Retain `tour` in both modes. In the equal-DPR texture sheet, anisotropy 8 makes the oblique BMW door/roof livery and Lexus bonnet detail more legible; going from tour/8 to full/8 yields a much smaller gain at the actual Tour car size. W5 reports full adds **529 MiB decoded texture storage, 524–562 MB GPU-process footprint and 0.4–0.5 s startup**, with no measurable swap-frame improvement. That memory cost is disproportionate to the visible Tour benefit, including Quality. W3 therefore spends the available image budget on resolution and stable shadows instead. W5's cost data comes from the manager's round-2 brief; it is not remeasured here.

Anisotropy adds no texture storage according to W5, but extra filtering is not necessarily free on the GPU. Both modes use 8 because that is the directly compared, visibly useful setting. This also changes texture sampling relative to the tour/1 AA motion study, so final-mode motion must be rechecked. After unlock compare 1 versus 8 on the integrated loader in both modes; reduce Smooth filtering only if its measured pacing cost warrants it. No claim is made that the round-1 timings below include anisotropy 8: W3's old loader does not consume the settings key.

No additional light/material retuning is justified by these views. The owner-approved split tone, reflection treatment and reduced Day car specular already address the broad car-presentation issue. Increasing map size cannot strengthen fill-limited Night contrast; changing light ratios would alter the owner-approved balance without a demonstrated improvement in these comparisons. The supplied Day/Night sheets show the restrained cast-shadow change for owner review.

### Short-run performance (round 1, before W4/W5 integration)

65-second, true full-screen headful Tours on the M4, 1470×919 CSS at device DPR 2. Every row is one run, not a repeated or sustained benchmark. `performance.json` preserves provenance, display/HUD checks and full distributions. These rows use tour/anisotropy 1; only AA and DPR differ among frontier trials.

| Run | RAF p50 / p95 / p99 / max ms | GPU p50 / p95 / p99 ms | RAF >25 / >33 / >50 ms |
|---|---|---|---|
| Original Smooth, 2048 following | 16.70 / 17.50 / 17.70 / 17.80 | 13.18 / 15.10 / 16.13 | 0 / 0 / 0 |
| Smooth, stabilized 4096 + casters, SMAA | 16.70 / 17.40 / 17.60 / 17.70 | 13.15 / 15.13 / 16.18 | 0 / 0 / 0 |
| Quality, stabilized 4096 + casters, SMAA | 16.70 / 17.40 / 17.60 / 18.10 | 14.04 / 15.55 / 25.82 | 0 / 0 / 0 |
| Smooth MSAA2 | 16.70 / 17.40 / 17.60 / 50.00 | 12.90 / 15.40 / 23.85 | 2 / 2 / 0 |
| Quality MSAA4 | 16.70 / 17.50 / 17.70 / 83.40 | 13.79 / 30.29 / 34.75 | 23 / 21 / 3 |

Night SMAA for Smooth and Quality: **pending unlock**. Quality MSAA2 and Smooth MSAA4 GPU/pacing cost: **pending unlock**. Final anisotropy-8 Day/Night runs for both modes: **pending unlock**. No throttled timing result was collected in round 2. GPU-query maxima and RAF intervals measure different stages; isolated GPU outliers do not map one-to-one onto displayed frame delays.

## Verification

- Explicit locked versus the accepted `fa12e92` reference: **23/23 states identical, 0 changed pixels** (`locked-diff.json`).
- No-query default versus the same reference: **23/23 states identical, 0 changed pixels** (`default-diff.json`). Both use the existing deterministic harness at DPR 1, 1470×956 CSS, device DPR 2. Reference is served read-only from `p3u-ref` on port 5232; worker uses 5231. All server provenance is under `local/evidence/p3u/W3/`.
- Shadow algebraic check passes for Day, Night and an intermediate direction at 2048/4096: 200 translated light/target positions each; the fixed world point's fractional texel drift is <5e-13 texel; width, height and depth bounds remain unchanged. Script: `scripts/p3u-w3-shadow-check.mjs`.
- Settings checks pass: locked/default remain `{dpr:1, output:false, carEnvironment:false}`; unlocked modes use DPR 1.5/2, tour/8, stabilized 4096. `node --check` passes on the new scripts and helper; `git diff --check` passes.
- `npm run build` passes (Vite 7.3.6); its existing mixed static/dynamic `scrollDrive.js` import warning remains. No new timed run is used while the screen is locked. Compact final assertions: `verification.json`; build log: `local/evidence/p3u/W3/r2-build.log`. Owned verification servers, browser and caffeinate processes have exited; ports 5231/5232 are clear.
- W3 does not merge W4/W5 or modify their functions. The only `sceneSetup.js` edit is its helper import and `createLightingRig` override. Furniture/start-facility changes are gated casting flags; manager integration is still required.

## Required integrated verification before Wave B

The manager's W4 merge (`8d0e400`) changes the unlocked grain/SMAA order; W5 (`a51d840`) changes actual texture loading. W3 captures and short-run rows are branch-local evidence, not integrated acceptance. Repeat:

1. Locked and no-query default 23-state diffs against `fa12e92` after resolving all overlaps: zero pixels required again.
2. Day/Night car shadow, grid/pit-wall, gate and finish captures at each final mode's DPR; native-size review plus the same shadow-focused crops. Check W4 geometry coverage, grade changes, contact grounding, acne, detached shadows and slow forward/reverse Day↔Night transitions. Repeat the isolated light-translation diagnostic if the merged shadow setup changes.
3. W4's 36-frame `t123-creep,grid-creep,fence-creep` live-grain comparisons at DPR 1.5 and 2 with SMAA/MSAA2/MSAA4. **Keep grain/dither equivalent:** W4 now puts them inside SMAA's blend shader, so the old diagnostic that disables SMAAPass also removes grain/dither. A corrected MSAA diagnostic must preserve that final stage, then verify actual scene samples and buffer parity. The round-2 W3 test has grain live in the wash for all candidates and is not subject to this integrated-chain problem.
4. W5-native tour/1, tour/8 and full/8 captures for Lexus/BMW Day and Lexus/Lamborghini Night at Quality DPR 2, then final-mode captures with the recommended settings. Check texture dimensions, anisotropy and fade clones; T1 candidate captures alone do not establish loader integration.
5. After unlock, 65-second full-screen Smooth/Quality Tours in **both Day and Night**, including morph/swap windows and finish, with the final tour/8 settings. Repeat anisotropy 1 versus 8 on both modes and viable AA alternatives (particularly Quality MSAA2). Compare GPU p95/p99, RAF thresholds/clusters and memory, not average FPS alone. These short runs precede W6's sustained run; no 10-minute run belongs to this worker.

## Wave B and remaining uncertainty

- Run the integrated W3/W4/W5 build for sustained 10-minute Smooth/Quality Tours in both themes with W6. Measure frame pacing and clusters, swaps, finish/replay, GPU tails, memory pressure and thermal behaviour. A short 65-second pass is not sustained-60 acceptance.
- Inspect the approved full-screen Day/Night comparisons at the owner's normal display size, plus slow forward/reverse motion and Day↔Night reversal. The algebraic and static-light tests isolate a real defect, but cannot replace subjective motion review.
- Recheck shadow coverage near distant barriers, cast shadows crossing grade changes and finish truss/car overlap after W4 geometry changes. No shadow volume reduction is proposed.
- Verify actual W5 texture and anisotropy consumption, residency and warm-up on the integrated branch. W3's branch owns values; it does not copy or edit W5 loader work. Use native `?textures=tour&aniso=1` versus `?textures=tour&aniso=8` and `?textures=full&aniso=8`, rather than assuming the older T1 request interception equals W5 production loading.
- The 4096 map has 4× the texels of 2048. Its RGBA8 colour allocation alone adds 48 MiB, plus the larger depth attachment (driver allocation varies). Sustained unified-memory pressure may make 2048 stabilized preferable for Smooth even if a short GPU run passes.
- Remaining Night legibility/lighting art direction is Phase 8. This work improves existing shadow sampling and casting, without pre-building that lighting design.

Stopping rule: stop once these bounded defects are addressed and the remaining frontier choice depends on integrated, sustained measurement; do not pursue marginal filtering or lighting redesign in Wave A.
