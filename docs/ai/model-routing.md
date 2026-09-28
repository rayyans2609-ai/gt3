# GT3 — Model Routing (canonical)

This is the canonical, repo-portable source of truth for AI model routing on GT3. It survives new Claude sessions, different machines, Codex used directly, future agents/managers, and loss/reset of any single agent's private memory.

Unattended multi-hour execution (host limits, recovery, handoff) is governed by [`docs/ai/autonomous-mode.md`](./autonomous-mode.md); this file stays the routing authority for it.

Execution-specific detail (verified model slugs, reasoning-effort values, invocation syntax, config-default behavior) lives separately in [`docs/ai/codex-cli-invocation.md`](./codex-cli-invocation.md) — this file does not duplicate it.

**Status:** current evidence-based default, not permanent doctrine. Roles, tree and escalation rules change only when measured GT3 runs show better (§7). Agents must not rewrite them mid-run because they prefer something else; propose changes in the run handoff instead. The thinking-level table in §4 is explicitly an **experiment**.

---

## 1. Optimization target

Not "always cheapest." Total cost to accepted result:

```
inference cost + retry cost + manager attention + context consumption + coordination overhead + rework risk
```

Use the least expensive combination of models, reasoning, context, and coordination with a high probability of an accepted result. Escalate only when doing so is likely to cost less than continued retries, decomposition, context consumption, rework, or manager intervention.

## 2. Core principle

Route directly to the lowest-cost model reasonably likely to succeed. **Luna → Terra → Sol → Opus → Astra is not a mandatory escalation staircase.** An obviously complex task goes straight to the tier that can handle it. Never run a model expected to be underpowered "to try the cheap tier first."

## 3. Approved roles (current)

| Model | Role |
|---|---|
| **GPT-6 Luna** | mechanical economy |
| **GPT-5.6 Terra** | straightforward implementation economy — kept intentionally, because the GPT-6 line has no Terra-equivalent tier |
| **GPT-6 Sol** | primary serious engineering worker |
| **Claude Sonnet** | alternate implementation / investigation / critique worker |
| **Claude Opus** | primary manager / architect / integrator |
| **GPT-6 Astra** | terminal recovery / orchestration-failure / tightly-coupled end-to-end model |

Remember: **Terra is not a mandatory stop before Sol** — Sol at high/xhigh handles hard bounded engineering directly. **Astra is not "harder Sol"** — it's for when orchestration/global problem resolution itself is the bottleneck, or integrated end-to-end ownership is more efficient than further fragmentation. Direct routing to any tier is allowed.

### GPT-6 Luna — mechanical economy
Renames, formatting, simple file edits, boilerplate, repetitive transformations, obvious CSS tweaks, simple extraction/classification, deterministic housekeeping. Small scope, explicit instructions, known files, clear acceptance criteria. **Not for:** ambiguous features, architecture, difficult debugging, significant UI judgment, complex state, 3D logic, broad repo reasoning.

**Luna is the explicit home for clerical/mechanical work:** known harnesses, browser/DOM checks, screenshots and captures, log reading, repetitive verification. Opus and Sol should not burn context on work Luna can own — if a task is deterministic or mechanical, hand it to a Luna worker. (Not a reason to spawn Luna for trivia that a single command answers.)

### GPT-5.6 Terra — straightforward implementation economy
Use for ordinary engineering where requirements are clear, scope is bounded, architecture is already understood, and deep reasoning is unlikely to materially change the result: straightforward component/UI implementation, ordinary CSS/layout, asset integration, simple refactors, utility logic, basic debugging, straightforward tests, wiring between established systems. **Skip Terra, go straight to Sol** when rework risk is obviously high: difficult debugging, substantial ambiguity, complex state interactions, Three.js/sophisticated 3D behavior, architectural uncertainty, concurrency/races, performance investigation, non-obvious cross-system interaction.

### GPT-6 Sol — primary serious engineering worker
Default reasoning: meaningful feature work, moderately complex implementation, serious UI work, nontrivial refactors, normal debugging, repo exploration needed for implementation, logic spanning multiple files, integration work, tests requiring reasoning. Deeper reasoning (see §4) when the task is still a bounded engineering problem but needs it: difficult Three.js/3D implementation, camera systems, rendering/lifecycle problems, difficult state sync, race conditions, subtle bugs, performance analysis, architecture inside a bounded subsystem, complex integration failures, or a problem that already defeated a competent lower-effort Sol attempt. **Reasoning escalation and model escalation are different decisions** — prefer Sol at higher reasoning while the problem is still fundamentally a hard engineering problem; don't jump to Astra just because implementation is difficult.

