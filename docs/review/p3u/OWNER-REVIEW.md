# Phase 3 Unlocked — final owner review

**HUMAN-ACCEPTED by the owner, 2026-10-17. Local main integration authorized; final sustained M4 qualification explicitly accepted as deferred. No push authorized.**

## Final owner lock-in

| | Smooth (explicit alternative) | Quality (Unlocked default) |
|---|---|---|
| URL | `?version=unlocked&mode=smooth` | `?version=unlocked` (or `&mode=quality`) |
| Main render DPR / AA | fixed1.5 / SMAA | fixed2 / SMAA |
| Tone / reflections / car specular | Neutral Day → ACES Night / medium / quarter Day | same |
| Shadows | stabilized4096² PCFSoft, existing120m coverage, added opaque furniture casters | same |
| Car textures / filtering | Tour512 / anisotropy8 | same |
| Loading | full roster warm before ready, compile/upload ahead, scene-only warm draws | same |
| Glass background | CSS-resolution, single-sample private transmission target | same |

The owner selected Quality (DPR2) as the preferred and default Unlocked mode, retaining explicit Smooth (DPR1.5). The no-version URL and `?version=locked` retain accepted Locked behavior. The owner approved the completed visual direction and existing loading, image-integrity, glass and minimap improvements; no further visual choices are pending.

## Review images

- [Approved Day colour/reflections comparison](stage1/FINAL/day.png), [Night](stage1/FINAL/night.png), [Day/Night transition](stage1/FINAL/transition.png). These are the already-approved Stage1 choices, retained.
- [Smooth/Quality resolution and AA comparison](stage2/W3/modes-aa.png): first two columns show the shipped SMAA modes; MSAA columns are diagnostic alternatives, not shipped selections.
- [Shadow before / stabilized2048 / stabilized4096](stage2/W3/shadows.png); [opaque pit-wall casting](stage2/W3/casters.png). The strongest delivered gain is stability in motion: a0.1-texel light shift changed4905 Day pixels before and zero after (Night1517→0), rather than a large change in still-image darkness.
- [Image-integrity grain/AA before](stage2/W4/grain-range-before.png) / [after](stage2/W4/grain-range-after.png); [Locked / before / after car crop](stage2/W4/rest-crop-locked_vs_before_vs_after.png). Grain-induced edge flicker at rest138→0events/frame/MP in Smooth; Quality130→0. Thin geometry can still shimmer while moving.
- [Minimap Day before](stage2/minimap/before-day-fractional.png) / [after](stage2/minimap/after-day-fractional.png), [Day zoom before](stage2/minimap/before-day-fractional-zoom4x.png) / [after](stage2/minimap/after-day-fractional-zoom4x.png); [Night zoom before](stage2/minimap/before-night-fractional-zoom4x.png) / [after](stage2/minimap/after-night-fractional-zoom4x.png). These isolate the route on a neutral backing. The old repeated brightness bands are substantially reduced; raster edges remain at4×.
- Glass target [Ferrari Day stock](stage2/W6/stock-ferrari-day-car-zoom2x.png) / [product](stage2/W6/product-ferrari-day-car-zoom2x.png), [Aston Day stock](stage2/W6/stock-aston-day-car-zoom2x.png) / [product](stage2/W6/product-aston-day-car-zoom2x.png), [Night stock](stage2/W6/stock-aston-night-car-zoom2x.png) / [product](stage2/W6/product-aston-night-car-zoom2x.png). Four repeated captures are pixel-identical; stock/product changes3–46pixels of5.62million per state, max channel delta1–7. This does not prove every possible camera view.

## Delivered engineering

W3 preserves existing lighting while stabilizing and sharpening shadows, adding missing opaque furniture casters, increasing mode resolution and consuming anisotropy8. W4 moves grain/dither behind SMAA without another fullscreen pass, removing grain-driven edge instability. W5 keeps all cars GPU-ready before input, consumes texture/filter settings, and reduces warm-up work by compiling/uploading ahead and warming the scene pass. W6 bounds the private glass-transmission pass that can become expensive at swaps, preserving main-scene and shadow quality. The minimap replaces Unlocked’s160 constant-alpha pieces with a continuous completed base and48 moving local gradients; Locked keeps its original implementation.22states/profile passed, including fractional, reverse, gantry, finish and reset.

## Meaningful tradeoffs

- Quality renders1.78× Smooth's main pixel count. It provides finer silhouettes/livery at higher GPU work and power risk; measured sustained evidence below decides practical cost. It is not artificially capped at50–55FPS.
- CSS-density glass background sampling is a targeted quality/performance tradeoff on Ferrari/Aston glazing. Review the actual crops; main-scene geometry/shadows stay at the selected mode resolution.
- Retain Tour textures: full textures added~529MiB decoded storage and~524–562MB process footprint for a small visible Tour benefit, plus~0.4–0.5s startup in W5's comparison. Existing `&textures=full` is an experimental review override, not a sustained-verified final recommendation.
- Retain SMAA. MSAA2/4 improved some motion metrics but worsened some strong-edge reversals or GPU cost in pre-integration diagnostics. A final integrated MSAA configuration has not been qualified. Adopting it would need more work, not just selecting an equivalent approved option.
- Optional `&grain=css` reproduces the softer Locked grain scale. Recommend retaining the already-approved default grain unless the owner prefers the comparison in [this sheet](stage2/W4/grain-scale-locked_smooth_smoothcss_quality.png).
- Night retains the approved lighting and darkness. Phase8 route lighting, stronger illumination and scenery are outside this reopening.

## Sustained measurements and outstanding qualification

