# Phase 3 performance / hitch regression — blocked checkpoint

**BLOCKED before any complete, valid runtime repetition. Cause and fix: UNPROVEN.** The quiet-host resume reached A's native-GPU setup, then stopped on renewed paging. Product source is unchanged from `6d001ceea8f284faf622feb16835d9f7e59365d7`. No SMAA, props, resolution, geometry, camera, finish, timer, HUD or input change was made. This checkpoint is a harness and host-evidence handoff, not a performance fix or Phase 3 acceptance.

Engineering owner: **Sol @ xhigh**, explicitly assigned by the manager/user. The coupled attribution and harness design stayed with the loaded lead; deterministic scripts perform the mechanical repetitions. No children: serial host-bound execution would gain nothing from another worker startup/brief. xhigh fit the instrumentation/attribution design; runtime sufficiency remains unverified. No push, merge or edits to another checkout.

## Quiet-host resume — 2026-10-13 22:27–22:29 local

The owner/manager cleared the earlier competing workload. This run independently passed the two-sample gate before launching Vite, and again before launching Chrome. Port 5173 was free. Owned Vite **33608** served the `3d5c504` archive on **5212**; `lsof` confirmed cwd `/private/tmp/gt3-p3y-baseline`. Owned harness **33635** launched Chrome **33753**. No B/C/D server or browser was launched.

| Observation (UTC) | Pressure | CPU idle % | Pageouts | Swapouts | Result |
|---|---:|---:|---:|---:|---|
| Vite gate, 19:27:31 → 19:27:42 | 1 → 1 | 71.27 → 73.40 | 374,090 → 374,090 | 19,507,594 → 19,507,594 | PASS |
| Browser gate, 19:28:19 → 19:28:30 | 1 → 1 | 71.42 → 61.83 | 374,208 → 374,208 | 19,507,594 → 19,507,594 | PASS |
| Startup/early-input sample, 19:29:06 | 1 | 29.36 | 377,270 | 19,693,210 | STOP: +3,062 Pageouts / +185,616 Swapouts since browser gate |
| Last sample before TERM, 19:29:25 | 1 | 46.17 | 377,960 | 19,693,210 | +3,752 / +185,616 since browser gate |
| After process cleanup, 19:31:09 | 1 | 52.70 | 377,999 | 19,693,210 | Informational; no relaunch |

The last pre-TERM delta represents **14.66 MiB Pageouts / 725.06 MiB Swapouts**, using 4 KiB pages. Normal pressure and adequate CPU idle did not override the paging stop rule. These are host-wide counters during A startup/early input, not a measured SMAA or props regression. A has **no SMAA**, so this observation alone cannot attribute the host event to SMAA's targets; it also cannot establish the cause of the owner's B scrolling complaint. No new heavy launch followed degradation, as the resume instruction required.

**First-live-run audit, partial:** A reached readiness on Chrome **155.0.8059.40**, **Intel UHD 617 / ANGLE Metal**, **1280×800 CSS / device DPR2**. Its parked probe reported renderer DPR2 and canvas width 2560; its chain contained RenderPass + motion blur + wash, with no SMAA. Renderer memory reported 1,497 geometries / 297 textures and JS heap **234,670,919 bytes (223.80 MiB)**. The small unlock wheel reached race mode. These are setup facts, not performance distributions.

The baseline's excluded `font` symlink pointed outside Vite's archive-root allow list: **six font requests returned 403**. This is an environment/harness presentation defect, not a product regression, and would invalidate visual comparison even on a quiet host. On the next export, copy the actual font directory inside the temporary export; keep only `node_modules` symlinked. Do not alter `index.html`, font assets or another checkout to solve it.

**No complete repetition was retained** (`report.runs = []`). The stop happened during the first region's wheel input. The original SIGTERM handler closed Chrome before serializing in-page telemetry, so no partial frames or trace survived; frame interception, query-result collection, full route input, checkpoint crossing and trace extraction are still UNVERIFIED. The final TargetCloseError is expected from the deliberate shutdown, not an application error. Setup stdout and the persisted browser/GPU/host report are preserved in [data/resume-host.json](data/resume-host.json), with SHA-256 provenance for raw files in `/tmp/gt3-p3y-resume/`.

**Harness repairs from the audit:** a 30 s deterministic monitor now covers page startup and timing; the post-ready sample compares paging to the browser admission sample before admitting any repetition. Setup facts are persisted immediately, HTTP error URLs are retained and page/resource errors reject a config, later configs get a fresh two-sample gate, and SIGTERM/monitor stops attempt a bounded partial-telemetry/trace save before closing. These repairs passed syntax and diff checks; their browser behavior remains **UNVERIFIED**, because another heavy launch was barred. The first baseline repetition must be audited again.