### Claude Sonnet — alternate execution worker
Bounded implementation, repo exploration, code review, investigation, debugging, bounded planning, independent critique, alternate-model perspective. Don't use Sonnet merely to duplicate a task already assigned to Sol — cross-model duplication needs an explicit reason (independent verification, competing hypotheses, critique, recovery, model comparison). Choose between Terra/Sol/Sonnet on expected success for the specific task, not provider loyalty. Sonnet at low/medium is also the routine **watchdog** worker (progress/health checks) in Autonomous Mode, and the Claude-only fallback implementer when Codex is unavailable.

### Claude Opus — primary manager/architect/integrator
Broad repo-state understanding, interpreting product intent, planning, decomposition, routing, cross-system architecture, dependency management, synthesis, reconciling worker outputs, integration strategy, resolving contradictions, deciding what evidence is required, reviewing consequential work, acceptance, recognizing when the current strategy is failing. Should generally not spend its own context on bulk edits, mechanical changes, routine coding, formatting, simple refactors, repeated test runs, or clerical inspection another worker can own. Delegate because it saves manager attention, not for its own sake — for small tasks the fastest path is often just classify → execute → verify → finish, done directly.

### GPT-6 Astra — terminal recovery / orchestration-failure tier
Not a routine difficult-code escalation, not an automatic second opinion, not a default because a task "feels important." Valid triggers:

1. The manager can't form a sufficiently reliable plan.
2. The manager's decomposition keeps being wrong, and that's the cause of failure.
3. Multiple competent attempts fail for materially different reasons.
4. Root cause crosses several tightly-coupled systems and can't be isolated cleanly.
5. Worker outputs/evidence conflict and the manager can't resolve the contradiction confidently.
6. The problem needs unusually broad synthesis across repo state + history + architecture + runtime evidence + tooling + implementation + verification.
7. Coordination overhead has become more expensive than giving one strong agent end-to-end ownership.
8. Decomposition itself would lose too much information.
9. Continuing fragmented retries is likely to cost more than integrated Astra ownership.
10. An exceptionally consequential task genuinely benefits from one model owning investigate → plan → implement → verify.

**In Autonomous Mode Astra has a second, standing role: the absent-user supervisory layer** — independent senior review, scope/direction sanity, evidence challenge, and final acceptance sanity, on the cadence in `autonomous-mode.md` §3. That is a review function, not a licence to use Astra for clerical, browser or repetitive work, and it does not make Astra the primary manager. If the active run manager assigns Astra a bounded recovery task under the triggers above (implementation included), the manager still holds dispatch, scope and host authority. Supervisory advice never expands what the user authorized. Outside Autonomous Mode the triggers above still govern.

Astra may temporarily be manager + investigator + planner + implementer + integrator for that bounded problem. When invoked because orchestration itself failed, don't constrain it to the same failed decomposition — hand it objective, current repo state, history, attempted approaches, exact failures, runtime evidence, measurements, constraints, eliminated hypotheses, acceptance criteria, and let it reframe if needed. After resolution, route normal execution back down to the appropriate cheaper tier. If Astra itself fails, don't blindly rerun it — first identify whether the blocker is missing evidence, an environment/tool limitation, architecture, ambiguous product intent, a missing requirement, human judgment, or genuine unresolved technical uncertainty, and acquire new information before spending another expensive run.

## 4. Reasoning-effort policy (separate from model selection)

Model choice and reasoning-effort choice are two independent decisions. Do not automatically maximize reasoning merely because a stronger model was selected.

| Model | Normal policy |
|---|---|
| **Luna** | `low`/`medium` as appropriate to the task |
| **Terra** | `medium` normally; higher only when the task is still clearly Terra-class (bounded, understood) but benefits from extra care |
| **Sol** | `medium` default for substantial engineering; `high`/`xhigh` when bounded work genuinely needs deeper reasoning; `max`/`ultra` only exceptionally and deliberately |
| **Astra** | explicit reasoning selection is **required** — never rely on Astra's low default; choose effort based on the actual task. Outside Autonomous Mode, Astra *usage itself* remains exceptional regardless of the effort chosen |

### Autonomous Mode preferred levels — EXPERIMENT

Inside Autonomous Mode, prefer these levels instead of the normal table above. This is a measured experiment, not doctrine (see `autonomous-mode.md` §13 for the 2–3-run findings requirement).

