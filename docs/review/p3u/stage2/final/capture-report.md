# p3u FinalVerify — partial result

**Result:** Partial; runner stopped at the swap functional host preflight (exit 75). The one authorized invocation was `bash local/briefs/run-final.sh`; it was not retried. No source files were edited.

## Source and provenance

- Branch `p3u-final`, source SHA `fa9f19be4b6c073212583db4cecb2b41126fa083`; clean tree (`dirtyFiles: 0`, empty tree field in both manifests).
- Both owned Vite provenance records identify run `p3u`, epoch `4`, task `FinalVerify`, root this worktree, and the same SHA. Host: Apple M4 / Mac16,12, arm64, 16 GB, macOS 15.5; Chrome 155.0.8059.80; Node v24.21.0.
- Raw server provenance: `locked/server.log.provenance.json` and `default/server.log.provenance.json`.

## Captures and image diffs

Locked and default each captured the full 23-state set: 20 car/theme states (10 cars in day and night), plus grid, gate, finish. Both themes are present. Each manifest reports `errors: []`, readiness `ready`, no HUD failures, and no `monitorError`, incomplete, disjoint-query, or GPU-query diagnostic fields. The two diff reports each compare 23 images / 129,289,440 pixels: **0 differing pixels**, max channel delta 0, every state identical to `../p3u-profiles/local/evidence/p3u/V1/reference`.

Capture configuration reports viewport 1470×956 at DPR 2 (emulated), AC power, low-power mode off, visible browser, and Apple M4 ANGLE Metal. Geometry check passed for the emulated viewport; the browser was headless (`headful: false`, webdriver true), with `elementFullscreen: false` and reported screen 800×600. This is not evidence of a physical fullscreen display session. Capture manifests report renderer memory 1,501 geometries / 302 textures and 113 programs; these are single capture snapshots, not growth measurements.

## Functional and sustained results

- **Swap functional:** not run. `swap/preflight.json` failed at 2026-10-17T14:39:43.575Z, exit 75, reason `memory pressure not normal` (pressure 2). No `swap/run.log` exists.
- **Preready functional:** not reached; no preready artifacts exist.
- **600 s Smooth and 600 s Quality:** neither started. The runner stopped before entering the sustained loop; no performance run logs, analysis reports, or pmset mode files exist.
- Therefore no RAF cadence or GPU p50/p95/p99/max, >25/33/50 ms counts, resource growth, first/last-minute data, tour/gate sustained outcomes, or sustained themes are available. RAF would describe callback cadence, not displayed frames, if later measured. No RSS-as-GPU-residency inference is made.

## Host observations and limits

The runner's owned admission initially waited while pageouts rose (24, then 44, then 110); it subsequently admitted both capture runs. Their preflights were normal (pressure 1) with no paging or swapout delta over the sample, while cumulative counters remained high: locked pageouts 821,588 / swapouts 1,155,784; default pageouts 821,979 / swapouts 1,155,784. Swap was about 1,317.62 MB used of 2,048 MB. Capture preflight CPU samples were 86.46–87.11% idle and 9.27–9.60% system for locked, then 73.59–79.26% idle and 12.19–13.31% system for default.

At the failed swap preflight, pressure was 2, pageouts 822,134, swapouts 1,155,784, and swap was 1,309.62 MB used / 738.38 MB free. CPU samples were 79.45% then 76.76% idle, 12.62% then 12.91% system. Its paging delta was zero, but the pressure gate still failed. These point-in-time host readings are not a performance result. The capture manifests' pmset data records AC at 100%, low-power mode off, sleep prevented by assertions, and “no thermal/performance warning level has been recorded”; this does not establish absence of throttling or temperature limits.

## Smallest continuation

After browser-class admission is normal, continue only the remaining sequence from swap preflight: swap response check, preready input check, then Smooth and Quality sustained runs with their analyzer outputs. Preserve these completed captures and diffs; do not rerun them. No thresholds were changed. The current failed artifacts remain intact at `swap/preflight.json`.

## Raw evidence index

- `locked/` and `default/`: 23 PNGs apiece, `manifest.json`, `run.log`, server log and provenance sidecars.
- `locked-diff.json`, `locked-diff.log`, `default-diff.json`, `default-diff.log`.
- `swap/preflight.json` (failure record).
- `summary.json` (compact machine-readable result and evidence links).