Fresh integrated600s Smooth and600s Quality remain **unqualified**. Original FinalVerify/FinalRemaining stopped before runtime (pressure2, then40pageouts). E5 initially stopped on10pageouts; a bounded deterministic admission wait then launched the functional checks and Smooth without changing thresholds. [Exact original admission causes](stage2/final/admission-causes.json).

**Latest actual attempt (e7, after verified GT3 process cleanup):** owner-authorized identity-checked TERM removed the idle OpenCode service and old Claude background groups; VS Code/live Codex/Word/Office and unsaved documents were left untouched. No restart or force-kill. Final OpenCode/Claude process census empty. Canonical admission passed with pressure1, zero paging, CPUidle82–84%, no competing GT3 workload. Smooth then measured4246frames/70.783s before the unchanged live paging guard stopped it: pageouts830784→830904→830925 in successive10s intervals (+120,+21). Pressure remained1, swapouts1155784flat, CPUchecksPASS. Quality not started. One>33ms interval in this partial window is not a10-minute conclusion. Correct native1470×919@2/productDPR1.5/AC settings, automatic cleanup complete. [E7 facts and cleanup](stage2/final/e7-summary.json); prior [E6](stage2/final/e6-summary.json) and [E5](stage2/final/e5-report.md) attempts preserved. No product/sharedharness/threshold change or retry on unchanged host.


Recovered W6 results are diagnostic evidence of the implementation, **not final integrated qualification**. Both covered15Tours/135crossings, alternating Day/Night, hardware GPU/fullscreen. The original monitor omitted canonical CPU/paging automatic stops; the corrected final harness includes them. Minimap changes were absent.

| Mode | Duration / frames | RAF p95 / p99 / max ms | GPU p95 / p99 ms | RAF >33 / >50 ms |
|---|---|---|---|---|
| Smooth |600.5s /36,019|17.4 /17.6 /50.2|14.82 /15.50|10 /1|
| Quality |600.4s /36,011|17.5 /17.6 /34.1|15.02 /15.62|14 /0|

Programs116/textures303/geometries1501 stayed flat; reported pressure normal/swapout delta0/no pmset warning. Smooth’s50.2ms interval occurred during a BMW swap with GPU54.55ms and no long JS task/new shader. The exact original83/116ms events lack complete original traces and cannot be individually attributed. No universal stall-elimination claim.

A short recovered Quality session changed maximum233.4→34.1ms and >50ms2→0 after the patch. Single-session uncontrolled observations do not establish a sustained causal speed ratio. Fresh glass captures do prove actual target binding and tiny measured still-image differences. [W6 evidence and limits](stage2/W6/REPORT.md).

Measurements report application RAF cadence and WebGL GPU elapsed time, not displayed-frame counts. Process RSS is not direct GPU allocation. `pmset` thermal messages provide warnings, not temperature or frequency telemetry. Localhost startup measures local cached assets, not internet download performance. Automated wheel input cannot accept subjective trackpad feel on the owner's behalf.

## Regression and provenance

Final sourcefa9f19b: **Locked23/23 and default23/23 pixel-identical to acceptedfa12e92**, zero changed pixels over129,289,440 compared pixels per profile, no capture errors.10cars×Day/Night plusgrid/gate/finish.1470×956CSS/deviceDPR2/renderDPR1, headless emulation: deterministic image identity, not physical fullscreen pacing. [Locked diff](stage2/final/locked-diff.json), [default diff](stage2/final/default-diff.json), [provenance](stage2/final/locked-provenance.json).

Earlier WaveA V1 passed swap, timer/finish, route persistence and pre-ready input after URL correction. Unchanged timer/finish and persistence evidence is reused. The refreshed Unlocked checks are complete as collective evidence:28swap behavior phases PASS/no app errors; two A1 minimum-event coverage assertions failed (1observed warmup wheel, require3) before behavioral assertions. These are retained as insufficient coverage. Dedicated pre-ready PASS directly proves input/readiness/momentum/restore; no assertion was weakened or product code changed. See the [E5 functional judgment](stage2/final/e5-report.md). Minimap22states/profile and Ferrari/Aston target/visual checks passed. Integrated production build PASS.

Integration branch: `p3u-profiles`. Runtime evidence before final lock-in used product source `fa9f19b`; intervening review commits changed documentation/evidence only. The final product edit changes only Unlocked's default mode selector. Seven focused full-export configuration comparisons prove unchanged Locked/default/unknown-version behavior and explicit modes, and prove new Unlocked default equals the previously reviewed Quality configuration. Syntax, whitespace and the final production build pass. [Final configuration checks](stage2/final/closure-checks.json). Existing pixel-equivalence and functional evidence remains valid for unchanged paths. Local integration is authorized; its merge commit records the outcome. No push.

## Accepted limitations and deferred qualification

The owner explicitly accepts closure without the two final integrated ten-minute M4 sustained runs. They are **not passed**. Historical diagnostic measurements and every interrupted attempt remain preserved above and in the linked artifacts. The outstanding qualification is one600s Smooth and one600s Quality on a suitable host, only if separately resumed by the owner. No automatic retry, safeguard relaxation, restart, or interference with protected apps/documents is authorized. This deferred item no longer blocks owner-authorized local integration.

Accepted residual limitations: thin-feature motion shimmer, occasional swap misses including the historical50.2ms event, targeted glass background sampling, minimap raster edges at large zoom, and the Three r180 private-target guard needing revalidation on renderer upgrades. No universal no-stall, thermal, displayed-frame or GPU-memory claim is made.

Phase3 reopening engineering and visual review are complete. Phase8 Night route lighting remains future work only. No Phase4 or further development begins. Final main SHA, owned-process cleanup and seat release are recorded in the local closure handoff/run record and final owner confirmation.