| Model | Preferred levels |
|---|---|
| **Luna** | `high` for lighter mechanical work; usually `xhigh`/`max`. `max` is fine for dense clerical/browser/harness/evidence work where omissions cause rework |
| **Terra** | `medium`/`high`/`xhigh` for normal bounded engineering; `max` only when Terra must coordinate many Luna agents or has unusually broad execution scope |
| **Sol** | `medium`/`high` routine serious engineering; `xhigh` difficult implementation/debug/integration; `max`/`ultra` when coordinating many sub-agents, acting as continuity manager (§8), or doing higher-level integration/decision work |
| **Astra** | `high` default for substantive supervisory reviews; `medium` for light milestone checks; `xhigh` only for unusually hard contradictions, recovery, or high-consequence architectural judgment |
| **Opus** | `high` default as primary manager; `xhigh` when parallelism, context or coordination load rises; `max` only for genuinely intricate, high-stakes multi-constraint problems |
| **Sonnet** | `low` progress/process/health checks; `medium` watchdog needing code/log/evidence interpretation; `high`/`xhigh` for demanding coding/debug/review |

`ultra` is only valid where the verified Codex catalog lists it (`gpt-6-sol`, `gpt-6-astra`, `gpt-5.6-sol`; see `codex-cli-invocation.md`) — for Terra use `max`. `scripts/codex-route.sh` accepts `ultra` for any model, so the catalog, not the script, is the check.

Claude-side levels (Opus, Sonnet) cannot be set per call on an ad-hoc subagent. A subagent inherits the session's level unless it uses an agent definition (`.claude/agents/*.md` frontmatter), and GT3 has none yet. Until one exists, a "Sonnet `low` watchdog" may actually run at the inherited level. Record the **actual** level in Thinking-Level Findings, not the intended one.

Governing rule: the lowest level likely to perform the role reliably; raise it when coordination complexity, agent spawning, context burden or rework risk justifies it.

Every routed Codex job must pass reasoning effort explicitly (see `docs/ai/codex-cli-invocation.md` §"Default-fallback protection") — never rely on whatever the global Codex config happens to default to.

## 5. Task classification

Before routing, identify the dominant bottleneck: mechanical execution, straightforward implementation, difficult implementation, investigation/debugging, planning/decomposition, architecture, integration, synthesis, critique, verification, acceptance, or end-to-end recovery. Task size ≠ model cost automatically — a large project may decompose into cheap independent work; a small but deeply ambiguous issue may need high reasoning. Route by the nature of the bottleneck, not raw size.

## 6. Operating rules

**Failure diagnosis before retry.** Never blindly repeat a failed attempt. Classify why it failed — wrong model, insufficient reasoning effort, missing context, missing evidence, incorrect assumption, poor decomposition, ambiguous requirement, implementation mistake, architecture misunderstanding, verification failure, tooling/environment problem, or a genuine capability limit — then change that variable. Same model + same prompt + same context + no new evidence is not a legitimate retry.

**Escalation must be evidence-based.** Bad: "this seems hard." Good: "Terra attempted X, runtime evidence showed Y, Sol medium tested hypothesis Z and disproved it, the remaining failure spans systems A/B/C and now needs broader synthesis." When escalating, compress prior findings into useful evidence — don't dump full transcripts, and don't make the stronger model rediscover what's already known.

**Context economy.** Workers get the minimum sufficient context to own their task safely: goal, relevant files, constraints, local architecture, dependencies, acceptance criteria, known findings. Exclude unrelated history, giant transcripts, irrelevant files, duplicated background. Managers may use broader context because synthesis is their job.

**Decomposition economics.** Parallelize only when ownership stays clean: genuinely independent tasks, clear file ownership, minimal dependencies, independently verifiable outputs, cheap merging. Stop decomposing and consolidate under Sol/Opus/(exceptionally) Astra when workers need constant shared state, decisions depend heavily on each other, manager coordination gets expensive, context must be repeated constantly, reasoning fragments, or merge/integration risk dominates.

**No duplicated speculative work.** Once a worker owns a bounded task, don't independently redo it while waiting. Parallel duplication needs an explicit reason: independent review, competing hypotheses, benchmark/model comparison, verification, recovery.

**Implementation ≠ acceptance.** Worker completion ≠ accepted work. Use implement → verify → accept, with the cheapest reliable evidence available, in this order: deterministic checks → unit/integration tests → type/static/build checks → targeted runtime checks → browser interaction → performance measurement → model review where judgment is genuinely needed → human judgment for subjective experience. Don't spend Opus or Astra proving something a deterministic test already proves.

