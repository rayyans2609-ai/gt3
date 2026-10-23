# W1 — integration seams and provisional Hub hardening

Run `p4-landing/e1/W1`, M4 16 GB, 2026-10-24. Engineering evidence only; owner visual acceptance remains open.

Owner: GPT-6.1 Sol @ high. The coupled transition, scroll and renderer investigation stayed with the execution lead; short sequential probes fed the next bounded edit, so another worker/worktree would add handoff cost without parallel browser capacity. No sub-workers. Verification depth: targeted runtime fault/state checks for both renderer profiles, the required Landing flow, syntax checks and production build. Existing Phase 3 suites and first-frame comparisons are reused; no regression signal warranted replaying them.

## Findings

| Concern | Classification and action | Evidence |
|---|---|---|
| Handoff exceptions / hidden rAF | **Defect fixed.** Baseline entry and return resize exceptions left transitions open with the drive locked; withheld rAF left entry pending. Both paths now clear their busy guard in `finally` and recover the originating world, field and input ownership on failure. Entry uses the existing bounded browser yield twice. The targeted test retries both paths and completes with withheld handoff rAF callbacks. | `local/evidence/w1/before.json`, `seams3.json`, final `seams-final.json` |
| Shared renderer / Unlocked | **Defect fixed** for exceptional Landing draws: exposure previously leaked and an existing render target was discarded. A `finally` restores exposure, target, cube face and mip level. **No normal-path restoration defect found:** Locked DPR1 and Unlocked Quality DPR2 recover the same size, viewport, scissor/test, exposure, tone mapping, output colour space and canvas transforms after a round trip. A controlled draw exception restores an offscreen target. | `seams3.json`, final `seams-final.json`; baseline `renderLanding()` lacked restoration on throw |
| Retained resources | **Keep resident on current evidence; Intel needs human verification.** The Landing graph contains 17.17 MiB of geometry arrays and an estimated 143.79 MiB of texture payload (including its 6 MiB PMREM). This is an inventory estimate, not a driver allocation counter; CPU copies and driver overhead are excluded. Retaining about 161 MiB has no demonstrated pressure problem on this M4. No release/reload policy or asset change is justified. | `resources-before-budget.json`, `resources.json`; corresponding `.provenance.json` / `budget.log.provenance.json`; preflight pressure normal, swapouts unchanged across probes |
| Warm-up overlap | **Defect fixed** in scheduling: the existing 12/24 ms budgets assumed a covered Tour loading screen and could consume a whole refresh before drawing the visible Landing. Landing ownership now limits each warm-up frame to 4 ms; Tour budgets remain unchanged. Unlocked loading median falls 33.4 → 16.7 ms; readiness 2.19 → 2.39 s. **Residual first-use stalls need human verification**, rather than an unauthorized asset/visual redesign. | `resources-before-budget.json` vs `resources.json`, `resources.log.provenance.json` / `budget.log.provenance.json` |
| Hub readiness / keyboard / threshold / resize | **Defect fixed:** a ready button could receive focus with the Hub only 5.7% visible. Hub content is now inert until its resting interactive state, and during handoffs. **No other defect found:** loading/failed disable entry, degraded permits it; keyboard entry and handoff key swallowing, native Landing scroll keys, Hub viewport growth and mid-Landing resize are exercised. Rapid wheel reversal coverage is in the final harness. | `before.json`, `seams3.json`, final `seams-final.json`, `flow-final.json` |
| Session / navigation / finish / lazy initialization | **Not an issue in exercised paths.** Refresh during a return restores the Tour at route .2; refresh after return restores Hub. Repeated lazy Landing use retains one home control. Finish/complete refuses the home edge, preserving existing Tour behavior. The final harness additionally refreshes during entry and checks Hub restoration. | `seams3.json`, final `seams-final.json`; existing and final Landing flow |

All local evidence above is under `local/evidence/w1/`. Each runtime server has a matching `<name>.log.provenance.json`. Intermediate `seams.json` and `seams2.json` are retained failures of the new test fixture (rAF-based polling while rAF was deliberately withheld; then a readiness block inserted before the Tour-refresh assertion), not product failures. `seams3.json` passes both profiles; final artifacts include the completed Tab, readiness-guard, threshold and entry-refresh coverage.

## Performance scope

Chrome 155 headless, ANGLE Metal / Apple M4, 1440×900 CSS, device DPR2. One startup sample per profile/policy, sequential browser use. Decision-useful scheduling comparison, not a cold-cache benchmark or sustained qualification.

| Profile | Original loading intervals | 4 ms Landing budget | Readiness, original → 4 ms |
|---|---|---|---|
| Locked | n=101, median 16.7 ms, 4 >25 ms, max 266.7 ms | n=128, median 16.7 ms, 4 >25 ms, max 266.6 ms | 3.06 → 3.47 s |
| Unlocked Quality | n=25, median 33.4 ms, 20 >25 ms, max 316.6 ms | n=61, median 16.7 ms, 7 >25 ms, max 283.3 ms | 2.19 → 2.39 s |

After readiness, each sample has 133 intervals, p50/p99 16.7/16.8 ms and no interval >25 ms. Individual warm-up draws reached roughly 66–91 ms; a scheduler budget cannot split a single synchronous draw. The worst first-use interval also includes hero/driver work, so it is not attributed entirely to the warm-up. No further performance campaign or architecture change is justified within this batch.

## Final verification artifacts

- `local/evidence/w1/seams-final.json` — targeted Locked + Unlocked checks, including injected failures and renderer state comparison.
- `local/evidence/w1/flow-final.json` — required `scripts/verify-landing-flow.mjs`, 15 cases.
- `local/evidence/w1/build-final.log` — final production build; syntax/diff checks recorded in `static-final.log`.
- `local/evidence/w1/cleanup-final.json` — owned process/port cleanup.

Final machine results are reported by those artifacts and the worker handoff. No push, merge, main modification, dependency addition, composition/camera/material/texture change, or Hub feature expansion.

## NEEDS HUMAN VERIFICATION

1. Owner review of the first seconds of Landing motion: budget contention improves, but cold first-use stalls remain. Removing/hiding those stalls could require loading presentation or asset lifecycle decisions outside this batch.
2. Intel 8 GB pressure and pacing with the retained full-resolution hero, especially at device DPR2. This host supplies no Intel evidence.
3. Failed readiness deliberately leaves START RACE disabled with “Route unavailable”; reverse scroll and global controls remain available, and reload retries boot. An in-app retry/error-presentation feature needs owner UX scope. The targeted check uses readiness-state fixtures; underlying phase settlement reuses the existing Phase 3 recovery proof.

Actual OS background-tab throttling and Unlocked Smooth DPR1.5 were not separately replayed. Withheld-rAF fallback and both distinct rendering pipelines were exercised. Persistent WebGL loss or repeated recovery failures are not claimed recoverable by this bounded patch.
