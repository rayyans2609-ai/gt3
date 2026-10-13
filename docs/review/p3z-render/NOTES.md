# Phase 3 render / grid / props candidate

Local branch `p3z-render`, based on `phase3-integration@3d5c504`. Product source finished at `45f6c7a`; later commits contain harness/evidence changes. **Implemented and machine-verified is not owner acceptance.** No push or merge. Manager-owned finish/HUD work is separate.

## Items

| ID | Status | Proven cause / result | Files |
|---|---|---|---|
| R1 | **Partly fixed; owner eye required** | Scene input had **0 samples**, although the canvas had **4**. Added spatial SMAA before grain. Road/paint and silhouette stair-stepping improve; short curb ends now share road/shoulder rings. The parallel pit lane intersected terrain at eight vertices: fixed its insufficient surface separation. Lamborghini's tiny glossy/texture details remain pixel-limited; no claim of an asset-level cure. | `sceneSetup.js`, `track.js`, `trackProfile.js`, `startFacility.js` |
| G1 | **Fixed** | Same-column pitch was 16 m, leaving only 1.78 m between boxes. Now five rows at **26 m pitch**, with **8 m stagger**, 9.6248 × 15.42 m slots at the default hero scale, and 0.38 m paint. Long bars follow the route/grade; bars meet without coplanar overlap. No corridor widening needed. | `startFacility.js` |
| P1 | **Fixed** | Full is the default; `?props=lean` remains. Removed the hairpin catch-fence panels at route t .263–.308, which minified into detached opaque rectangles. Kept that run's Armco rails/posts, the other safety runs, tyre stacks, grandstands and useful second marshal/service group. | `trackFurniture.js` |
| E1 | **Fixed / existing removal verified** | No tree mesh exists at baseline or candidate. C #2 was the marshal block/service slab group at t .247: removed that group only. Long curb spears were an authored 8 m taper; physical noses now close over one 2.4 m block. Exterior verges retain their previous smooth contour. Fixed the pit-lane/terrain intersection found during R1. | `trackFurniture.js`, `trackProfile.js`, `track.js`, `startFacility.js` |
| C1 | **Fixed (pre-existing; verified)** | All **9** post/beam/stripe thresholds remain visible. Stripe centres numerically match swap route locations (maximum Float32 error 0.000029 m). No missing/misaligned segment found; no checkpoint-source edit needed. | Checkpoint source unchanged |
| B1 | **Partly fixed; legibility deferred to Phase 8** | The atlas patch attempted to replace `texture2D` before shader includes expanded, so every board sampled the whole 150/100/50 atlas. Replaced the map include properly; the compiled shader now selects one number per instance. Boards still occupy too few, often foreshortened pixels at this aerial view. Size/orientation/architecture redesign deferred. | `trackFurniture.js` |

P1 start remains **18 m behind the line, lateral +6 m**; P2 remains **26 m, lateral −6 m**. Neither start t nor route mapping changed. First gantry crossing stays neutral. The parked rig matches its slot exactly in both variants. Road-width classes, racing-line source, camera, car assets/orientations, Night lighting/theme, scroll/core/UI/styles/main and all finish/timer logic are unchanged.

## Diagnosis and alternatives

Chrome 155, headless `new`, **real ANGLE/Metal Intel UHD 617**, never SwiftShader. Runtime WebGL checks: canvas AA true, default framebuffer 4 samples, both half-float composer targets 0; RGBA16F supports [8,4,2]. Final composer targets intentionally remain single-sampled: SMAA provides spatial AA. Adaptive DPR is unchanged: `min(device DPR,2)` at rest, 1 in motion, original settling/switch policy.

The harsh corner's maximum projected road-edge chord error was **0.072 native screenshot pixels** at 1600×900/DPR1. Increasing global road tessellation would not solve its visible raster staircase. Curbs independently sampled different chords from the shoulders, and their long taper was a real geometry issue; both were corrected at their owning sources. A first short-nose attempt pulled teeth into the outer verge; the final version separates the short physical curb from the previous smooth exterior contour. Minimum remaining verge is positive throughout the dense profile check.

Lamborghini has 321,153 triangles versus Lexus 323,594 and BMW 1,290,024. All three have normals and no flat-shaded materials. Same-camera dark Lexus / bright BMW / Lamborghini comparisons were captured at DPR1 and native DPR2. These facts and the AA comparison do not establish a need to re-author the asset. Dark paint, small pixel footprint and narrow bright surface details still limit Lamborghini's presentation. Materials, normal maps and model geometry were preserved.

On unchanged product source, controlled DPR1 trials gave:

| AA | GPU p50 rest / motion, ms | Decision |
|---|---:|---|
| None | 12.83 / 12.68 | Baseline |
| 2× MSAA on both composer targets | 23.35 / 23.98 | Rejected: unnecessary multisampling/resolving of the fullscreen intermediate as well as scene input |
| 2× MSAA on scene input only | 18.91 / 20.09 | Rejected: substantially more expensive than SMAA |
| FXAA | 14.90 / 14.53 | Rejected: softer car/curb detail in the native crops |
| SMAA | 16.37 / 16.73 | Kept: cleaner contour/detail tradeoff |

