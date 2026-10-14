# Phase 3 hitching blocker — delivery, attribution and bounded correction

Engineering owner **Sol @ xhigh**, explicitly assigned; Opus manages. No children: attribution, harness recovery and the implementation were coupled; deterministic scripts run the serial mechanics. Work is local to `p3x-perf`, from `6064a30`. No push, main or other-worktree source edits. Phase 3 acceptance and physical wheel/trackpad feel remain **UNVERIFIED**.

## Decision and evidence boundary

Investigation started 2026-10-14 09:27 UTC, with an approximately three-hour horizon. The goal is consistent delivery, preserving the accepted spatial quality, rather than peak FPS. The investigation proves a resolution-transition sensitivity plus GPU/browser backpressure, but **does not prove a complete correction**. A bounded 30fps native-resolution candidate is retained for review; it must not be called a smooth-delivery PASS. Fixed DPR1 is a measured visual tradeoff, not an accepted new default. No change to geometry, props, grid, finish, HUD or fonts is authorised by this investigation.

## Procedure

The existing `perf-p3y.mjs` ran first against the unchanged product. The expanded `perf-p3x.mjs` uses real Chrome/ANGLE Metal on Intel UHD 617, **1280×800 CSS / device DPR2**, centred pointer, a fresh browser per configuration, two repetitions, and four starting regions: grid, straight t=.105, hairpin entry t=.263, and .008 before checkpoint4. Setup seeks, morph settling, host settling, captures and trace export are excluded from timing. One browser/workload runs at a time.

The decisive stimulus is browser-owned `Input.synthesizeScrollGesture`, with the same distances and speed in every configuration. Per region: 1.5s rest; two 1.2s forward bursts separated by 2.5s stops; a 12s forward/reverse/forward cruise; then a 2.5s stop. Requests are -420px per burst and -1400/+1050/-1750px at 350px/s for the 4/3/5s cruise, with fling disabled. This Chrome/DPR combination delivers **1,470 signed / 2,520 absolute CSS pixels** per region; each run asserts those observed totals. Actual event timestamps/cadence are retained. Explicit start/stop markers prevent an incidental input-delivery pause inside cruise from becoming a planned transition. This is a synthetic mouse/trackpad-like proxy, not a physical trackpad acceptance test.

Earlier wheel runs used acknowledged 70px requests with 70ms waits. Their actual cadence depends on acknowledgment latency. They are diagnostic evidence, separately labelled, and are not the decisive before/after comparison.

The harness wraps the app's real RAF callback. It records callback intervals/CPU time, actual draw intervals, CPU/GPU per pass (scene, blur, SMAA, wash), GL allocation/upload/program/synchronization calls and their costs, resolution switches, page long tasks, heap, input timestamps and route/model state. GPU queries are non-overlapping per-pass queries; their sum excludes browser compositing. Query completion/disjoint status is retained. Input latency means injection timestamp to the first changed **draw callback**, not photons. The first ten draws/RAFs and 500ms windows are retained around input transitions and separately around DPR switches.

Quantiles pool frames; threshold counts divide by measured duration and normalise to 10s. Actual draw and app-RAF tables remain separate for pacing candidates. A 33.33ms target intentionally produces many intervals >33ms; that threshold alone is not a hitch counter at 30fps. >50ms, tail distribution, transition windows and browser presentation evidence remain material.

The matched final procedure uses a bounded CPU/GC CDP trace for repetition1's checkpoint window. GPU/cc/viz traces from the attribution pilots independently locate browser backpressure. Rich-trace and lighter-observer runs are not pooled. Export is bounded to45s; the composer is suspended **only after timing**, including export/serialization, and resumes before the next setup/settle. Already-submitted GPU work drains before result harvesting. Every measured rest and motion window uses the actual product rendering policy.

## Host state and recovery

Admission uses two pressure1 / idle>=25% samples, 10s apart, with no competing heavy workload. Startup paging is recorded and allowed. In-window Pageouts/Swapouts are retained, with entire-repetition and nonpaging-region subsets. A missing clean subset is unavailable, never zero/PASS. Host-wide paging is association, not app-exclusive causation; it does not measure GPU residency.