**Risk-based review.** Don't automatically spend another expensive model reviewing every change. Independent review earns its cost when blast radius is large, architecture changes, security/reliability matters, behavior resists deterministic testing, worker uncertainty is high, the subsystem has a regression history, or the change spans multiple critical systems. Small deterministic changes can be accepted from tests + inspection alone.

**Cross-model review — use sparingly.** Diversity beats raw escalation only sometimes: Sol implementation → Sonnet critique, Opus plan → Sol investigation, Sonnet investigation → Opus synthesis — only where a different reasoning perspective adds real value. Don't turn every task into a committee.

**Fast path.** For obvious tasks: classify → execute → verify → finish. No planning document, delegation graph, critique round, manager ceremony, or multi-model discussion when it adds no value.

**Human judgment.** Escalate to the user — never to a bigger model — when a decision materially changes product intent, visual direction, subjective feel, feature scope, meaningful UX behavior, or a major architecture tradeoff with product consequences. Don't ask the user to decide routine, reversible engineering details.

## 7. Routing learns from GT3

This table is a strong prior, not permanent truth (see Status above). Where practical, keep evidence per meaningful task: class, model, reasoning effort, result, retries, approximate cost, manager intervention, verification/acceptance result. Use repeated real evidence to refine routing. Don't rewrite the rules over one anecdotal success or failure.

## 8. Delegation direction

Who may hand work to whom. This governs *who spawns*; §2–§3 govern *which model fits*. Not a capability ranking.

- **The primary manager (Opus) may invoke any appropriate worker, including Astra.** That is *manager-directed specialist escalation*, not a subordinate promoting itself.
- **Ordinary delegation goes downward only:** Astra (when invoked for a §3 trigger) → any lower worker; Sol → Terra / Sonnet / Luna; Terra → Sonnet / Luna; Sonnet → Luna; Luna delegates to no one.
- **Ordinary workers never escalate upward.** A worker that hits work above its lane, or a model/tool limit, checkpoints and reports to the manager (done, evidence, what blocks it). The manager decides reassignment or escalation per §6.
- **Opus worker instances are workers, not the manager.** When Claude-side Sol-level execution is needed, prefer a bounded Opus worker/subagent so the primary manager's context stays separate from implementation. A worker instance has bounded scope, no manager authority, and reports upward like any worker.
- **Astra's supervisory exception (Autonomous Mode).** Astra supervises the manager rather than working for it. Even so, it may run bounded review/investigation through Opus worker instances, Sonnet, Sol, Terra or Luna, which report to Astra. These workers are **read-only by default**: no tracked-file edits, commits, or heavy local jobs unless the manager schedules them. That way they never compete with the manager's owned work or its host budget. They count toward that budget, follow process-safety rules, and take no manager authority. Neither Astra nor they become the primary manager.
- Sub-agents share the local-machine budget with top-level jobs (`autonomous-mode.md` §6); delegation is never a way around it.

### Manager continuity (Opus → Sol)

The primary manager is Opus while available. If Opus nears quota/tool exhaustion (not context pressure, which compaction handles) and meaningful in-scope work remains, **Sol may become temporary continuity manager** on the Codex side, at `high`/`xhigh` minimum, or `max`/`ultra` per §4 when the coordination load is heavy. This is failover, not normal architecture: Sol holds temporary management authority for the run; Opus regains it on return; Astra supervises more closely meanwhile. The procedure (continuation packet, Astra cadence, handback) is in `autonomous-mode.md` §4.

## 9. Compact routing tree

```
TASK
├─ Deterministic tooling can solve it?              → deterministic tooling
├─ Mechanical / obvious / repetitive / low-risk?     → GPT-6 Luna
├─ Straightforward bounded implementation?           → GPT-5.6 Terra
├─ Substantial implementation / meaningful eng.?      → GPT-6 Sol (medium)
├─ Very difficult but still bounded engineering?      → GPT-6 Sol (high/xhigh)
├─ Claude-side execution or valuable alt. perspective?→ Claude Sonnet
├─ Project-wide planning/decomposition/architecture/
│  synthesis/integration/acceptance?                  → Claude Opus
└─ Orchestration itself failing, or problem is
   inherently tightly-coupled end-to-end?             → GPT-6 Astra
```

**Governing rule:** use the least expensive combination of models, reasoning, context, and coordination with a high probability of an accepted result; escalate intelligence only when doing so is likely to cost less than continued retries, decomposition, context consumption, rework, or manager intervention.
