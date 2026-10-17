# P3u T1 — M4 characterization and unlocked candidate inventory

**Scope:** tooling and evidence only. Product source is unchanged. Working baseline is `751e18f` (the only source addition after accepted `fa12e92` is the unused profile contract). The owner must choose consequential visual treatments through a reversible comparison before implementation. Higher quality remains explicit `?version=unlocked`; default and `?version=locked` retain accepted values.

Measurement procedure and commands: [README](README.md). Compact measured results: [data](data/). Full capture sets, raw frames, GC traces, host process census, browser profiles and server provenance are under `local/evidence/p3u/` in this worktree. All runtime evidence uses the owned verification wrapper on port 5231 (reference 5232), one browser at a time. No new dependencies, assets, camera, composition or product settings were introduced.

## What the source establishes

- **Missing reflections confirmed.** `src/scene/sceneSetup.js` never assigns `scene.environment`. A source search of all `src/**/*.js` finds no envMap assignment; `cars.js` only writes `envMapIntensity = 1`. Runtime manifests also record scene environment false and each car material's envMap false. This removes environment-based specular lighting; it does **not** remove direct-light specular highlights. Dark/metallic regions can therefore remain nearly featureless despite substantial ambient/hemisphere diffuse fill. Increasing exposure globally would brighten road and pale liveries without supplying a reflected shape.
- Tour uses `/models/tour/*.glb` exclusively. Both the 512-pixel Tour and 1024-pixel full set already ship; geometry pipeline performs dedup/instance/Draco, without simplification. [Asset inventory](data/assets.json): 21.02 MiB Tour vs 27.59 MiB full for ten GLBs (+6.57 MiB transferred before caching). This is file size, not GPU/decoded residency.
- Renderer properties declare ACES and theme exposure (Day 1.36, Night 1.13), but the composer has no OutputPass. Three r180 disables scene tone mapping for ordinary offscreen targets, and the final custom wash shader has neither tone-mapping nor color-space invocation. This suggests the declared exposure is inert and linear values are written to the display without the intended output transform; a runtime exposure pixel probe is included in each capture manifest. This is an aesthetic candidate requiring owner judgment, not a silent correction. Composer and SMAA intermediates are already half float; increasing precision has no established benefit. Wash adds grain (0.018) and vignette (0.1) after AA; motion blur is eight taps while moving and one untouched sample at rest. Grain can obscure fine dark details; changing it changes the look.

## Intel-era constraint inventory

| Decision / assumption | Classification | M4 implication |
| --- | --- | --- |
| Fixed DPR1 + SMAA, accepting soft Retina output | Documented hardware compromise; owner-accepted locked contract | Measure native fidelity for unlocked; never alter locked |
| Intel ~9.8 ms/MPixel and ~40ms GPU at DPR2 | Assumption no longer valid on M4 | Replace with this host's measurements; retain fill-rate attribution method |
| Reject MSAA/FXAA on Intel cost and visual tradeoffs | Documented hardware compromise | Compare native SMAA and scene-only MSAA using M4 cost and moving contours |
| 512-pixel Tour-only texture set | Cost-control quality reduction | Existing 1024-pixel assets are a bounded fidelity candidate; assess readiness/memory |
| Texture anisotropy left at 1 | Disabled capability, not documented as an Intel-specific decision | Increase only where oblique textures benefit; measure instead of assuming cost |
| No output tone-mapping/color transfer pass despite declared ACES/exposure | Disabled capability / pipeline omission, not proven to be an Intel compromise | Confirm with pixel exposure probe; reversible owner comparison required |
| No environment / per-material env map | Disabled capability, origin unproven | Strong car-definition candidate; aesthetic design must match Day/Night and keep dark paint dark |
| Single-sample output canvas, one shared Tour renderer | Still-necessary optimization | Keep: multisampling only the final fullscreen triangle adds storage without scene AA |
| Fixed resolution instead of motion/idle target reallocations | Still-necessary optimization | Keep stable targets for unlocked; old 139ms resize evidence does not prove current M4 resize cost |
| Full 2048² PCFSoft shadow map and broad moving volume retained | Still-necessary visual coverage; deliberately not an Intel reduction | Avoid shrinking volume/popping; evaluate resolution at constant framing |
| Cached opaque/fade materials, preload + actual GPU warm-up, curb contact cache | Still-necessary optimization | Higher-resolution assets and environment shader variants must be genuinely GPU-ready before swaps |
| Instanced gates/furniture, passive wheel listeners, lazy montage renderer | Still-necessary optimization | Preserve regardless of hardware headroom |
| Earlier wall-clock claim that shadows were ~49% of GPU cost | Invalid historical attribution | Use timer queries; scene inclusive vs exclusive shadow explicitly separated |