Hard stops are the explicit user rules: two pressure!=1 samples, two idle<15% samples outside timing, or >5s CDP/RAF collapse. The owner’s browser processes are untouched. A later lightweight thermal/power sampler records raw OS fields as an additional variable, without inventing a new admission/stop policy.

Material recovery, preserved in the temporary ledger:

- The first Vite bound IPv6 only; the failed IPv4 load was excluded, its browser closed, and the owned server restarted on explicit127.0.0.1. A separate idle23.2% admission failure launched no browser.
- An initial fixed-DPR control mutated a duplicate bare-URL sceneSetup module while Vite's app used a timestamped URL. Continued switches exposed the error. That attempt was stopped/excluded. The harness resolves the loaded resource URL and asserts renderer identity, fixed DPR after warm-up and zero switches for fixed controls. Vite was restarted.
- The first stable-canvas control had a misplaced viewport/scissor override. Its display invariant failed; it was excluded. A corrected pre-timing moving audit verifies native viewport and absence of transform/clip/scissor changes.
- The first verbose native-C trace export stalled after timing. At10:56:24 the host guard stopped it on idle8.95% /8.44% outside timing. The browser closed and partial telemetry persisted, but an unbounded trace promise kept the harness alive; the identity-checked orphan was terminated. The attempt is incomplete and excluded. Raw timed data were preserved, not promoted to a completed repetition.
- macOS reported `CPU_Speed_Limit`44, then38, then22 (scheduler limit also fell), later recovering to100 after the workload stopped. These are OS fields, not temperatures. Earlier baseline repetitions had no thermal sample: their large variation cannot be assigned a precise thermal cause. The canonical matrix was restarted with the bounded, smaller trace and post-timing render suspension, after a fresh passing gate (idle55.23% /69.18%).

## Confirmed findings

1. **The earlier canvas bottleneck is removed.** The output context is single-sample; the canvas retains native backing. Measured start/stop no longer calls renderer.setPixelRatio. Composer ratio/size calls are sub-millisecond in sampled transitions; this excludes their deferred allocation/draw work. Viewport/scissor API time does not explain the ~100ms intervals.
2. **Browser/GPU presentation backpressure occurs during start gaps.** Detailed traces contain repeated macOS `CALayerTreeCoordinator::ApplyBackpressure` waits, commonly17–21ms each with about1ms thread CPU, while renderer main is mostly idle. Some gaps precede the low-resolution switch; others follow it. A cheap gap-ending callback/GPU sample does not explain the preceding unscheduled interval.
3. **The gaps survive removal of the profiler and acknowledged wheel driver.** Fixed browser gestures with RAF/CPU-only observation, no GPU queries or GL-call timing, still produce191/208ms worst frames across two grid repetitions, with start-associated gaps. GPU query instrumentation is not required to reproduce the phenomenon.
4. **60Hz has insufficient margin.** The native scene/post chain costs about30ms of GPU time in representative samples, before compositing. Motion GPU tails exceed16.7ms too. CPU tails and changing host capacity also contribute. SMAA is a measurable secondary cost; it is not the only budget issue.
5. **Stable display geometry alone is insufficient.** Corrected full-native canvas presentation, with no CSS/viewport/scissor changes, retains approximately99–105ms start windows and adds final-pass GPU work. It is rejected as the fix.

6. **Paging is not required for a hitch, and some repeated runs have main-thread stalls too.** L2 has zero timed Pageouts/Swapouts yet a136.4ms worst draw. E2 has151,887 timed Swapouts,67 page long tasks (max242ms), and546.7ms worst draw. That correlation does not prove which process caused paging or assign every stall to it; it rules out calling the entire problem GPU-only.

## Hypotheses and limits

Fixed DPR1 changes both pre-motion GPU load and resize/target behavior. Its improvement confirms that this configuration suppresses most start hitches; it does **not** isolate target recreation from the cost of leaving native rest rendering. Dynamic switching as the sole remaining cause is UNVERIFIED. Native steady GPU p95 also exceeds a30fps budget, so simply keeping every native draw cannot guarantee stable30.

