# Phase 3 performance regression — measured correction

Engineering owner **Sol @ xhigh**, assigned by user/manager. No children: coupled attribution stayed with the loaded lead; deterministic scripts ran serial repetitions. Local branch only, no push/main/other-worktree source edits. Product implementation is `f16f82b`. Owner scroll feel and Phase 3 acceptance remain **UNVERIFIED**.

## Finding and correction

SMAA adds steady GPU cost; the lean-props control stays close to B, and full-props/SMAA-off is close to A. These controls do not support props or revised curb/verge geometry as the dominant measured regression. Adaptive changes really invalidate composer/SMAA backing targets, but caching those targets reduced allocations without materially improving p99. The decisive avoidable costs were the unused multisampled output canvas and resizing its backing at every start/stop. Tiny residual speed also ran the eight-tap blur at native resolution after stopping.

The one-file correction retains the native **single-sample** canvas backing, paints and clears a motion-size viewport, clips/scales that region to the same CSS area, and retains the existing composer DPR1-in-motion / DPR2-at-rest policy. SMAA, full props and all scene geometry remain. High-resolution residual blur is suppressed; low-resolution motion blur is unchanged. Target reallocation still occurs; no target cache or extra renderer was added. At rest the canvas uses its full viewport with no scale/clip.

**Not a claim of complete hitch elimination:** ~100ms start-associated RAF gaps persisted even with no target allocations, little callback CPU/GPU work, visible Chrome and a blocking-wheel control. Their remaining cause is UNPROVEN. The patch addresses proven extra work; human scroll/trackpad feel still needs review.

## Required A/B/C/D matrix (three repetitions each)

A = `3d5c504`, lean default. B = `6d001ce`, full + SMAA. C = B with SMAA disabled by the harness only. D = B with `?props=lean`. All Chrome155 / Intel UHD617 / ANGLE Metal, CSS 1280×800 / device DPR2.

These initial runs use the original synchronous host sampler. It can pause the **input driver**, so their full-frame timing is diagnostic. The final comparison below uses the same corrected asynchronous sampler and centred pointer for A/B/fix; improvement claims use that comparison. GPU timers and exclusive resize timing still provide causal evidence from the initial matrix.

| Config | p50 / p95 / p99 ms | >33 / >50 per 10s | Worst ms | GPU p50 / p95 / p99 ms | Timing Pageouts / Swapouts |
|---|---|---|---|---|---|
| A | 18.7 / 45.0 / 81.6 | 96.0 / 9.7 | 238.5 | 11.3 / 37.7 / 41.5 | 309 / 0 |
| B | 20.8 / 49.1 / 67.8 | 106.0 / 13.9 | 543.9 | 13.1 / 42.7 / 46.5 | 317 / 0 |
| C | 18.2 / 43.1 / 76.3 | 106.4 / 10.5 | 187.8 | 11.2 / 36.9 / 49.0 | 0 / 0 |
| D | 19.5 / 48.4 / 79.8 | 105.1 / 11.9 | 539.1 | 12.8 / 42.2 / 45.0 | 493 / 0 |

Excluding entire repetitions with any timing-window paging:

| Config | Repetitions without timing paging | p50 / p95 / p99 ms | >33 / >50 per 10s | Worst ms |
|---|---|---|---|---|
| A | none | — / — / — | — / — | — |
| B | 1 | 22.7 / 50.4 / 61.3 | 112.7 / 20.0 | 188.5 |
| C | 1, 2, 3 | 18.2 / 43.1 / 76.3 | 106.4 / 10.5 | 187.8 |
| D | none | — / — / — | — / — | — |

No qualifying samples means unavailable, never zero or PASS. Nonpaging-region subsets are also in performance.json.

## Final matched comparison

Frozen A and B exports with real copied fonts, a fresh browser per configuration, same asynchronous host monitor / centred pointer / input script, then fixed build E. B and E repeated twice; A is a fresh reference in addition to its original three runs.

| Config | p50 / p95 / p99 ms | >33 / >50 per 10s | Worst ms | GPU p50 / p95 / p99 ms | Timing Pageouts / Swapouts |
|---|---|---|---|---|---|
| A | 17.6 / 43.4 / 80.1 | 85.5 / 12.3 | 176.9 | 10.9 / 36.8 / 40.9 | 56 / 0 |
| B | 19.0 / 47.8 / 82.7 | 89.4 / 11.0 | 593.3 | 12.8 / 42.1 / 46.3 | 291 / 0 |
| E | 18.9 / 35.0 / 63.2 | 81.9 / 6.5 | 163.2 | 13.4 / 33.9 / 43.5 | 137 / 0 |