## Measurements

**Accepted M4 locked baseline:** [compact results + thermal/pressure trace](data/measurements.json), raw `local/evidence/p3u/locked-600-60hz/`. Apple M4 / 16 GB / macOS 15.5 / Chrome 155.0.8059.80, ANGLE Metal; 1470×956 CSS, device DPR2, render DPR1, headful. Battery power (below 20%), OS Low Power Mode off, fresh Chrome battery saver disabled, display kept active only for the owned harness process. Server/source SHA `751e18f`, no product changes. GPU disjoint timer available, zero disjoint samples.

600.518 seconds, **36,020 frames**, **14 complete Tours** plus part of a fifteenth; all ten cars represented and **132 swap windows**. Each finish uses the actual V1 tail and real Replay button. Input uses 120ms wheel bursts with short releases and four-second finish dwells. This is scripted wheel behavior, not a claim about every trackpad gesture.

| Segment | RAF p50 / p95 / p99 ms | GPU p50 / p95 / p99 ms |
| --- | --- | --- |
| Whole run | 16.7 / 17.2 / 17.6 | 7.69 / 13.04 / 14.61 |
| Swap ±500ms | 16.7 / 17.2 / 17.6 | 7.72 / 13.72 / 15.01 |
| Steady driving | 16.7 / 17.2 / 17.6 | 7.60 / 12.89 / 14.42 |
| Finish | 16.7 / 17.2 / 17.6 | 7.80 / 10.97 / 11.51 |

Strict **≤16.7ms = 59.20%**; this requested cutoff is sensitive to timestamp jitter around nominal 60 Hz. There were **9 >25ms** frames (**0.90/min**, nine isolated clusters), **8 >33ms** (**0.80/min**, eight isolated clusters), **0 >50ms**. Worst was **exactly 50ms**, in a swap window. No >50ms long tasks were observed. Per-minute median GPU ranged **7.48–7.99ms** for the ten complete minutes; first/last minute **7.70/7.65ms**. There is no sustained cost drift evident in this run.

61 host samples: memory pressure **normal throughout**, **+2,538 pageouts / +0 swapouts**. `pmset -g therm` reported no thermal or performance warning at every sample; this is a warning-state trace, **not a measured die temperature or proof of zero throttling**. Browser PerformanceObserver exposes long tasks but not GC; heap and CDP metrics are recorded, and an separate 65s V8 GC control is included: [GC event summary](data/gc.json), with nested event types retained in the raw trace rather than double-counted. App RAF intervals are a presentation proxy, not a count of displayed compositor frames.

The interrupted attempts are excluded: [screen-saver/visibility failures](data/incomplete-attempts.json), [first interrupted trace](data/interrupted-baseline.json). The completed baseline uses the later foreground/display assertion, input timeouts and RAF watchdog. Capture determinism is independently proven: [23-state exact diff](data/determinism.json), **zero differing pixels and zero maximum channel delta in every state**. The normalized key set is also exact for [locked/default](data/default-locked.json) and [default/fa12e92 reference](data/reference-default.json), seven states each. Transient Sound UI is explicitly marked seen; it is not part of these settled-state captures.

**Steady attribution** at route t=.123 (normal Nissan, stationary, Day), [raw/compact method evidence](data/attribution.json):

| Internal DPR | Full chain median ms (all-on / repeat) | Scene-only median ms | Scene without shadows ms | Shadow feature delta ms |
| --- | --- | --- | --- | --- |
| 1 | 7.87 / 8.28 | 4.45 | 3.26 | 1.19 |
| 1.5 | 11.37 / 11.60 | 6.63 | 5.22 | 1.41 |
| 2 | 11.54 / 11.54 | 9.24 | 7.93 | 1.31 |

Scene-only is an offscreen draw into the existing half-float target, with the same scene shader/output path. Shadow delta includes map generation and shadow sampling; it is not exclusively the depth-map draw. Full chain and isolated-scene costs are not additive: removing passes changes tiler/driver scheduling and clock behavior. These are **elapsed GPU-query measurements**, not hardware GPU-busy counters.

