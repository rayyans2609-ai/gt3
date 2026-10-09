# GT3 — Routing Evidence

A running record of **material** model work. It feeds `model-routing.md` §15, which turns model reputation into GT3-specific evidence. This file is data, not doctrine: rows never change routing by themselves. A routing change is a deliberate edit to `model-routing.md`, made after repeated evidence.

**What gets a row:** every material Muse, DeepSeek and Bunny task (required), every Sonnet and Astra use (each must justify its scarcity), and other models where the row teaches something, such as Sol-as-execution-lead runs or a Terra/Muse comparison. Not every command, check or trivial dispatch.

**When:** at acceptance, escalation or abandonment of the task. Write the row from the worker's upward report, without re-deriving it. In Autonomous Mode, rows collect in the run ledger and are appended here with a checkpoint/handoff commit.

**Columns**
- **Date**
- **Task**: short description
- **Type**: implement / debug / UI / refactor / test / tooling / retrieval / review / liveness / lead
- **Model @ effort**: effort for Codex models; the actual level for Claude
- **Outcome**: accepted / partial / failed / abandoned
- **1st-pass accepted?**: Y/N
- **Escalated to**: — or the model
- **Rework (owner)**: — or what was redone and by whom
- **Verified/integrated by**
- **Notes**: route or quota impact, thinking-level verdict (under / ok / over), and for Bunny: accurate? missed context? actually reduced another worker's load?

| Date | Task | Type | Model @ effort | Outcome | 1st-pass | Escalated to | Rework (owner) | Verified by | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-06 | Phase 3 HUD refinements (consolidated identity, map arrow, completed-route trail, moon, single instruction system) + verify-hud expectations | UI | Muse Spark 1.3 (free) | accepted | Y | — | Opus: 6-line per-frame DOM-write cache on the trail (perf, not correctness) | Opus (diff review); browser verification pending in post-merge batch | ~6 min wall, 2 commits, honest about unverified items; first evidence for widening Muse scope (§11). |
| 2026-10-06 | Phase 3 F1 crossing SFX + F2 pre-ready input (diagnose, patch, new targeted harness) | implement | Opus @ high (session) | accepted | Y | — | — | Opus (harness verify-preready-input PASS) | Fast path justified for the ~40-line patch, but it **overreached**: Opus also iterated the new harness 4× in-browser and started an existing harness before handing to Luna (owner interrupted). Cause: §9 fast path's unbounded "verify" + no owner-before-execution rule; doctrine on Luna/§11 not applied. Corrected same day: §9 bounded fast path, autonomous-mode §1 owners in run plan, CLAUDE/AGENTS/MASTER_CONTEXT foundational reading. Thinking: ok. |
| 2026-10-06 | Phase 3 gate feedback / swap comparison / finish gantry | implement + test | gpt-6.1-sol @ high | accepted (engineering; owner visual review pending) | N | — | Sol: narrowed beam emission, actual lifecycle wait + lean checkpoint mode, capture sampling | Sol: build; default/pulse swap + checkpoint checks; finish/legacy probes | Direct execution; no children or escalation. ~65 min wall incl. shared-lock/preflight waits; host stops respected. Zero measured crossing compiles/uploads/buffer allocations. |
| 2026-10-06 | Phase 3 visual-design pass: 3 coupled camera/car/road candidates + curb tyre seating | lead | gpt-6.1-sol @ xhigh | accepted (engineering; owner visual pending) | Y | — | — | Opus merge; Luna smoke + r2 occlusion | ~2h05 direct; 0 route-script launches; no rationale given for not delegating. |
| 2026-10-06 | First verification batch (scroll/persistence) | test | gpt-6-luna @ high | partial | N | — | Opus: brief omitted GT3_URL; harness budget sized for legacy pace | Opus | Brief error, not a Luna error. |
| 2026-10-06 | Post-merge 10-command browser batch | test | gpt-6-luna @ high | accepted (as evidence) | Y | — | — | Opus | 61 min. 3 false regressions from a stale Vite server (BUILD_LOG trap); Luna reported faithfully. |
| 2026-10-07 | Re-run of 5 failed commands on a fresh server | test | gpt-6-luna @ high | accepted | Y | — | — | Opus | 26 min; isolated real HUD truncation vs harness/environment causes. |
| 2026-10-06 | Wheel-spin root cause (bounded debug) | debug | DeepSeek V4.1 Flash Free | abandoned | N | Sol @ medium | — | Opus stopped it | 82 min, zero output/edits (stalled route or loop). Route-health signal, not a capability verdict. |
| 2026-10-07 | Wheel-spin root cause, after escalation | debug | gpt-6.1-sol @ medium | accepted (diagnosis; fix correctly stopped by rule) | Y | — | — | Opus | ~15 min; said routing launchers were available but chose not to delegate (tightly coupled). Fix deferred: per-car pivot re-authoring. |
| 2026-10-07 | HUD spec-line truncation fix + harness | UI | Muse Spark 1.3 (free) | partial | N | — | Opus: 1-property CSS (`max-width: 100%`) after browser check | Luna re-check | ~3 min. Wrap fix right, but the inherited 34ch cap still clipped Audi. |
| 2026-10-07 | Review package draft (98 lines) | docs | Muse Spark 1.3 (free) | accepted | Y | — | Opus: one cross-ref fix + placeholders | Opus read-through | ~5 min; faithful to sources, no invented claims. Good fit for doc synthesis. |
| 2026-10-09 | WS1+2 shared track profile, proportions and authored line | lead | gpt-6.1-sol @ xhigh | partial (implementation checkpoint; runtime blocked) | N | — | Sol: removed yaw-clamp heading noise; eased/advanced linked curb approach after ten-car clearance failures | Sol: pure Node full-body/local-width checks, route/gate invariants and protected diff | Default/p1/p2 sampled clearance PASS at 0e5efe4 (.303/.401/.202 m minimum). Build, tyre seating, occlusion and browser perf UNVERIFIED: repeated host preflight failures, no heavy work launched. xhigh fit the coupled contract; parent token/cost data not exposed. Visual acceptance stays with owner. |
| 2026-10-09 | WS1+2 representative perf harness and baseline pilot | tooling + test | gpt-6-luna @ medium | partial | N | Sol @ xhigh | Sol: isolate app RAF/checkpoint/morph loop, fix controlled car/state and measurement metadata | Sol: syntax/diff review; two clean cherry-picks, runtime still blocked | Wrapper/child worktree followed; 7 min launch-to-parent-inspection, CLI reported 94,412 tokens, dollar cost not exposed. Host preflight correctly aborted baseline. Negative pilot verdict: no accepted measurement and parent semantic repair; effort adequacy remains uncertain. See job tmp p3c-pilot-report.md. |