Against B, fixed E reduces pooled frame p95 by **26.8%**, p99 by **23.6%**, and >50ms frames per 10s by **40.9%**. GPU p95 improves from 42.1 to 33.9ms. GPU median does not improve in the pooled mix; the balance of high/low DPR frames matters. Both fixed repetitions have p95 about 35ms, but their medians vary substantially (17.7 / 29.5ms). This is a useful correction, not a precision estimate or a 60fps claim.

Exclusive switch instrumentation locates the costly call: B's **renderer.setPixelRatio** median is 138.9ms (p95 163.9ms), versus 49.6ms in A. MSAA-off alone reduces that median to 27.1ms. E removes this canvas call from start/stop entirely. E's separately instrumented **composer.setPixelRatio** is 0.1ms median / 0.2ms p95; this is a different call, not a measurement of the complete switch. Allocation/upload work can occur on the following render. The median worst frame in 500ms after a low-resolution switch is B 173.0ms → E 97.2ms. Every switch timestamp and its neighbouring frames are retained in performance.json and the raw gzip telemetry.

Outside 500ms switch neighbourhoods, native-DPR GPU median is A 34.6ms, B 39.9ms, E 30.6ms; motion-DPR median is 10.6 / 12.5 / 11.2ms. Thus native rest remains above one 60Hz refresh budget even after the fix. Initial controlled B/C GPU medians are 40.0 / 33.5ms native and 12.6 / 10.6ms motion. In B's traced checkpoint window, the largest main-thread GC is 5.7ms while canvas-resize calls exceed 100ms; GC does not explain that specific stall. Occasional GC outliers exist elsewhere and are retained below.

Excluding entire paging repetitions:

| Config | Repetitions without timing paging | p50 / p95 / p99 ms | >33 / >50 per 10s | Worst ms |
|---|---|---|---|---|
| A | none | — / — / — | — / — | — |
| B | none | — / — / — | — / — | — |
| E | none | — / — / — | — / — | — |

All final repetitions have timing Pageouts, so **a fully paging-free final comparison is unavailable**. Nonpaging-region subsets are available in performance.json but cover different region mixes and cannot replace a matched clean repetition. B/E have 291/137 Pageouts (about 1.14/0.54MiB) across two repetitions, and zero timing Swapouts. This does not establish paging as the primary regression cause. The paging-free original B repetition still has 188.5ms worst frames. Startup/settling paging was allowed and is separately recorded.

The two native 2560×1600 RGBA half-float SMAA targets nominally add **62.5MiB** of colour storage (15.6MiB at motion resolution), excluding depth/driver overhead. This confirms the hypothesis's storage scale, not actual GPU residency or a paging attribution. E keeps those targets. Its retained native single-sample canvas trades more low-DPR canvas pixels for avoiding the original four-sample backing and its resize stalls; actual driver residency is UNVERIFIED.

## Interventions and rejected alternatives

N: canvas MSAA off alone (two repetitions). G: also retain canvas backing / viewport/scissor (two). H: MSAA off + high-resolution blur suppressed. K: all three render interventions. J: K plus warm high/low target banks. I: J in visible Chrome. P: K plus an empty nonpassive wheel listener. The latter four are bounded single-repetition controls, not precision estimates.

| Config | p50 / p95 / p99 ms | >33 / >50 per 10s | Worst ms | GPU p50 / p95 / p99 ms | Timing Pageouts / Swapouts |
|---|---|---|---|---|---|
| N | 17.3 / 35.0 / 75.6 | 49.8 / 8.2 | 228.6 | 11.2 / 33.5 / 37.2 | 380 / 0 |
| G | 18.1 / 37.2 / 66.0 | 61.4 / 9.4 | 133.6 | 12.5 / 34.9 / 44.5 | 9 / 0 |
| H | 17.9 / 37.0 / 72.3 | 72.1 / 10.3 | 232.9 | 12.1 / 36.4 / 46.6 | 107 / 0 |
| K | 18.0 / 35.0 / 63.9 | 51.8 / 8.1 | 119.1 | 12.2 / 33.3 / 41.8 | 161 / 0 |
| J | 18.6 / 37.0 / 66.2 | 57.4 / 8.6 | 129.1 | 12.3 / 36.4 / 38.1 | 162 / 0 |
| I | 18.3 / 35.7 / 67.1 | 60.2 / 9.7 | 230.4 | 12.5 / 34.3 / 36.2 | 199 / 0 |
| P | 17.4 / 34.1 / 61.1 | 39.3 / 6.1 | 116.5 | 11.6 / 33.0 / 35.7 | 69 / 0 |

