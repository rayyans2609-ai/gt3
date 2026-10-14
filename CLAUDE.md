# GT3 — read first

## MANDATORY GT3 OPERATING PROTOCOL

**Foundational reading, all four mandatory, each authoritative in its own domain:**

| File | Domain |
|---|---|
| `SPEC.md` | product truth |
| `GT3_MASTER_CONTEXT.md` | orientation, current phase, source-of-truth hierarchy |
| `docs/ai/model-routing.md` | who does what work, at what cost, with how much review and verification |
| `docs/ai/autonomous-mode.md` | unattended runs, plus host limits for all heavy local work |

Routing and Autonomous Mode are **binding execution instructions**, not background references. Model routing is a core GT3 objective. Current explicit user instructions and current repository state take precedence over all four files (MASTER_CONTEXT hierarchy).

**At session start:** read all four before substantive work. Re-read the routing file instead of relying on memory or earlier prompts, because it changes.

**Before each substantive task, decide in one line:** its owner (model @ effort), and why that owner is the cheapest route to an accepted result (`model-routing.md` §2–§3, §10–§14). Then decide its verification depth and who executes it (§5). In Autonomous Mode these lines are the run plan (`autonomous-mode.md` §1). This is a decision, not a status report or an approval gate.

**Manager boundary.** Opus manages, integrates, decides, and owns at most 0–2 justified Anchor Tasks per phase (§11). A fast path is allowed when delegating would genuinely cost more. It is bounded (§9): the patch plus at most a quick static/build check. Browser harnesses, captures, repeated runs and mechanical follow-up go to the cheapest suitable worker.

**Deviations** from the doctrine (model choice, delegation, tools, verification) need a concrete task-specific reason, recorded in the ledger or the handoff. Habit and convenience are not reasons.

## Execution layers (link, don't duplicate)

- `docs/ai/codex-cli-invocation.md`: Codex (Sol, Terra, Luna, Astra). Always run through `scripts/codex-route.sh` with an explicit model **and** reasoning effort.
- `docs/ai/opencode-invocation.md`: free OpenCode routes (Muse, DeepSeek, Bunny). Always run through `scripts/opencode-route.sh` with an explicit model. Paid Token Harbor routes are refused.
- `docs/ai/cloud-opus-invocation.md`: Cloud Opus. Push the branch and confirm the exact SHA before any launch.
- `docs/ai/routing-evidence.md`: log material model work here (§15).

Never run a bare `codex exec` or `opencode run`, and never rely on a global or default model. Launch routed jobs from a dedicated worktree, not the main checkout.