Whole-composer ablations (average of all-on medians minus disabled-pass median): motion-blur rest copy **−0.28 / +0.70 / +0.17ms** at DPR1/1.5/2; SMAA **+0.92 / +0.93 / +0.07ms**; wash **−0.30 / −0.21 / +0.13ms**. Small/negative deltas are below the practical noise/scheduling floor and do **not** show that adding a pass makes rendering faster. The difference between full and scene-only chains is roughly **2.3–4.9ms** across these sessions. No evidence supports stripping existing effects or shrinking shadow coverage for an assumed large saving.

Direct sub-pass query readouts are retained in the measurement data but are **non-additive on this Metal path** (e.g. at DPR2, scene/motion/SMAA/wash markers read 4.80/4.43/8.93/9.71ms while a full-chain query reads about 11.54ms). The harness now samples one marker per frame rather than four query boundaries every frame. Precise isolated GPU-busy cost for each fullscreen pass remains unverified; choosing fidelity by whole-chain frame pacing avoids turning those marker artifacts into a false budget. Two scene-only DPRs completed before a component-file-induced Vite reload; DPR2 was rerun separately after the profile-directory fix. Their successful intervals and the partial-run provenance remain explicit in the raw artifacts.

## Car visibility

[Locked Day/Night contact sheet](images/cars-locked-day-night.png), native screenshot crops; Day left, Night right, rows in roster order. All ten are placed at the same accepted route t=.123 pose, using the original Tour rig, scale and camera. [Capture facts](data/captures-locked.json) contain material factors, texture dimensions and exact cameras. The projected bounding boxes are only **72–75 × 55–62 CSS pixels**; at internal DPR1 even a high-triangle model has few shaded pixels. The sheet preserves native crop pixels; whitespace separates pairs.

Common measured causes: **R** = DPR1 raster/detail limit plus ≤512-pixel textures (all anisotropy 1); **E** = absent environment/specular structure (all scene/material env maps absent, direct highlights still exist); **O** = missing output transfer/tone stage (exposure 0.1→4 changes **zero channels**, not just a subtle result). These are separate from the deliberate Day/Night lighting and each livery's albedo/BRDF. A single pose is diagnostic evidence, not proof of visibility at every angle along the Tour.

| Car | Day observation | Night observation | Cause supported by capture/material facts |
| --- | --- | --- | --- |
| Lexus RC F | Silhouette and blue accents survive; black bonnet/roof and wing merge; white roundel is easier to read than form | Body approaches road luminance; faint blue accents give position, little contour/reflected shape | R/O; smooth nonmetal paint (`ext_carpaint_inst`, roughness .10) lacks E; dark albedo is legitimate, a global brightness increase is not the target |
| Nissan GT-R | Pale/silver livery traces roof and fenders; blue/dark panels and small sponsors lose separation | Pale roof markings remain; side, rear aero and dark panels flatten into road | R/O + E on reflective/trim regions; no missing mesh inferred |
| Audi R8 | Red and silver panels clearly separate from asphalt; dark roof/glass is flat, fine striping soft | Red becomes a dark patch; silver stripes carry most of the silhouette, little internal form | R/O plus E; direct bright panel contrast explains stronger Day readability, not extra geometry |
| BMW M6 | Strongest pale-body silhouette; fenders/readable shell, black cockpit remains a simple dark shape; badges soft | Pale body remains readable; cockpit/wheels and small livery details disappear | R/O dominate; body roughness .90 and metalness 0 mean a reflection map alone cannot make this a glossy car; no reason to equalize brightness with Lexus |
| Mercedes-AMG | Blue roof/bonnet and yellow side accents identify a clear shell; panel contours remain weak | Blue/dark panels merge strongly with the road; yellow patches alone do not describe full form | R/O; E limits reflective trim/windows; saturated albedo and dark glass are not evidence of wrong geometry |
| Ferrari 488 | Red body separates well; dark glazing/vents lack reflected shape, fine sponsor text soft | Red body is substantially darker, glazing merges; shape remains more readable than darkest cars | R/O + E; only 34,769 triangles but capture does not establish faceting as the limiting cause |
| McLaren 720S | Blue edge accents locate the car; bonnet/roof and dark rear aero provide little internal form | Most of body disappears; narrow blue regions carry the identity | R/O + E; very smooth paint (roughness .0423, metalness 0) has no broad environmental highlight to reveal curvature |
| Aston Martin Vantage | Yellow panels create excellent contrast, larger roof forms clear; grille/glass and sponsors soft/black | Yellow still describes body, but internal dark features are weak | R/O; exterior roughness 0 lacks E; 23,805 triangles do not by themselves establish a need for model replacement |
| Lamborghini Huracán | Nearly black body, a few tiny yellow details; silhouette exists but panel form is poor | Dark shell is barely separable from dark road; strongest legibility failure | E is especially consequential: paint metalness **.90**, roughness **.30** suppresses diffuse while providing no environment specular. R/O compound it. Keep dark paint dark; supply contour-carrying reflections rather than repainting it |
| Porsche 911 | Orange fenders/accents give a recognizable outline; roof/cockpit dark, tiny highlights sharp but sparse | Orange and roof become dark; edge accents do not fully describe the body | R/O + E; paint metalness .50, roughness .0423 makes environmental specular important; more than 489k triangles do not cure missing reflected structure |