Owned harness/Vite identities and start times were re-checked before TERM. Chrome closed through the harness handler, and `ps` confirmed all recorded owned browser children gone. Ports **5211/5212/5173** had no listeners at cleanup. The baseline archive was deleted. Product source and `main` remain unchanged; nothing was pushed. Build/gates/cold swaps/crops remain UNVERIFIED, with no render-lifecycle product edit requiring a new cone sweep at this checkpoint.

## Earlier blocked checkpoint (`d2ee6bd`)

The mandatory two-sample host gate failed **5 of 6** logged attempts. Pressure remained normal (1), but Pageouts repeatedly rose inside the 10-second intervals; two attempts also missed 25% CPU idle. The one numerical pass did not clear the separate competing-workload condition: an unowned Chrome renderer/GPU remained active. An unowned Vite on 5173 serves `phase3b-aerial-camera`, confirmed with `lsof`; it was never reused or stopped.

Across the logged attempts, host-wide Pageouts rose **10,103 pages** and Swapouts **262,538 pages** (4 KiB pages). These are host conditions, **not evidence that GT3 or SMAA caused the paging**. Existing renderer PID 6793 was observed at up to 72.7% CPU. The owner was asked to pause live heavy browser work; no response was received before checkpoint. No owned Vite, browser, build or monitor was launched.

| Preflight (UTC, 2026-10-13) | Idle %, sample 1 → 2 | Pageouts during interval | Swapouts during interval | Numeric gate |
|---|---:|---:|---:|---|
| 19:09:57–19:10:09 | 37.73 → 53.12 | +63 | 0 | FAIL |
| 19:11:26–19:11:38 | 33.66 → 47.33 | 0 | 0 | PASS; competing workload remained |
| 19:12:45–19:12:57 | 23.75 → 40.64 | +1,575 | 0 | FAIL |
| 19:13:42–19:13:54 | 39.17 → 57.70 | +413 | 0 | FAIL |
| 19:15:32–19:15:43 | 39.29 → 62.62 | +320 | 0 | FAIL |
| 19:17:24–19:17:38 | 27.39 → 23.70 | +261 | 0 | FAIL |

Portable evidence: [data/host.json](data/host.json). Full process samples and the run ledger remain in `/tmp/gt3-p3y-run/`; the compact file records the raw log's SHA-256. The temporary `3d5c504` archive export was created, then deleted. No timing or crop artifacts exist from this task.

## What source inspection establishes

`sceneSetup.js:applyResolution()` changes both renderer and composer DPR. Three r180's `EffectComposer.setPixelRatio()` calls `setSize()`, resizing its two targets and all passes. `SMAAPass.setSize()` resizes its edge/weight targets. `RenderTarget.setSize()` disposes the GPU backing when dimensions change. Therefore DPR 2 ↔ 1 **does invalidate composer and SMAA backing targets**. The following explicit composer `setSize()` is redundant, but equal-size calls do not dispose targets again. This is a source mechanism, not measured hitch attribution.

At 1280×800 CSS/DPR2, SMAA's two RGBA16F, depth-free targets have **62.5 MiB nominal color storage**, versus 15.625 MiB at DPR1. Driver residency, deletion timing and host paging causality are unmeasured. C disabling the pass also leaves its target objects participating in composer resizing, so runtime GL allocation counts must distinguish disabled-pass disposal from actual reallocation on draw.

The [previous render batch](../p3z-render/NOTES.md) recorded native-rest GPU medians of 33.48 ms without SMAA and 38.07 ms with it, and one approximately 190 ms motion-transition frame in **both** conditions. Those short historical samples motivate investigation; they are not the requested repeated regression matrix. The full-props default, changed curb/verge geometry and accepted finish restoration also differ between A and B. No competing cause is eliminated by static reading.

## Prepared comparison and evidence boundary

New bounded harness: [`scripts/perf-p3y.mjs`](../../../scripts/perf-p3y.mjs), with [`scripts/lib/perf-host.mjs`](../../../scripts/lib/perf-host.mjs). Older `perf-*` and render capture scripts do not record the required repeated stop/start distributions and full app-frame/switch/trace correlation; the new harness reuses their Puppeteer/ANGLE/Metal approach.

It defaults to **1280×800 CSS/DPR2**, the same Chrome executable and ANGLE/Metal flags, three repetitions per config. It refuses software GL, missing timer queries, wrong viewport, insufficient app/GPU samples, and a route interval that never crosses the selected checkpoint. C is a harness-only `antialias.enabled = false`; D uses `?props=lean`. No user-facing toggle was added.