4× MSAA and higher DPR were not pursued after the lower-cost comparison. No TAA, temporal-shimmer campaign, lighting change, normal rewrite, new 3D asset or fence/grandstand rebuild.

Pit-lane diagnosis: its analytic-ground +25 mm placement differed from rendered terrain enough to put 8/102 vertices below the surface (minimum −7.3 mm). A +65 mm asphalt-course separation costs no extra geometry. Final ray checks at **202 unique vertices and triangle centres** found no intersections, minimum clearance **32.7 mm**, maximum 69.9 mm. The diagnostic raycasts run only in the capture harness, not the app.

## Comparable performance and host boundary

The strongest AA comparison is **same browser, same final product source/geometry, same input procedure, same camera/car**, toggling only the shipped SMAA pass. Rest seeks route t .123; motion starts at .105 and sends wheel delta 70 at roughly 70 ms intervals for 2 s. No screenshot is encoded during a timing interval. GPU values use `EXT_disjoint_timer_query_webgl2`; frame values measure the real app RAF/render cadence. Native motion includes the existing DPR2→1 transition.

| Condition | GPU p50 / p95, ms: off → on | RAF p50 / p95, ms: off → on |
|---|---|---|
| 1600×900, DPR1, rest | 14.00 / 14.63 → 16.14 / 16.87 | 16.5 / 20.6 → 18.0 / 36.2 |
| 1600×900, DPR1, motion | 13.89 / 14.38 → 16.52 / 17.27 | 18.0 / 32.9 → 20.2 / 45.0 |
| **1280×800 CSS, DPR2, rest** | **33.48 / 34.74 → 38.07 / 39.96** | **38.9 / 42.0 → 43.4 / 45.4** |
| **1280×800 CSS, adaptive motion** | **10.19 / 10.93 → 11.82 / 13.04** | **17.2 / 35.0 → 18.5 / 34.7** |

Native median GPU expense: **+4.59 ms at rest, +1.64 ms moving**. Native motion had one long transition frame in each condition: **193 ms off, 189 ms on**. No new GPU stall signal; a claim of perfectly smooth input is not supported by this short run. Real trackpad feel and owner visual acceptance remain human checks. The RAF tails at DPR1 are host-noisy and do not justify a precise latency claim.

Same-session scene inventory: 1501 geometries; three additional fullscreen draws with SMAA. It adds two half-float, depth-free screen targets plus two lookup textures: approximately **62.5 MiB** at native DPR2, **15.6 MiB** at motion DPR1. JS heap in native measurements was roughly 184–190 MB; this is not process/GPU residency.

Valid evidence launches used a two-sample, 10 s preflight: normal pressure, stable Pageouts/Swapouts, adequate CPU. One heavy workload at a time, owned Vite on **5211**, root verified with `lsof`. Pressure remained **normal (1)** throughout recorded samples. The host still paged around browser startups/captures; initial sample Pageouts/Swapouts were 276562/13003289 and the final-capture monitor reached 302543/14576018. Swap allocation was already substantial before this run and varied. These counters are host-wide: **memory stability/perfect responsiveness is not proven**. Consecutive paging stopped/paused heavy work; each continuation re-ran preflight. See `data/host.jsonl`. No broad memory/daemon intervention. One preliminary launcher failed to honor a newly raised stop marker; its owned browser/server were terminated before evidence collection. A pre-launch marker check and explicit dispatch gate corrected that operational mistake; the accepted evidence starts after a fresh successful preflight.

## Verification

| Check | Result | Evidence / scope |
|---|---|---|
| Production build | PASS | Final `npx vite build --outDir /tmp/gt3-p3z-run/final-build`; browser/server stopped. Existing unused-font URL and mixed-import warnings remain. |
| All nine swaps, both directions | PASS | `verify-checkpoints.mjs`, `GT3_LEAN=1 GT3_GATES_ONLY=1`: **18 crossings**, correct mounted models, zero GL allocations/uploads, no console errors |
| Cold Day and cold Night | PASS | `verify-swap-response.mjs`, `GT3_COLD_ONLY=1`, separately autoDay/autoNight: pre-ready input ignored, correct theme treatment, first crossing zero new programs/textures/geometries/GL uploads |
| Grid and first neutral crossing | PASS | `verify-facility.mjs`, `GT3_GEOMETRY_ONLY=1`: default P1/full and P2/lean; slot/rig error 0; no gantry car change/discovery/SFX |
| Return-line observation | PASS, limited | Both facility variants reach p=1/t=0 with Porsche active and finish mode. Current retained tail leaves scroll unlocked. Finish restoration/replay/timer work belongs to manager. |
| Original full facility suite | **FAIL — outdated scroll-lock expectation** | `data/facility-full-failure.json`: old assertion requires `finish.locked === true`. Actual retained-tail state is `mode: finish, locked: false`; finish files match base. Default full assertion was preserved, not loosened. Scoped mode records actual state. Remaining full finish/replay/refresh coverage is **UNVERIFIED in this batch**. |
| §30.6 and changed edge/curb regions | PASS | `verify-occlusion.mjs`, default/full, 11 targeted t: .9985, .123, .17, .283, .337, .365, .63, .645, .66, .673, .70. No terrain hit between camera and car; no hidden road cells |
| Static profile/curbs/diff | PASS | Five merged track meshes, all 20 semantic curb segments; nonterminal physical paint blocks remain 2.4 m; positive verge width; protected-source diff empty; `git diff --check` |