SMAA off improves steady cost but loses accepted edge treatment and leaves large stalls. Lean props remains slow with SMAA. Neither ships. Target caching changes ~96–98 storage calls to ~2 but does not improve the observed tail enough to justify residency/private-API complexity. Visible Chrome and a blocking-wheel control do not explain/remove the residual start gaps; no input listener or scheduling policy change ships. Fixed DPR1, longer blur-at-rest or long hysteresis were not selected: native rest quality remains required.

## Procedure / evidence boundary

Each repetition seeks (excluded from timing) to grid, straight t=.105, hairpin entry t=.263 and .008 before gate4. Wait for morph completion and ~20s unchanged Pageouts/Swapouts, at most ~90s; unsettled windows run with a label. Per region: 1.5s rest, two 1.2s wheel bursts with 2.8s stops, 3s cruise and 2.8s stop. Wheel input is 70px with 70ms waits plus recorded CDP overhead. Actual wheel timestamps, progress, car, DPR, GPU queries, GL storage calls and frame/callback intervals are retained; all reported repetitions crossed gate4. Setup seeks, settling, screenshots and trace export are excluded. Trace covers repetition1's checkpoint window only. Traced/untraced rows stay separate below.

Manager's 2026-10-13 RESUME2 amendment governs: two-sample pressure1/idle≥25/no-heavy-competitor launch gate; startup paging allowed; timing paging retained and reported including/excluding it; stop on two pressure≠1 samples, two idle<15 samples outside timing, or >5s CDP/RAF collapse. One browser at a time, no other tabs, no timing screenshots. Pageouts/Swapouts are host-wide association, not app-exclusive causation. 4-KiB pages. Startup/settling counters remain in raw host JSONL; timing deltas are in every portable run.

Early harness attempts were excluded: an unbounded trace included settling and could not export; a responsiveness/hook audit failed before frames; B's first launch had font403s. B dev-server fs.allow was corrected only in temporary config; A exports copied real fonts. No product patch used those failed attempts as proof. Host sampling now uses async child processes, timer instrumentation is warmed/audited before timing, and per-window telemetry persists before trace export.

| Set / config / repetition | Trace CPU tasks >50ms | GC count / total / max ms | Switches / texture storage calls | Heap before → after MiB | Paging |
|---|---|---|---|---|---|
| legacy / A / 1 | 7 | 91 / 138.2 / 6.0 | 24 / 50 | 185.7 → 180.0 | true |
| legacy / A / 2 | not traced | — | 24 / 50 | 179.6 → 181.7 | true |
| legacy / A / 3 | not traced | — | 24 / 50 | 183.6 → 178.0 | true |
| legacy / B / 1 | 7 | 74 / 96.7 / 4.4 | 24 / 96 | 227.2 → 185.6 | false |
| legacy / B / 2 | not traced | — | 24 / 98 | 179.5 → 187.5 | true |
| legacy / B / 3 | not traced | — | 24 / 98 | 185.4 → 181.7 | true |
| legacy / C / 1 | 8 | 72 / 186.3 / 45.2 | 24 / 50 | 218.1 → 178.7 | false |
| legacy / C / 2 | not traced | — | 24 / 50 | 178.5 → 182.0 | false |
| legacy / C / 3 | not traced | — | 24 / 50 | 183.5 → 178.6 | false |
| legacy / D / 1 | 7 | 27 / 103.9 / 19.4 | 24 / 96 | 194.1 → 183.2 | true |
| legacy / D / 2 | not traced | — | 24 / 98 | 185.4 → 181.0 | true |
| legacy / D / 3 | not traced | — | 24 / 98 | 179.1 → 184.7 | true |
| interventions / N / 1 | 2 | 27 / 91.7 / 32.0 | 24 / 98 | 208.5 → 184.1 | true |
| interventions / N / 2 | not traced | — | 24 / 98 | 178.8 → 181.4 | true |
| interventions / G / 1 | 3 | 84 / 125.7 / 15.7 | 24 / 98 | 185.2 → 180.8 | false |
| interventions / G / 2 | not traced | — | 24 / 98 | 180.4 → 184.2 | true |
| interventions / H / 1 | 5 | 24 / 115.8 / 48.0 | 24 / 98 | 195.1 → 178.9 | true |
| interventions / K / 1 | 0 | 48 / 59.6 / 6.1 | 24 / 98 | 195.1 → 184.2 | true |
| interventions / J / 1 | 1 | 76 / 159.4 / 52.4 | 24 / 2 | 196.3 → 180.4 | true |
| interventions / I / 1 | 0 | 47 / 48.7 / 5.2 | 24 / 2 | 189.6 → 183.8 | true |
| interventions / P / 1 | 0 | 25 / 25.9 / 2.0 | 24 / 98 | 209.6 → 183.9 | true |
| final / A / 1 | 8 | 25 / 167.2 / 53.9 | 24 / 50 | 216.6 → 178.6 | true |
| final / B / 1 | 8 | 21 / 28.2 / 5.7 | 24 / 98 | 203.7 → 181.6 | true |
| final / B / 2 | not traced | — | 24 / 98 | 182.0 → 182.2 | true |
| final / E / 1 | 0 | 29 / 58.1 / 23.1 | 24 / 98 | 192.9 → 180.1 | true |
| final / E / 2 | not traced | — | 24 / 98 | 180.5 → 185.7 | true |