Each repetition seeks to four setup poses (excluded from timing): parked grid, straight t .105, full-props hairpin t .263, and .008 before gate 4. Within each region it records 1.5 s rest, two 1.2 s wheel bursts separated by 2.8 s stops, a 3 s cruise and a final 2.8 s stop. Wheel deltas are 70 with 70 ms waits plus actual CDP dispatch overhead; observed wheel-event timestamps are saved. The route poses, snapshots and inputs must be audited in the first live run before relying on the harness.

Measurements are full application RAF-start intervals and app callback CPU duration; GPU timer queries surround the actual composer draw without waiting for each result. Per-frame DPR, speed, route/model, GL allocation events, switch timestamps, long tasks, heap and host paging are saved. A CDP trace on repetition 1 of each config supplies measured-window main-thread tasks/GC. Reports include p50/p95/p99, worst, >33/>50 ms per 10 s, separate phase/region distributions and switch-adjacent frames. Raw traces remain temporary; frame/input/allocation records are gzip-compressed. Host samples bracket each roughly one-minute timing run; degradation preserves and labels that run, then stops.

**Harness runtime itself is UNVERIFIED.** Only syntax/diff checks ran. It has not demonstrated frame interception, timer-query validity, trace mark/category extraction, checkpoint crossing or successful process teardown on this host. First launch must classify any failure as harness/host/app before changing product code.

| Config | Frame p50/p95/p99; >33/>50 per 10 s; worst | GPU | Long tasks / GC | Switches / allocations | Heap / paging |
|---|---|---|---|---|---|
| A `3d5c504`, lean default | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| B `6d001ce`, full + SMAA | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| C B, SMAA off | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| D B, `?props=lean` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Fixed build | Not implemented | — | — | — | — |

## Resume when the host is quiet

1. Independently confirm no competing heavy workload and pass the two-sample gate. Recreate a temporary `git archive` export of A. Symlink `node_modules`, but **copy the actual font directory inside the export** to avoid the observed Vite 403s. The resume owner has already authorized work; no additional owner decision is needed to proceed when the host is admissible.
2. Launch an owned baseline Vite on **5212**, verify listener PID and cwd with `lsof`, and run the harness from `p3y-perf` with `GT3_CONFIGS=A GT3_SOURCE_SHA=3d5c504 GT3_URL=http://127.0.0.1:5212 GT3_OUT=/tmp/gt3-p3y-run/A`. Stop/re-check only owned PIDs and delete the export.
3. Pass preflight, launch owned Vite on **5211** from this worktree, verify root, then run `GT3_CONFIGS=B,C,D GT3_URL=http://127.0.0.1:5211 GT3_OUT=/tmp/gt3-p3y-run/BCD node scripts/perf-p3y.mjs`. Audit the first live run. Retain three uncontaminated repetitions, with trace-run overhead labelled.
4. Compare switch-adjacent tails and GL allocations against steady motion/rest GPU cost, props and regions, trace CPU/GC, heap and host counters. If the matrix remains ambiguous, add only an intervention that separates the unresolved cause (e.g. fixed DPR1 or separately suppressing canvas/composer resizing), diagnostic-only.
5. Implement the smallest measured correction. Do not select target caches, hysteresis, SMAA changes or props reduction on this checkpoint's evidence. Retest A/B/fix with the same procedure; preserve native rest crops for grid, hairpin edge/curb and a car, plus motion if changed. Retain at-rest quality unless measured necessity establishes a tradeoff.
6. After any render-lifecycle/target edit, build and run gates-only checkpoints and cold Day/Night swaps sequentially under the host rules. Commit the fix and compact evidence (<5 MB) locally, then clean owned processes.

No alternatives have been experimentally accepted/rejected. SMAA disable, props reduction, broad geometry changes and speculative target caching were **not implemented because the bottleneck is not proven**.

## Checks and cleanup

- **PASS:** `node --check` for both new scripts; `git diff --check`; protected product-source diff empty.
- **UNVERIFIED/BLOCKED:** all requested runtime metrics, build, checkpoints, cold swaps and new native crops. No render lifecycle edit occurred, and the mandatory host gate barred a build/browser launch.
- **Preserved:** full props, SMAA, V1 finish/Replay Route, racing line, camera, checkpoints/sweep, Day/Night warm-up, HUD/grid and all excluded files; this follows from the unchanged source tree, not a new runtime acceptance.
- **Clean (earlier checkpoint):** no owned heavy processes started then; baseline export deleted; unowned Chrome/Vite left alone. **Resume cleanup:** owned Vite, harness and Chrome stopped; baseline deleted; `main` retained at `665d5ccbada3241d66a9e2ee99bf36cbf4079a26`; nothing pushed. Final branch/SHA are supplied by the handoff rather than embedded as a self-referential commit value.

Remaining blocker: a stable, uncontended native-GPU measurement window. Owner scroll feel and visual acceptance remain human checks after a proven, measured correction.