Valid all-gate/cold evidence from before the final pit-lane lift is reused: that later change modifies only static lane vertex height, with identical geometry/material/allocation structure, outside the swap/controller cone. The final build/occlusion/facility/captures cover the final product source. No whole-suite or combinatorial replay.

## Review images and provenance

All ordinary pairs are **native 1600×900/DPR1 viewport crops**, before at `3d5c504` with explicit full props, after final product source `45f6c7a` at the default/full URL. These cameras match exactly (position/quaternion delta 0). Crop rectangles are in `data/crops.json`; no resampling. Frame grain varies; DOM font/load differences are not a product change in this batch.

| View | Before | After |
|---|---|---|
| Parked P1 grid | [before](images/grid-parked-before.png) | [after](images/grid-parked-after.png) |
| Tight inside curb / outside edge | [before](images/edge-corner-before.png) | [after](images/edge-corner-after.png) |
| Curb nose at native pixels | [before](images/curb-tip-before.png) | [after](images/curb-tip-after.png) |
| Outside boundary at native pixels | [before](images/outside-edge-before.png) | [after](images/outside-edge-after.png) |
| Full-props runoff/barrier corner | [before](images/runoff-barrier-before.png) | [after](images/runoff-barrier-after.png) |
| Checkpoint | [before](images/checkpoint-before.png) | [after](images/checkpoint-after.png) |
| Braking boards | [before](images/braking-boards-before.png) | [after](images/braking-boards-after.png) |
| Dark Lexus | [before](images/lexus-dark-before.png) | [after](images/lexus-dark-after.png) |
| Bright BMW | [before](images/bmw-bright-before.png) | [after](images/bmw-bright-after.png) |
| Lamborghini | [before](images/lamborghini-before.png) | [after](images/lamborghini-after.png) |
| Ordinary clean control | [before](images/control-before.png) | [after](images/control-after.png) |
| Night spot | [before](images/night-edge-spot-before.png) | [after](images/night-edge-spot-after.png) |

Native Retina comparisons below are **200×200 physical pixels**, captured from 1280×800 CSS/DPR2 at the identical route pose, toggling only SMAA on the final geometry. A thin gray edge at the left is the unchanged DOM start-card border; it is outside scene AA. All three car comparisons share the camera; same-car on/off camera deltas are zero.

| Car | SMAA off | Shipped SMAA |
|---|---|---|
| Lexus (dark) | [off](images/native-without-smaa-lexus-dark.png) | [on](images/native-shipped-lexus-dark.png) |
| BMW (bright) | [off](images/native-without-smaa-bmw-bright.png) | [on](images/native-shipped-bmw-bright.png) |
| Lamborghini | [off](images/native-without-smaa-lamborghini.png) | [on](images/native-shipped-lamborghini.png) |

`images/gate-1…9-{before,after}.png` show all nine marker views; after captures are from `2e2f79d`, with unchanged post/beam/stripe geometry and SMAA. Final alignment facts are refreshed in `data/final-capture.json`; marker evidence remains reusable after the unrelated verge/lane correction. `images/trial-*` preserve same-source AA alternatives.

Raw full-frame captures stay under `/tmp/gt3-p3z-run/` on this host; committed crops/data are the portable review package. The first native `Page.screenshot({clip})` attempt missed the fixed canvas because coordinates belonged to the scrolled document. Those blank images were excluded and marked invalid in the report. Replacement captures use full viewport + native crop and were visually inspected. The baseline capture run stopped after its requested views on a host monitor event; its completed before images and measured sample counts remain valid. The first alternative sweep stopped on a browser module-import harness error after valid MSAA measurements; the Vite-import helper fixed that, with no product workaround.

## Handoff / ownership

Owner: **gpt-6.1-sol @ xhigh**, launched by manager through the explicit route wrapper. No child agents. Coupled rendering/math/visual diagnosis stayed with the already-loaded lead; mechanical execution used scripts. Reasoning effort was appropriate; rework was the short curb/verge interaction and capture-clip harness correction. No routine independent model review was warranted after the runtime proofs.

Owner eye: static contour cleanliness versus measured cost, Lamborghini's remaining small glossy details, final grid cadence/fit and the selectively reduced full-props corner. B1 larger/angled board presentation is a Phase 8 limitation. Phase 3 acceptance remains pending.

All owned Vite/browser/monitor/build processes are confirmed stopped at handoff; see `data/cleanup.json`. Main was not changed and nothing was pushed. Current instructions override the older SPEC lean-default line; this candidate defaults to full as requested.