GC/long-task traces cover one checkpoint window, not the entire repetition. GC and long tasks are filtered to CrRendererMain and measured trace windows; raw events and thread metadata remain available; GPU query completeness/disjoint flags and per-phase/region metrics are in data/performance.json. All final frames have completed GPU queries and no disjoint samples. Frame-time quantiles pool measured app RAF intervals; threshold counts are normalised by their summed duration, not averaged across repetitions. GPU queries cover composer rendering, not browser compositing. No instrument-free timing control was run.

Raw traces stay under /tmp/gt3-p3y-final with SHA256 in provenance.json. Representative legacy and all final frame/input/allocation telemetry is portable gzip; other raw runs remain in the hashed temporary evidence. Final instrumentation snapshots, host JSONL, root proofs and the run ledger are included in data/. Trace files are temporary and not a durable repository artifact; their compact measured summaries are committed.

Reproduction: first run the two-sample host gate (`node scripts/lib/perf-host.mjs /tmp/p3y-launch`) before starting the owned Vite on 5211. Run `GT3_CONFIGS=E GT3_REPEATS=2 GT3_CENTER=1 GT3_CAPTURES=1 GT3_URL=http://127.0.0.1:5211 GT3_OUT=/tmp/p3y-fixed node scripts/perf-p3y.mjs`; the harness also gates its browser launch. For the original matrix use frozen 3d5c504/6d001ce exports, copy the real font directory, share only node_modules, set GT3_SOURCE_SHA to the served commit, and use config A or B/C/D. B/C/D use the same 6d001ce source. A symlink-font Vite launch needs a temporary fs.allow entry for the real font path; no tracked Vite/index/styles change was required. Close the browser/server between configurations. `scripts/summarize-p3y.mjs` pools report.json files with their adjacent raw telemetry.

## Visual and functional verification

Same-view **native** crops at grid, hairpin apex t.283 and BMW, plus B/E in-motion stills: [images](images). Crop metadata records CSS/deviceDPR, camera, probe and target formats/sizes. Decorative grain time is frozen for stills only, never timing. Motion frames are approximate same-view input states, with actual pose recorded. B/fixed grid, hairpin and car crops are pixel-identical (see pixel-comparison.json). Full motion viewport was visually inspected for full coverage. Initial numeric resize checks at sub-desktop widths exposed the expected desktop guard; supported-desktop dimensions were then rerun with an explicit guard-visibility assertion. Full viewport and resize stills remain temporary for inspection. No screenshot is a subjective owner acceptance.

**PASS:** build; gates-only all nine checkpoints forward and reverse with zero crossing GL allocations/uploads; cold Day and Night first crossings with zero GL allocations/uploads; moving/rest resize checks. See [checks.json](data/checks.json), [viewport-checks.json](data/viewport-checks.json), [gates.json](data/gates.json), [cold-day.json](data/cold-day.json), [cold-night.json](data/cold-night.json). The viewport check covers CSS 1440×900/DPR2, 1360×850/DPR1 and restored 1280×800/DPR2, with camera aspect, render-target size, clipping/scissor restoration and desktop-guard absence asserted. Supported 1440×900 motion output was also visually inspected. **UNVERIFIED:** subjective scroll feel/visual acceptance, completely hitch-free input, GPU residency, and fully clean-host final timings.

Protected sources (startFacility, trackCurve, styles, index, finish/timer/scroll, car/line/camera/checkpoint/theme/warm-up) have no product diff from 6d001ce. Reuse their existing acceptance boundary; no unrelated regression sweep. First-crossing resource assertions and cold swap checks cover the render lifecycle seam. All owned browsers/Vite processes are stopped and temporary exports removed; [cleanup.json](data/cleanup.json) records no listeners on 5173/5211/5212, no Chrome processes, and main unchanged at 665d5cc.

Thinking-level finding: xhigh appropriate for coupled instrumentation/attribution, with meaningful harness recovery cost. Routing remains Sol execution lead plus scripts; no stronger-model escalation, children or policy rewrite.