### Reversible visual controls

Compare [native DPR2](images/cars-native-day-night.png), [native + full assets + 8× anisotropy + diagnostic scene environment](images/cars-env-day-night.png), and [the same plus OutputPass](images/cars-output-day-night.png), with identical cameras and original per-car materials. Each sheet is Day left / Night right in roster order. Native sampling visibly recovers contour/livery edges but leaves dark Night bodies poorly defined. The environment supplies broad shape-carrying highlights, including Lamborghini, while the same map at intensity 1 over-lights Night and lifts the world. Adding output conversion makes exposure functional (0.1→4 changes **16,863,840 channels**, max delta **224**) and changes the whole tone/color relationship. These deliberately strong controls validate causes; **neither RoomEnvironment-at-1 nor the combined high-exposure look is an approved unlocked art treatment**. The [DPR1.5 car-only prototype](images/cars-recommended-day-night.png), with [full material/camera facts](data/captures-recommended.json), covers all ten cars in both themes. Original paint remains dark while broader reflections describe the forms, and the world retains a distinct Night state. Its theme-scaled diagnostic (.35 Day / .12 Night) is included for review; it is still a prototype, not a universal per-car brightness preset.

## Candidate decisions

No candidate is implemented by T1. Cost rows below will be filled with the sequential M4 measurements; visual gain is judged from paired captures, and costs are only comparable under the documented browser/power conditions.

| Rank | Candidate | Expected gain / limitation | M4 cost evidence | Locked risk / owner judgment |
| --- | --- | --- | --- | --- |
| 1 | Correctly evaluated output tone mapping + sRGB transfer | Recover dark midtone separation and highlight rolloff; currently declared exposure is inert. Large whole-image change | DPR2 steady: 12.17ms median GPU with env/full/OutputPass vs 12.05ms without output; this small delta is below cross-session noise | High coupling if shared. Unlocked-only branch; **consequential aesthetic change**, compare Day/Night at unchanged pose |
| 2 | A restrained PMREM reflection source that reveals body curvature | Especially valuable for smooth Lexus/McLaren/Porsche and .90-metallic Lamborghini. Does not mean brightening every car. Diagnostic RoomEnvironment is not an approved outdoor map | DPR2 steady: environment-only 11.92ms median vs all-on control ~11.54ms; combined prototypes are measured through a full Tour | Unlocked-only. **Consequential aesthetic change**; review dark paint, windows/trim, outdoor plausibility and both themes. Consider car-only assignment to avoid changing all scene metals |
| 3 | Highest sustainable fixed resolution, with explicit AA | Double native sampling can recover small silhouettes, livery edges, rail/curb detail. Higher DPR cannot fix absent reflection structure or missing output transform | Full-Tour DPR/AA frontier below; 2× MSAA is viable on M4, while 4× has a materially worse GPU tail | Low if locked values stay textually identical. Clarity comparison still needed; temporal shimmer not certified by stills |
| 4 | Existing 1024-pixel full models + anisotropy where useful | Sharper liveries/normal maps and oblique surfaces; same geometry, limited by only ~75 CSS-pixel car size | DPR2 steady full+8×: 11.93ms median / 13.18ms p95 GPU. Production readiness 3.36s vs 3.00s baseline in these cold-profile sessions; extra diagnostic warm-up 0.60s. These are single-session loading observations, not a precise latency promise. Asset estimate: RGBA8+mips **288.4→817.4 MiB** if every embedded image has one uncompressed resident copy; excludes render targets/driver duplication | URL-routed only. Low aesthetic intent, but check revised texture filtering/decals. Full set +6.57 MiB files, ~529 MiB estimated additional image residency |
| 5 | Preserve and extend ahead-of-use warm-up / cached fade variants | Stable first and repeated swaps with new textures/environment/output variants. Warm-up budget must not leak into driving | Car-env/full/output diagnostic warm-up: 1.13s at DPR1.5, 1.23s at DPR2; combined MSAA2/output-in-wash 2.44s. This is outside the measured driving interval | Preserve locked lifecycle. Low aesthetic risk, meaningful loading/memory tradeoff |
| 6 | Shadow resolution at constant existing volume | Cleaner contact/coin/infrastructure edges; does not fix body reflection or raster softness. Keep contact ellipse and coverage | DPR2 steady 4096²: 11.89ms median / 13.12ms p95 GPU, no long RAF interval; delta to control is below noise. Map area/storage 4× | Low when unlocked-only; compare bias/acne and distant coverage. Sharper shadows can change the look |
| 7 | Existing motion blur, grain and vignette refinement | Blur runs across the whole image and can erase small hero details; grain follows AA and adds dark noise. Disabling/recentering blur or reducing grain may improve clarity but changes accepted treatment | Isolated/ablation measurements above; small rest-pass deltas are noisy. No visual motion-blur redesign tested | **Consequential aesthetic change**, require a reversible moving comparison. Keep locked uniforms unchanged |
| 8 | Exposure / per-car roughness, metalness or albedo changes | Only after output and reflection roots are assessed. Avoid using exposure to repair missing highlights or making dark paint gray. BMW's rough nonmetal body should remain different from smooth metallic paint | No per-car rematerialization measured | Highest aesthetic risk; owner judgment required. No universal roughness or equal-brightness preset recommended |
| 9 | More precision, new temporal AA / extra post effects | Intermediates already half float. No evidence of precision banding; TAA would introduce history/ghosting and memory costs | Not measured / not justified by current evidence | Defer pending an actual defect and measured budget; not a first-pass fidelity recipe |