The exact source of every outlier is not established. CPU capacity/thermal changes plausibly explain some between-repetition drift; they were not sampled in the earliest windows. Shared GPU/OS scheduling and memory residency remain possible contributors. No app finish/readback/fence wait or new program/shader creation occurred in the inspected pilot window; that does not rule out driver-internal synchronization/specialization. GC evidence is bounded to traced windows; absent/untraced GC is UNVERIFIED. Physical input feel, other viewport/GPU performance and complete hitch elimination need their own evidence.

## Candidate and stop decision

The bounded candidate is opt-in at `?pace=30`; the final default remains the original render policy. It passes the RAF timestamp into `sceneSetup.render`. Unlocked Tour scene draws target33.33ms; simulation, input, camera, checkpoints, HUD and the clock still update every RAF. A late draw restarts the interval without a short catch-up. Resolution changes and resize force their matching draw immediately so CSS scale and target pixels remain atomic. Explicit warm-up/`render(0)` and other/locked modes keep their render lifecycle. SMAA, full props, native rest DPR2 and existing motion DPR1 remain.

This improves typical start windows, but **actual draw tails remain**, including in continuous motion. App RAF becoming steadier is not proof of steadier scene presentation. The candidate is a reviewable experiment, not Phase3 acceptance or a complete hitch fix. The time-bounded investigation stops here instead of extending into a browser/driver scheduling rewrite. Owner review is required to choose any spatial tradeoff; no default low-resolution/SMAA/props choice is made.

## Matched comparisons

B=original SMAA+dynamic DPR; C=SMAA off (diagnostic); L=fixed DPR1+SMAA; M=blur pass removed (diagnostic); E=30fps draw candidate with original dynamic DPR/SMAA. B/C/L/M each have two fresh-config-browser repetitions; E has two canonical repetitions plus a separately reported fresh untraced confirmation. The two repetitions within each configuration share its fresh browser, as specified by the harness; they are not two fresh-browser launches. Every full-route repetition uses identical input and four regions. Controls and source/harness identities are retained in data.

Thermal/paging capacity is **not held constant**: B/C began at reported CPU limit100; the cool-start100×2 gate was added before M/E; L was launched just before that addition, with the required pressure/idle gate. Between-run drift is reported rather than attributed to the control alone. All timed rows, including paging, are retained. Unsettled windows remain measured and labelled. The relative performance of controls under perfectly equal OS conditions remains UNVERIFIED.

<!-- TABLES -->

All windows, including paging; actual scene draw intervals. Counts are per10s.

|Config|Draw p50 / p95 / p99 ms|>33 / >50 per10s|Worst ms|GPU p50 / p95 / p99 ms|CPU callback p95 ms|Timed Pageouts / Swapouts|
|---|---|---|---|---|---|---|
|B|17.3 / 34.8 / 45.4|72.4 / 3.7|274.9|13.8 / 32.2 / 36.9|11.9|175 / 0|
|C|17.4 / 34.4 / 51.7|63.3 / 6.2|167.5|12.9 / 26.4 / 28.5|16.2|210 / 0|
|L|17.1 / 34.4 / 40.6|70.2 / 2.7|136.4|13.5 / 20.3 / 23.2|14.6|6 / 0|
|M|17.6 / 49.3 / 73.0|75.8 / 16.6|551.5|13.8 / 28.7 / 33.2|22.6|154 / 0|
|E|33.4 / 50.1 / 136.0|177.7 / 13.7|546.7|21.0 / 34.7 / 46.0|11.9|1779 / 151887|

Each repetition is retained below. E2 includes151,887 timed Swapouts (4KiB pages, about593MiB); it is not a clean speed comparison. M2 has no timed paging but50 page long tasks and a recorded CPU speed limit22. Neither outlier is silently excluded.

