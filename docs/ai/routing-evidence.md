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
| 2026-10-06 | Phase 3 gate feedback / swap comparison / finish gantry | implement + test | gpt-6.1-sol @ high | accepted (engineering; owner visual review pending) | N | — | Sol: narrowed beam emission, actual lifecycle wait + lean checkpoint mode, capture sampling | Sol: build; default/pulse swap + checkpoint checks; finish/legacy probes | Direct execution; no children or escalation. ~65 min wall incl. shared-lock/preflight waits; host stops respected. Zero measured crossing compiles/uploads/buffer allocations. |

## Emerging patterns

*(Fill this in once repeated rows support a claim, for example "Muse unusually reliable at contained CSS/UI", "DeepSeek effective on state-tracing bugs", "Bunny retrieval did / didn't cut first-pass failures". Cite the row dates. Leave empty until the evidence exists.)*