A smooth 60 Hz compositor is a separate prerequisite from GPU headroom. The fresh Chrome default below 20% battery produced **33.3 ms median RAF** with **6.55 ms median GPU** in the [20s control](../../../../local/evidence/p3u/headful-smoke/report.json). With `performance_tuning.battery_saver_mode.state=0` set only in the disposable measurement profile, the first thirty seconds of the sustained run produced ~60 app frames/second. Chromium's [preference declaration](https://chromium.googlesource.com/chromium/src/+/main/components/performance_manager/public/user_tuning/prefs.h) defines 0 as disabled; the official [Chrome Energy Saver explanation](https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/blog/memory-and-energy-saver-mode/index.md) describes reduced refresh cadence. This is a browser/power condition, not a reason to lower GT3 quality and expect 60 Hz under a browser-imposed cap.

## Measured fidelity / smoothness frontier

These are one 65s complete-Tour trial per row marked `tour` (every car and gate, finish and replay), or a 20s fixed-pose control marked `steady`. All use the same source and real Metal GPU. The host switched from battery to **AC charging** after the 10-minute baseline; individual conditions are recorded. The DPR1 short control has V8 tracing enabled for GC evidence. Direct timing deltas between different runs are estimates, not randomized causal comparisons. Candidate URL profile is still locked product source with labeled harness overrides; no product unlocked implementation exists in T1.