|Run|Draw p50 / p95 / p99 ms|Worst ms|>50 per10s|Long tasks count / max ms|Timed Pageouts / Swapouts|GC count / total / max ms in traced checkpoint window|
|---|---|---|---|---|---|---|
|B1|17.5 / 35.2 / 47.8|274.9|3.6|4 / 87|130 / 0|38 / 44.8 / 5.5|
|B2|17.1 / 34.5 / 41.9|166.0|3.9|2 / 113|45 / 0|UNVERIFIED|
|C1|17.1 / 33.9 / 43.5|147.5|4.2|4 / 73|171 / 0|46 / 79.4 / 40.8|
|C2|18.4 / 35.0 / 54.5|167.5|8.2|5 / 74|39 / 0|UNVERIFIED|
|L1|17.2 / 34.4 / 37.6|98.5|2.2|2 / 86|6 / 0|34 / 76.7 / 5.9|
|L2|17.1 / 34.4 / 43.3|136.4|3.1|8 / 113|0 / 0|UNVERIFIED|
|M1|17.2 / 34.1 / 36.3|551.5|2.8|2 / 61|154 / 0|43 / 59.3 / 20.1|
|M2|26.1 / 53.4 / 84.9|265.9|30.3|50 / 158|0 / 0|UNVERIFIED|
|E1|33.4 / 35.9 / 52.2|166.7|4.5|3 / 97|261 / 0|29 / 26.2 / 1.6|
|E2|33.5 / 69.6 / 161.7|546.7|22.7|67 / 242|1518 / 151887|UNVERIFIED|

Excluding entire repetitions with any timed paging leaves only L2 and M2. L2: p99=43.3ms, worst=136.4ms. M2: p99=84.9ms, worst=265.9ms. B/C/E have no whole-repetition nonpaging subset: **UNVERIFIED**, not zero. Per-region nonpaging subsets remain in performance.json.gz; those subsets change route coverage and are not substituted for the matched full-route rows. Startup/settling/export deltas are recorded separately in host records.

Explicit input windows (500ms after onset/cessation). First10 RAFs/draws and separate DPR windows are in transitions.json.gz.

|Config|Start worst-draw median / p95 / max ms|Starts with >50ms / n|Stop worst-draw median / p95 / max ms|Stops with >50ms / n|Input→changed draw p50 / p95 / max ms|
|---|---|---|---|---|---|
|B|142.5 / 172.1 / 173.6|24 / 24|33.1 / 54.4 / 121.8|5 / 24|21.8 / 34.0 / 35.0|
|C|113.7 / 147.5 / 149.6|23 / 24|32.3 / 85.7 / 101.2|5 / 24|17.3 / 35.9 / 40.1|
|L|34.7 / 50.0 / 60.4|1 / 24|32.8 / 50.7 / 71.1|2 / 24|16.7 / 25.9 / 29.3|
|M|127.5 / 165.0 / 165.8|24 / 24|34.5 / 83.2 / 94.4|7 / 24|23.0 / 52.6 / 60.1|
|E|52.3 / 161.2 / 188.8|15 / 24|35.3 / 151.7 / 170.2|6 / 24|12.8 / 103.8 / 165.6|

Sustained cruise includes direction changes, the hairpin and checkpoint crossing; pooling hides regional differences, so phase/region raw data are retained. This is actual draw delivery, not a RAF-only pacing result.

|Config|Cruise draw p50 / p95 / p99 ms|Worst ms|>50 per10s|App RAF p50 / p95 / p99 ms (all phases)|
|---|---|---|---|---|
|B|17.3 / 34.7 / 36.1|165.7|2.1|17.3 / 34.8 / 45.4|
|C|17.4 / 34.7 / 49.8|150.7|4.0|17.4 / 34.4 / 51.7|
|L|18.2 / 34.9 / 49.7|136.4|4.0|17.1 / 34.4 / 40.6|
|M|17.7 / 49.7 / 67.5|265.9|16.4|17.6 / 49.3 / 73.0|
|E|33.4 / 51.6 / 147.2|381.7|17.0|16.8 / 34.6 / 90.6|

Pass GPU p95 ms, measured with non-overlapping queries. These costs omit browser compositing. CPU pass distributions, actual drawing/GL costs and GPU disjoint counts remain in data.

|Config|Scene|SMAA|Blur|Wash|Resolution switches / allocations|New programs / explicit sync calls|
|---|---|---|---|---|---|---|
|B|21.2|6.1|1.9|2.8|48 / 196|0 / 0|
|C|22.1|—|1.9|2.7|48 / 100|0 / 0|
|L|16.3|2.2|1.5|0.9|0 / 1|0 / 0|
|M|22.0|5.8|—|2.7|48 / 196|0 / 0|
|E|24.1|6.3|2.1|2.9|46 / 188|0 / 0|