| 2026-10-09 | WS3 Option A progression, grid/gantry/safety furniture and WS4a theme-selected swaps | lead + implement | gpt-6.1-sol @ high (observed launcher) | partial (committed implementation; heavy proof blocked) | N | — | Sol: exact-threshold save migration, finish re-arm boundary, unique terrain seeds and compact catch-fence panels | Sol: P1/P2 pure mapping/session checks, DOM-adapter finish lifecycle, unchanged-profile body clearance, syntax/protected diff | No children: coupled progress/grid geometry and residency seams, context already loaded; deterministic serial runtime batches prepared. Strict preflight exit75: idle18.13→17.48%, VM counters rose. Build/GL/perf/captures UNVERIFIED. Cost/token data not exposed; high fit, sufficiency still conditional on runtime. |
| 2026-10-09 | WS4b+c HUD legibility, centred prompt, reverse-cue retirement, legacy copy, HUD fit-harness diagnosis | implement + test | opencode/muse-spark-1.3-contributor-free | accepted (static); runtime queued | Y | — | — | Opus: diff/CSS review; node --check | Harness root cause found statically (sub-pixel scrollWidth on -webkit-box); no fit CSS changed. Second contained-UI Muse acceptance
| 2026-10-09 | WS4d degraded-readiness diagnosis | debug | tokenharbor/deepseek-v4.1-flash:free | failed (route stall) | N | Sol @ medium | — | — | 60-min cap hit, no output/report/commit; second identical stall on this route (also 82 min 2026-10-07). Classified provider/route, not capability
| 2026-10-09 | WS4d degraded-readiness diagnosis (escalated) | debug | gpt-6.1-sol @ medium | accepted (findings only) | Y | — | — | Opus: report review | Leading cause audio-timeout (15 s, armed pre-scene); no patch without owner console evidence; 110,425 tokens
| 2026-10-09 | Phase 3 closure review package draft | docs | opencode/muse-spark-1.3-contributor-free | accepted | Y | — | Opus: one line (gate/swap already chosen) | Opus: read against worker reports | Second accepted Muse package draft

## Emerging patterns

*(Fill this in once repeated rows support a claim, for example "Muse unusually reliable at contained CSS/UI", "DeepSeek effective on state-tracing bugs", "Bunny retrieval did / didn't cut first-pass failures". Cite the row dates. Leave empty until the evidence exists.)*