| Trial | Kind / seconds | GPU p50 / p95 / p99 ms | RAF p95 / p99 / max ms | >25 / >33 / >50 frames |
| --- | --- | --- | --- | --- |
| 1-baseline | tour / 65.6 | 7.87 / 12.39 / 13.75 | 18.30 / 18.60 / 31.70 | 1 / 0 / 0 |
| 1.5-baseline | tour / 65.6 | 12.24 / 31.67 / 44.22 | 17.90 / 18.70 / 67.70 | 33 / 26 / 3 |
| 2-baseline | tour / 65.6 | 13.55 / 14.77 / 16.90 | 17.60 / 17.70 / 83.10 | 1 / 1 / 1 |
| 2-env | steady / 20.5 | 11.92 / 13.17 / 13.89 | 17.60 / 17.70 / 17.80 | 0 / 0 / 0 |
| 2-full-aniso | steady / 20.5 | 11.93 / 13.18 / 13.85 | 17.40 / 17.60 / 17.80 | 0 / 0 / 0 |
| 2-env-full-aniso | steady / 20.5 | 12.05 / 13.32 / 14.02 | 17.40 / 17.60 / 17.70 | 0 / 0 / 0 |
| 2-msaa2 | tour / 65.6 | 13.27 / 14.93 / 17.63 | 17.50 / 17.70 / 33.40 | 3 / 3 / 0 |
| 2-msaa4 | tour / 65.6 | 13.38 / 18.65 / 31.11 | 17.70 / 17.70 / 34.40 | 8 / 6 / 0 |
| 1.5-msaa2 | tour / 65.4 | 12.52 / 14.93 / 16.84 | 17.60 / 17.70 / 33.30 | 1 / 1 / 0 |
| 2-noaa | steady / 20.4 | 10.99 / 13.45 / 14.16 | 17.60 / 17.70 / 17.70 | 0 / 0 / 0 |
| 2-shadow4k | steady / 20.5 | 11.89 / 13.12 / 13.72 | 17.60 / 17.70 / 17.70 | 0 / 0 / 0 |
| 2-env-full-aniso-output | steady / 20.5 | 12.17 / 13.37 / 13.76 | 17.60 / 17.60 / 17.80 | 0 / 0 / 0 |
| 1.5-carenv-full-aniso-output | tour / 65.5 | 13.28 / 15.06 / 15.94 | 17.60 / 17.70 / 17.80 | 0 / 0 / 0 |
| 2-carenv-full-aniso-output | tour / 65.6 | 13.69 / 15.06 / 17.83 | 17.60 / 17.70 / 34.00 | 1 / 1 / 0 |
| combined-msaa2 | tour / 65.5 | 13.31 / 15.83 / 27.76 | 17.60 / 17.70 / 115.80 | 7 / 7 / 3 |

A higher DPR is not monotonically smoother in these short sessions: the 1.5 baseline had a bad tail, whereas its car-env/output prototype had none over 25ms. That variation is evidence against choosing by a single median or pretending isolated controls predict every route section. At native DPR2, SMAA had one 83ms interval; 2× MSAA's worst was 33.4ms; 4× MSAA had a substantially worse GPU tail (31.11ms p99). The combined native2 car-env/full/fused-output/MSAA2 experiment had a **115.8ms RAF interval** and **27.76ms GPU p99** despite a good median. It is not a validated smoothness improvement. Pressure stayed normal and swapouts did not rise in the combined prototype runs; the worst stall's precise source is unproven.

**Recommended engineering starting configuration:** fixed **DPR1.5 + SMAA**, existing full 1024-pixel models, up to **8× car texture anisotropy**, explicit car-only PMREM reflections (opaque and cached fade materials), and a functioning output tone/color transform before AA. Preserve the original per-car albedo/metalness/roughness, camera, geometry, motion-blur treatment, grain/vignette and shadow coverage; start with the existing **2048² shadow map**. The diagnostic .35 Day / .12 Night environment strength is a reversible starting comparison, **not approved outdoor lighting**. The owner must judge reflection shape/intensity and the changed tone/exposure relationship; the broad indoor white panel remains an obvious art-direction limitation. No equal-brightness treatment is recommended.

The complete Day prototype at DPR1.5 recorded **no >25ms frames**, **17.8ms worst RAF**, **13.28/15.06/15.94ms GPU p50/p95/p99**. Its native2 counterpart has more fine detail but less GPU margin and a 34ms worst interval. The fused-output/native2/MSAA2 alternative saves a fullscreen stage in principle but did not survive the measured tail, so it is an alternative for later investigation, not the recommendation. A 4096² shadow map was cheap in the steady control but has no established whole-Tour benefit; compare its key captures before paying four times the map storage. Dynamic DPR/target switching is **not** recommended on an unmeasured assumption that M4 allocation is free.


The **Night** DPR1.5 prototype also completed a 65s Tour with all ten cars, Night pulse swaps and the finish: GPU p50/p95/p99 **13.22/14.96/15.86ms**, RAF p95/p99/worst **17.60/17.70/33.50ms**, >25/>33/>50 counts **2/2/0**. This is a short counterpart to the Day prototype, not a sustained unlocked acceptance run.

The 65s prototype runs do **not** establish 10-minute unlocked thermal/pacing acceptance. T2 must integrate the chosen profile without changing locked shader/config paths, warm every new opaque/fade program and texture before interaction, repeat this deterministic reference check, run the selected unlocked configuration for at least ten minutes, and present the twenty Day/Night car views plus moving shimmer/swap comparisons for owner judgment. Exact per-pass GPU-busy attribution, temporal shimmer superiority and human trackpad feel remain unverified. No child agents were launched; all GPU work was serial and scripted.