No JavaScript program creation/compile/link or finish/readPixels/fence wait appeared in any canonical timing window. Deferred driver compilation/synchronization is UNVERIFIED. L eliminates repeated target allocations but still has136.4ms worst draw and112.8ms worst CPU callback: removing switches does not solve every hitch. GC can matter for an individual outlier (C traced max40.8ms), but the matched B start gaps and untraced W reproduction do not require a comparable main-thread GC pause. Heap/renderer memory counters are retained; they do not prove a leak or GPU residency.

At steady DPR2, B GPU p50/p95/p99 is31.8/36.9/66.3ms despite callback p95=8.8ms. At steady DPR1 it is12.9/20.3/21.6ms, with draw p99=35.8ms. Both miss a16.7ms budget in their tails; native rendering also exceeds33.3ms p95 before browser compositing. A30fps cap alone therefore cannot guarantee a sustainable native budget.

## Untraced confirmation and combined alternative

The fresh untraced E confirmation uses the same four-region gesture plan with `GT3_TRACE=0`. Actual draw p50/p95/p99=33.4 / 36.2 / 62.7ms, worst=359.3ms, >50=5.6/10s; cruise p99=51.4ms. Start-window worst median/max=80.7/149.1ms. Timed Pageouts/Swapouts=1115/166598. It is another paging-affected result, not a clean confirmation. It is retained separately from the canonical pair; source draw logic is identical to the opt-in true branch.

Fixed DPR1+30fps has two fresh-config-browser grid repetitions, without a trace. Both include timed Pageouts (312/158), zero timed Swapouts. This is promising but **full-route sustained delivery and physical feel are UNVERIFIED**. Comparison below uses only the grid region for every row. These runs occurred later, with different host memory/thermal state, so the table is not a precision causal estimate.

|Grid-only policy|Draw p50 / p95 / p99 ms|Worst ms|>50 per10s|
|---|---|---|---|
|B|17.0 / 33.8 / 35.7|148.9|1.9|
|L|16.8 / 33.5 / 35.3|136.4|1.3|
|E|33.3 / 35.3 / 42.6|68.1|1.5|
|L+30|33.3 / 35.3 / 36.1|63.7|0.6|

For L+30, start-window worst-draw median/max=35.7/53.0ms, 1/6 starts >50ms; stop median/max=35.2/41.7ms. Cruise draw p99=36.1ms. It still contains63.7ms worst overall, so even this subset is not a zero-hitch PASS. Rest softness is shown in L-car.png. This combined configuration remains harness-only: `GT3_CONFIGS=L GT3_PACE=30 GT3_REGIONS=grid`.

## Alternatives and disposition

- **Original default (retained):** keeps native rest quality, SMAA and full props. It remains blocked on observed start/stop hitches and continuous-motion outliers. The earlier single-sample/native-canvas correction stays intact.
- **`?pace=30` native/dynamic candidate:** fewer submissions, no spatial-quality policy change, typical start-window improvement. Draw-tail and paging results do not establish a stable30fps outcome, so it is opt-in for review. It does not mean every frame is exactly33.33ms: switches/resize force a draw, and late RAF/GPU delivery can delay one.
- **Fixed DPR1 with SMAA:** most effective full-route start control, with only1/24 start windows >50ms versus24/24 B. Rest image is rendered at1280×800 then scaled into the native2560×1600 output. It is visibly softer; no product default or automatic low-resolution policy is shipped. Continuous outliers remain. Combining it with30fps is measured separately on the grid only above; that limited subset cannot establish full-route acceptance.
- **SMAA off:** reduces GPU p95 from32.2 to26.4ms, but23/24 start windows still exceed50ms and pooled >50ms rate is worse. Reject as a demonstrated hitch cure; retain SMAA.
- **Blur pass removed:** not sufficient; repeated start windows persist, with551.5ms worst in M1 and severe M2 host/callback drift. Reject removal as an established fix. A velocity-uniform refresh or alternative blur model would require a new task; none is silently changed.
- **Stable native final canvas/viewport with no display scale/scissor changes:** two diagnostic grid repetitions retain roughly99–105ms start windows and additional final-pass work. Reject as the fix. This is a presentation-geometry control, not a fixed-composer-resolution control.
- **Props lean:** not run. The accepted full-props configuration reproduces the issue; fixed-resolution and observer controls already bound the transition and scheduling questions. No measured evidence justifies reducing the owner's accepted content default in this bounded task.

