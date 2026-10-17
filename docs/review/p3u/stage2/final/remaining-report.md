# p3u FinalRemaining — stopped at browser admission

**Result:** Partial, exit 75. `bash local/briefs/run-remaining.sh` was invoked once. Its first swap browser preflight stopped the batch before either functional ran; sustained runs were not started. No retry was made, no source was edited, and all `local/evidence/p3u/final/` artifacts remain preserved.

## Source, provenance, diagnostics

The continuation uses the integrated source recorded by FinalVerify: branch `p3u-final`, SHA `fa9f19be4b6c073212583db4cecb2b41126fa083`, zero dirty tracked files. Because the stop occurred at host preflight, no verification server was started and there is no new server provenance record. Host identity in `swap/preflight.json`: Apple M4 / Mac16,12, arm64, 16 GB, macOS 15.5; Node v24.21.0; Chrome 155.0.8059.80. No manifest, runtime errors, `incomplete`, `monitorError`, disjoint GPU query, or GPU query results were produced by this continuation; these are unavailable, not passing results.

## Functional and sustained outcomes

- Swap response: **not run**. Admission failed before server launch.
- Preready input: **not reached**; its directory is empty and there is no preready preflight/run result.
- Smooth 600 s and Quality 600 s: **not started**; no run logs, analyses, power snapshots, or performance samples exist.
- Thus RAF/GPU p50, p95, p99, max, >25/33/50 ms counts; tours, gates, themes; steady versus swap frames; first/last minute; memory/resource growth; and sustained display/CPU/power/thermal facts are all **unavailable**. RAF, if collected, is callback cadence rather than displayed frames; pmset does not report temperature or frequency; RSS does not establish GPU residency.

## Admission evidence and limits

At `2026-10-17T14:42:15.107Z`, the browser preflight sampled memory pressure 1 at both ends, but rejected admission because pageouts rose by 40 during its sample (`paging rising {"pageouts":40,"swapouts":0}`). Swapouts did not rise. Cumulative pageouts were 822,403 → 822,443; cumulative swapouts remained 1,155,784. Swap was 1,309.62 MB used / 738.38 MB free of 2,048 MB. CPU samples were 78.90% then 59.48% idle, and 11.45% then 19.67% system. Preflight counted zero heavy workloads and browsers; it observed three unrelated agent processes. This is an admission stop, not a measurement of GT3 performance.

The script did not reach its AC, low-power-mode, console-unlocked checks for sustained runs, so no such states are claimed. There is no temperature, frequency, throttling, or physical display measurement here.

## Prior completed evidence retained

FinalVerify's separate, completed locked and default identity proofs remain at `../final/`: each captured 23 states (10 cars in day/night plus grid, gate, finish), with both themes, no capture errors, and 0 differing pixels across 129,289,440 compared pixels against the accepted reference. Their browser was headless/emulated rather than a physical fullscreen session. These proofs were not repeated. Earlier W6 600-second evidence is summarized in the active run record, but it is not a result of this continuation and supplies none of the missing swap/preready outcomes.

## Raw evidence

- `swap/preflight.json`: complete failed browser admission record, including identity, workload counts, CPU, pressure, paging, and swap.
- `preready/`: empty; not reached.
- No server/browser was launched by this batch, so no cleanup was necessary beyond the script's existing traps.