## Visual evidence and invariants

`images/B-{grid,hairpin,car}.png` and `images/E-{grid,hairpin,car}.png` are same-view native rest crops; grain time alone is frozen after timing for exact comparison. The baseline source was still6064a30 product code when captured; that earlier driver is used only for visual pose setup, not the decisive timing comparison. Capture metadata includes camera pose, crop coordinates, DPR and target sizes. `images/E-motion.png` records the original motion-resolution/blur policy under the30fps candidate. `images/L-car.png` shows the fixed-DPR1 alternative. These are technical comparisons; owner visual/feel acceptance remains UNVERIFIED.

Source diff from6064a30 is limited to RAF timestamp plumbing and opt-in render pacing, plus performance harness/evidence. No scroll/input module, finish screen/run-out, racing line, camera composition, checkpoints/sweep, theme/warm-up content, props, HUD, grid/geometry or fonts was edited. Updates remain in their original order on every RAF. That diff boundary supports preservation; it does not replace a fresh end-to-end owner review of every protected feature.

The unchanged product was first exercised with the original `perf-p3y.mjs` (one repetition, E in that older harness's naming): RAF p50/p95/p99=17.7/36.1/74.1ms, worst656.1ms, >50ms about7.9/10s,1512 timed Pageouts/zero Swapouts. Start-window median worst was108.6ms. This reproduced the prior concern; the old stimulus/observation is not pooled with the matched native-gesture matrix. Its original report is archived separately.

## Reproduction and provenance

Use the dedicated worktree/server and mandatory host rules. Run configurations **serially**, with each browser fully closed before the next; do not paste these into parallel jobs. For the matched plan, set `GT3_CONFIGS=B` (then C/L/M/E separately), `GT3_REPEATS=2 GT3_INPUT=gesture GT3_PASS_GPU=1 GT3_TRACE_LIGHT=1 GT3_CENTER=1 GT3_URL=http://127.0.0.1:5211 GT3_OUT=<new-directory>` and run `node scripts/perf-p3x.mjs`. E now loads `?pace=30`; B/C/L/M load the original default. For the untraced confirmation add `GT3_TRACE=0`. For the combined limited alternative use `GT3_CONFIGS=L GT3_PACE=30 GT3_REGIONS=grid GT3_TRACE=0`, with two repetitions. Fixed resolution and pass-disable controls exist only in the harness.

Summarise with `node scripts/summarize-p3x.mjs <output.json> <run-directory>/report.json`. Instrumentation snapshots include exact source/hashes because the harness was corrected during diagnosis. Product timing used6064a30-compatible code for B/C/L/M, then4c7db11's pacing true branch for E and L+30. Commit1283885 adds the opt-in condition without changing that true branch. Final lifecycle checks exercise `?pace=30`; a separate viewport smoke exercises the default. Quantitative acceptance is not inferred from the final flag change.

Raw CDP traces are temporary under `/tmp/gt3-p3x` and are **not included** in the sub5MB handoff. Compact event/GC/transition summaries and SHA256 provenance are retained; raw trace replay after that temporary directory is removed will be unavailable. B/E frame streams and the additional candidate streams are retained compressed; C/L/M frame streams use a compact column schema. Full root-cause analysis beyond those retained excerpts is limited by that deliberate evidence boundary.

Rest B/E crops have exactly identical decoded RGB payloads (zero differing bytes for grid, hairpin and car). To fit the compact handoff, B image paths are relative aliases to the E PNGs; the original B PNG SHA256 values and explicit alias mapping are in provenance.json. C/L/M compact frame timings are rounded to0.001ms, progress to1e-9 and speed to1e-6; normal fast GL query/viewport/scissor records are omitted from those control streams, with slow calls and allocation/upload/program/sync records retained. Official tables use the unrounded source streams. B/E and additional-candidate raw frame streams remain exact.

## Final verification and blocker handoff

Verification owner **Sol @ xhigh**; targeted depth: render lifecycle/targets, cold warm-up/swap contracts, viewport/output invariants and same-view spatial quality. All browser checks ran serially behind two-sample host gates. The final source change after quantitative timing only adds the opt-in condition; its paced true branch is unchanged. The summarizer subsequently gained complete first-ten records beyond the500ms summary window; all canonical transitions now retain ten draws, and the500ms metrics are unchanged.

|Check|Result|Evidence boundary|
|---|---|---|
|Build after opt-in condition|**PASS**|6.17s; `data/checks/final-build.log`.|
|`verify-checkpoints.mjs`, `GT3_GATES_ONLY=1`, paced candidate|**PASS**|All9 gates forward/reverse; zero GL allocations/uploads; failed=0.|
|`verify-swap-response.mjs`, `GT3_COLD_ONLY=1`, autoDay and autoNight, paced candidate|**PASS**|Warm-up input ignored, first ready gesture starts; cold first crossing has zero new programs/textures/geometries/GL allocations/uploads. These contracts do not prove every crossing is perceptually hitch-free.|
|Viewport/output after resize, default and paced candidate|**PASS**|1440×900/DPR2,1360×850/DPR1,1280×800/DPR2; native canvas, motion/rest target sizes, aspect and restored scissor/CSS state. Not a performance matrix at those extra sizes.|
|Matched B/C/L/M/E execution and instrumentation|**PASS**|Two full-route repetitions each; equal observed input distances, unlocked Tour, checkpoint crossing, sufficient non-disjoint GPU samples; no page/resource errors. Paging/thermal variation retained.|
|Candidate resolution-switch draw atomicity|**PASS**|All46 recorded E switches drew matching target pixels immediately. No skipped switch frame.|
|Native rest crops|**PASS**|Grid/hairpin/car decoded RGB are exactly equal,0 differing bytes; explicit alias/deduplication provenance retained.|
|Motion and lower-resolution visual evidence|**PASS** (capture)|E-motion and L-car captured/inspected. Temporal quality and owner preference **UNVERIFIED**.|
|Protected source scope|**PASS** (diff)|Only `src/main.js` and `src/scene/sceneSetup.js` differ from6064a30. Default spatial policy, SMAA, props, geometry and all named protected files remain.|
|`verify-timer-finish.mjs`|**UNVERIFIED**, not rerun|No scroll/input path, clock/update ordering or finish module change; outside this render-only check cone. No new timer/finish PASS claimed.|
|Complete hitch resolution / stable30fps|**NOT PASS — BLOCKER REMAINS**|Native30 candidate has long draw tails; fixed DPR1 still has continuous outliers. No measured configuration establishes the full owner outcome.|
|Owner physical scrolling, visual acceptance, other GPUs/OSs|**UNVERIFIED**|Timing used headless Chrome155/Metal on this host with native CDP gestures. Draw callback/GPU query intervals are not photon presentation times.|
|Cleanup|**PASS**|Owned Vite78323 and sampler56439 identity-checked and stopped; no owned benchmark Chrome remains;5211/5212 have no listeners. No5212 baseline export was created.|

This stops with a bounded engineering blocker, not a merge-ready performance cure. The strongest next measured tradeoff is **fixed DPR1 plus30fps**, conditional on accepting the native-rest softness; it needs the full four-region workload and physical owner review before promotion. Preserving native rest still leaves an over-budget GPU/presentation path on this host. Eliminating its remaining browser/driver scheduling/residency outliers is not proven feasible by a small Phase3 correction. No Phase4, push or main integration occurred.

Commits before this evidence handoff:5860926 (instrumentation),7705072 (live control/trace audit),b1c3e78 (stable-canvas invariant),4262f82 (fixed native gestures),4c57308 (bounded trace/visible intervals),4c7db11 (pacing experiment),1283885 (retain original default; opt-in candidate). The evidence/summarizer handoff is the following local commit. Main remained665d5cc and phase3-integration remained6064a30.

The committed handoff is below4.8MB including crops, compact data and verification artifacts. `MANIFEST.sha256` covers retained file bytes (image aliases resolve to their shared PNG). Approximate control streams and exact raw streams are explicitly distinguished above.
