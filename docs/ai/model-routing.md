# GT3 — Model Routing (canonical)

This is the canonical, repo-portable source of truth for AI model routing, delegation, context, review and quota on GT3. It survives new Claude sessions, different machines, Codex used directly, future agents/managers, and loss/reset of any single agent's private memory.

Unattended multi-hour execution is governed by [`autonomous-mode.md`](./autonomous-mode.md). It **extends** this file for unattended operation and never replaces it: same routing philosophy, plus host, continuity, supervision and handoff rules.

Execution-specific detail lives separately, and this file does not duplicate it:

- [`codex-cli-invocation.md`](./codex-cli-invocation.md): Codex models (Luna, Terra, Sol, Astra), verified slugs, reasoning-effort values, invocation. Route through `scripts/codex-route.sh`.
- [`opencode-invocation.md`](./opencode-invocation.md): OpenCode free routes (Muse, DeepSeek, Bunny, MiMo), exact model IDs, credential isolation, route health. Route through `scripts/opencode-route.sh`.
- [`routing-evidence.md`](./routing-evidence.md): the running record of material model work that §15 learns from.

**Two layers.** Part I is general principle, written to transfer beyond GT3. Part II is the current GT3 model map, which is evidence-based and revisable. When a model name changes, Part II changes; Part I should not need to.

**Status:** current evidence-based default, not permanent doctrine. Roles change only when measured GT3 work shows better (§15). Agents must not rewrite this mid-run because they prefer something else; propose changes in the handoff instead. Last revised 2026-10-05: efficiency-doctrine migration (scarcity-adjusted routing, net-leverage delegation, least-privilege context, risk-based review, Sol as execution lead, Muse/DeepSeek/Bunny lanes).

---

# Part I — Principles

## 1. Optimization target

**Maximum reliable accepted work per unit of scarce intelligence, context, compute, quota and management overhead.** Optimize **cost-to-acceptance**, not cost-per-call:

```
inference + retries + rework + manager attention + context consumed + briefing/coordination/integration + review
```

The target is not maximum AI usage, delegation, parallelism, review, use of the strongest model, or token consumption before a reset. **Efficiency includes deliberately doing less.** A free worker that causes repeated retries, manager attention and expensive repair is not free. A model's token appetite is part of its cost, not just its price per token.

## 2. Routing rule

**Use the lowest-scarcity resource that is likely to reach acceptance without disproportionate rework.** This is more precise than "the cheapest capable model". It weighs: task/model fit, uncertainty, consequence, blast radius, reversibility, scarcity and quota pressure, context required, expected first-pass success and rework, delegation/integration/review overhead, whether deterministic verification exists, and whether some worker is already context-loaded on the problem.

- **Intelligence flows toward uncertainty and consequence, not workload.** A huge deterministic task may belong to a free or mechanical worker. A tiny change with unclear architectural consequences may deserve Sol or Opus.
- **Capability ranking ≠ routing ranking.** A somewhat weaker worker on a less scarce resource can be the right route (§10).
- **Direct routing, no staircase.** An obviously hard task goes straight to the lane that can handle it. Never run a model expected to be underpowered just "to try the cheap tier first".
- **Cheap-first is not cheap-forever.** Once a lane's capability boundary is shown, escalate (§6) instead of looping.
- Model choice and reasoning-effort choice are separate decisions (§12). Never maximize thinking just because a higher setting exists.

## 3. Delegation is leverage, not ritual

**Do not delegate for delegation's sake.** Every handoff carries a tax: briefing, context transfer, worker startup, coordination, waiting, integration, verification, and possible rework.

```
delegation value = parent work avoided − briefing − coordination − integration − expected rework
```

Delegate only when that is meaningfully positive. In practice that means the subtask is separable, big enough to justify a handoff, briefable in a compact packet, actually avoids the parent repeating the reasoning, likely to succeed without heavy supervision, and either preserves scarce capacity or enables useful parallelism. Otherwise the current owner keeps it.

- **Prefer the shallowest tree that creates real leverage.** Opus → Sol → Muse is sometimes right. So are Opus → Sol, Opus doing its own Anchor Task (§11), and Sol finishing a tightly coupled supporting change itself. The model hierarchy is not mandatory bureaucracy.
- **Silent ownership.** Once a worker cleanly owns a task, it owns it until complete, blocked, materially off course, or resource-constrained. The parent does not poll, reread the same files, re-solve the task, or reason in parallel unless an event justifies it. Deliberate duplication needs a stated reason: competing hypotheses, verification, model comparison, or recovery.
- **Batch low-value work.** Several mechanical checks go in one Luna batch, and several bounded inspections go in one packet. Don't batch tasks that need different context or ownership.

## 4. Least-privilege context

Every delegator sends **the minimum sufficient context plus a small safety margin**, not everything it knows. This applies recursively. Each parent tailors its own child's packet, and a child brief is never the parent brief pasted downward. Context narrows as work moves down.

| Hop | Packet |
|---|---|
| Manager → execution lead (Opus → Sol) | phase objective, relevant architecture, key dependencies, constraints, boundaries, acceptance conditions, only the history that materially matters |
| Lead → bounded worker (Sol → Muse / Terra / DeepSeek) | exact bounded objective, relevant files/interfaces, local constraints, dependencies, expected evidence, explicit exclusions |
| Any → mechanical worker (→ Luna) | exact procedure/check, expected observable result, output format; little or no strategy |

**Carry intent downward; shed irrelevant context downward. Carry evidence upward; shed execution noise upward.** Downward runs strategy → bounded objective → procedure. Upward runs raw execution → evidence/result → managerial implication. Less context often improves quality as well as cost, because it reduces distraction, scope creep and anchoring on stale history.

**Preserve premium-model freshness.** Opus and Sol receive concise packets (objective, material state, relevant evidence, changes made, unresolved contradiction, decision required) and do their own reasoning. They never get worker transcripts to clean up, and they never inherit a support worker's interpretation of a hard problem. Support workers *retrieve facts* for premium models. They do not *conclude* for them. Raw artifacts stay available for anomalies and disputes. Opus rarely needs raw Luna logs, and Luna rarely needs GT3 philosophy.

## 5. Acceptance, review and verification

**Acceptance ladder:** self-evidence → deterministic verification → parent acceptance → independent review *only when warranted*. Most work stops within the first three rungs. Worker completion ≠ acceptance, and acceptance does not imply cross-model review.

**Review is risk-based, not ceremonial.** A finished worker does not automatically create a review task. Before requesting one, name **the specific uncertainty, failure mode or risk it will reduce**. If you can't name it, skip the review. Intensity scales with blast radius, uncertainty, consequence, irreversibility, evidence quality and integration risk. Examples: a tiny bounded change with convincing deterministic evidence gets no model review. An important global-state change may warrant Sol. A major architecture change may warrant Opus. An unusually consequential or uncertain situation may warrant Astra. No ceremonial worker → reviewer → senior reviewer chains.

**Verification depth matches risk.** The ladder is not a mandatory sequence. **Stop climbing as soon as evidence is sufficient.** Static inspection may be enough. If runtime behavior matters, run a targeted runtime check. If browser behavior matters, do browser verification. If visuals matter, take captures. If timing matters, measure it. Don't under-verify high-risk work, and don't over-verify low-risk work. Builds belong at meaningful checkpoints.

**Reuse valid evidence; don't prove the same thing twice.** Higher authority consumes lower-level evidence instead of re-running it. Sol uses Terra's convincing evidence, and Opus uses Sol's. Re-open only when evidence is insufficient, conflicting or stale, when integration changed the tested state, or when blast radius demands more proof.

Worker-reported numbers are claims. Performance gains count only under comparable, manager-owned measurement, and visually consequential optimizations still need human/product review (§9).

## 6. Escalation and failure

**Diagnose before retrying.** Classify the failure: wrong model, insufficient reasoning, missing context or evidence, wrong assumption, poor decomposition, ambiguous requirement, implementation mistake, architecture misunderstanding, verification failure, tooling/provider problem, or genuine capability limit. Then change that variable. Same model + same prompt + same context + no new evidence is not a legitimate retry.

**Explicit lane boundaries.** A worker that has crossed its lane stops and reports instead of burning tokens pretending. Examples: Muse finds architecture-level ambiguity. DeepSeek makes one serious debugging attempt but can't reproduce or resolve the issue. Terra finds that a "bounded" change spans global systems. Sol hits product-intent ambiguity or a project-wide architecture tradeoff. The pattern is **checkpoint → preserve useful work → escalate**, never heroic persistence or retry loops.

**Escalation is evidence-based.** Bad: "this seems hard." Good: "Muse attempted X, runtime showed Y, Sol tested hypothesis Z and disproved it, and the remaining failure spans A/B/C." Compress prior findings so the stronger model doesn't rediscover them. Workers report upward. Only a parent reassigns or escalates (§13).

## 7. Parallelism must be earned

Available concurrency is not a throughput target. Parallelize only genuinely independent work: clean file ownership, minimal shared state, independently verifiable outputs, cheap merging, coordination cost below the time saved, and host capacity to spare (`autonomous-mode.md` §6 applies to all heavy GT3 work). Consolidate under one owner when workers need constant shared state, their decisions interlock, context must be repeated, or integration risk dominates.

## 8. Deterministic tooling and persistent knowledge

**Deterministic systems compete with AI.** When a check recurs (route existence, DOM states, asset naming, build integrity, audio mappings, timing, known regressions, process cleanup, state invariants), move it into a script once repetition justifies it. The long-term edge is strong models working on top of increasingly capable deterministic infrastructure, not more agents. Don't automate one-off work.

**Persist facts, not frozen reasoning.** Record stable subsystem knowledge so it isn't rediscovered: ownership, key files, stable interfaces, verified constraints, measurements, costly past failures (`ARCHITECTURE.md`, `BUILD_LOG.md`, `SPEC.md` §27). Don't treat past model conclusions as unquestionable. Load enough doctrine at the start. Reread exact sources only when wording matters, state may have changed, evidence conflicts, or a consequential decision needs exact truth.

## 9. Human judgment and stopping

Escalate to the user, never to a bigger model, when a decision materially changes product intent, visual direction, subjective feel, feature scope, meaningful UX behavior, or a major architecture tradeoff with product consequences. Models gather evidence, narrow options, prepare comparisons and build reversible experiments. They cannot make subjective uncertainty disappear by reviewing each other. Mark genuine items **NEEDS HUMAN VERIFICATION**. Don't create human-review items that a deterministic check can answer, and don't ask the user about routine, reversible engineering details.

**Fast path:** for obvious tasks, classify → execute → verify → finish. **Stop** when the goal is achieved and acceptance is sufficient. Do not invent cleanup, manufacture review, give Opus a task because it is available, spawn workers to keep them busy, invoke Astra because it hasn't been used lately, rerun valid evidence, or keep optimizing past useful marginal value.

---

# Part II — Current GT3 model map

## 10. Scarcity and quota

**Claude is the scarcest resource.** Claude-side worker usage (Sonnet, Opus worker instances) competes directly with the Opus manager's ability to keep operating, so every Sonnet task carries an opportunity cost against future Opus capacity. Terra or a free worker can rationally beat Sonnet even where Sonnet is somewhat stronger in isolation. That prices Sonnet correctly without banning it. **Codex** is metered but normally available. Use Sol and Terra normally when they fit. Astra is the exception (§11). **Free OpenCode routes** (Muse, DeepSeek, Bunny) are **normal capacity, not emergency fallback**. Using them well reduces premium burn before conservation is ever needed. Don't choose a weaker worker merely to save quota when rework would cost more.

**Free-route health.** The preference holds only while the exact route is healthy, available and genuinely free. A provider/route failure is not a capability failure: re-check the live catalog (`opencode-invocation.md`), don't loop on a broken route, and fall through per §14. Never silently substitute a paid sibling, and never spend or top up without explicit user approval.

**Quota trajectory, not raw percentage.** Route on remaining capacity, time to reset, observed burn rate, expected remaining work, and the reserve needed. If the burn would exhaust a resource well before its reset while useful work remains, shift mode now, not at the hard limit. Check at natural boundaries or when usage information surfaces on its own. Never poll quota or invent usage data you can't see.

| Mode | Behavior |
|---|---|
| **Normal** | Opus manages; Opus Anchor Tasks and specialist Sonnet use allowed when justified; Astra selective |
| **Conservation** (Claude trajectory unsafe) | protect Opus; minimize Claude-worker use; execution shifts to Muse / DeepSeek / Terra / Sol / Luna; Astra even more selective; no optional broad Claude work |
| **Critical reserve** | Claude only for manager actions that genuinely need Opus; Sol carries more technical continuity; no optional Claude work; checkpoint Claude-side state cleanly; keep recovery/integration capacity |

**Keep a reserve.** Never plan to consume 100 % of frontier quota. Hold some back for integration problems, recovery, blockers, final managerial decisions and continuation/handoff. The reserve is a judgment call, not a fixed percentage, until evidence supports thresholds. Session-level economics the user states (for example a short Claude-heavy window before a reset) are session overrides and are never written into canonical docs.

## 11. Roles (current)

| Model | Role |
|---|---|
| **Claude Opus** | primary manager + intelligence apex; 0–2 Anchor Tasks per phase when justified |
| **GPT-6.1 Sol** | main heavyweight engineering worker; execution lead for substantial batches |
| **Muse Spark 1.3** (free, OpenCode) | major free general-purpose worker for bounded implementation |
| **GPT-5.6 Terra** | reliable bounded paid worker |
| **GPT-6 Luna** | mechanical / deterministic execution |
| **DeepSeek V4.1 Flash Free** (OpenCode) | free debugging specialist + reserve |
| **Space Bunny** (free, OpenCode) | experimental support/scouting: fact retrieval and evidence gathering; on probation |
| **Claude Sonnet** | specialist exception; needs a positive task-specific reason |
| **GPT-6 Astra** | rare, event-triggered senior independent escalation |

Not in the active tree: **MiMo V2.6 Flash Free** is experimental only, used on explicit experiment or user request. **Laguna S / XS** have no lane, and their benchmark results are historical evidence only.

### Claude Opus — primary manager + intelligence apex
Decomposition, routing, broad project synthesis, integration judgment, resolving contradictions, architecture and product-engineering tradeoffs, scope protection, acceptance, difficult recovery, decisions needing broad GT3 context, quota/resource decisions, managerial continuity. Protect its context and quota, and give it concise evidence, not transcripts (§4).

**Don't turn the strongest model into a dispatcher.** In a meaningful phase Opus may own **0–2 Anchor Tasks**, chosen by **breadth × ambiguity × consequence**, not implementation size. Examples: difficult cross-system architecture, highly ambiguous root cause, consequential integration, hard product/engineering tradeoffs, recovery from a badly failing phase, or demanding work where Opus has a real comparative advantage. If nothing deserves Opus-level execution, Opus executes nothing. Never invent work for it. Opus does an Anchor Task itself, or in a bounded Opus worker instance when separating its context from management is worth the extra Claude cost. Outside Anchor Tasks, Opus does not spend context on routine coding, bulk edits or clerical inspection that another lane can own. For small obvious tasks the fast path (§9) done directly is often cheapest.

### GPT-6.1 Sol — heavyweight engineering + execution lead
Difficult implementation and debugging, complex integration, camera/3D/math, rendering and performance-sensitive work, state/lifecycle/race conditions, technically uncertain engineering, and major technical decisions below the project-wide layer. Sol should solve the overwhelming majority of hard GT3 engineering without Astra. A hard bounded problem gets Sol at higher reasoning, not a stronger model (§12).

For substantial engineering batches Sol may act as **execution lead** under Opus (User → Opus → Sol → bounded workers). It delegates bounded subproblems by preference to: Muse (capable free generalist work), Luna (mechanical), Terra (stronger bounded reliability), DeepSeek (debugging/root-cause subproblems), Bunny (fact retrieval for a child's packet). **Sol is not required to spawn anything.** If it already holds the context and can finish a coupled subtask more cheaply than briefing and integrating a child, it does it. Sol is a lead when useful, not a mandatory middle-management layer. *Sol-as-lead is new on GT3: its first runs are tracked in `routing-evidence.md` before the pattern is trusted further.*

Benchmark nuance: an early Sol performance run self-reported ~84 % improvement, but the manager-owned grader measured ~59 % under the same conditions. Sol still clearly beat the free alternatives. The lesson is to verify performance claims, not to distrust Sol.

### Muse Spark 1.3 — major free general-purpose worker
A genuine high-volume execution resource, not a free helper for ceremonial tasks. It handles small/medium bounded implementation, contained UI work (component/CSS), isolated features, straightforward refactors, utilities, tests, bounded bug fixes (including audio and UI state), asset integration, code/docs synchronization, semi-mechanical repo work, and checks that need modest reasoning beyond Luna. It overlaps Luna where a mechanical-looking task needs some interpretation. In the benchmark it was the strongest free bounded worker, with small relevant patches and good self-verification. **Not for** open-ended or frontier systems work (send that to Sol), and it escalates on architecture ambiguity (§6). Material Muse tasks are always tracked.

### GPT-5.6 Terra — reliable bounded paid worker
Clear-contract implementation, tooling, deterministic changes, tests, straightforward engineering, bounded decisions, targeted checks. It fits where Muse would be meaningfully riskier but Sol is unnecessary, where the free routes are unhealthy, or where a native, low-latency Codex path is operationally better. **Prefer Terra over Sonnet** for ordinary paid bounded work because of Claude scarcity (§10). Don't use Terra where Muse or Luna would reach the same accepted result for materially less.

### GPT-6 Luna — mechanical / deterministic execution
Known harnesses, browser and DOM checks, screenshots/captures, log extraction, file/command repetition, routine evidence collection, mechanical verification, renames, boilerplate, deterministic housekeeping, mechanical liveness checks. Small scope, explicit procedure, clear expected output. Luna is the default for clerical work, but not an absolute rule: when a "mechanical" task needs modest interpretation, Muse may be the better buy. Don't spawn Luna for trivia a single command answers. **Not for** ambiguous features, architecture, hard debugging, UI judgment, complex state or 3D.

### DeepSeek V4.1 Flash Free — free debugging specialist + reserve
When the central question is **"why is this broken?"**, consider DeepSeek first. Its work includes failure reproduction, stack traces, state tracing, working-vs-broken comparisons, root-cause hypotheses, targeted debugging, minimal-fix investigation, and challenging another worker's diagnosis. It is also the free reserve when Muse's route is down. In the benchmark it accepted on bounded debugging and (with a fix) bounded implementation. On an open-ended performance task it timed out, missed the target and regressed normal driving with a broad, noisy diff. **Escalate to Sol** once debugging turns architecture-heavy, deeply interconnected, highly consequential, or fails after one serious attempt. Never loop. Always use the exact `:free` route. Material DeepSeek tasks are always tracked.

### Space Bunny — experimental support/scouting (on probation)
Bunny has **not yet earned a permanent architectural role**. In the benchmark it read and critiqued well but completed poorly as primary implementer, so it is never the primary patch owner.

- **With lower-tier workers (Luna / Muse / Terra):** repo investigation, factual search, locating files, dependency/state tracing, evidence gathering, bounded preliminary analysis, context preparation. Use it especially when the child's task would otherwise be riskier. The parent may run Bunny to assemble the child's packet.
- **With Sol / Opus:** retrieval only. Bunny supplies code locations, diffs, references, history, measurements, implementation facts and repo state, and the premium model does the reasoning. Never let Bunny solve, compress a conclusion, and have Sol/Opus rubber-stamp it.

Track every material Bunny use (`routing-evidence.md`): usefulness, factual accuracy, missed context, whether it lightened another worker's load or improved first-pass acceptance, or merely added a model to the chain. A stronger niche comes only from that evidence.

### Claude Sonnet — specialist exception
Available and worth using when a task is **extremely well suited to Sonnet** and that advantage justifies its Claude scarcity cost (§10). Sonnet is not default implementation capacity, not where medium work goes for being medium, not a routine reviewer, and not a watchdog. Each use needs a positive, task-specific reason to beat Muse/Terra/Sol routing. Its GT3 niches are to be identified empirically (`routing-evidence.md`). Sonnet is not a stop between the bounded lanes and Sol. Clearly serious engineering goes straight to Sol. When Codex is unavailable, Sonnet becomes the only paid bounded lane, which can itself be the positive reason (`autonomous-mode.md` §5).

### GPT-6 Astra — rare senior independent escalation
Astra is token-hungry and expensive. It is an **independent senior supervisory/escalation layer**: event-triggered, never routine, and **never a manager**. It is not the standing manager, not a temporary manager, and not the failover path. Opus manages, and when Opus/Claude is constrained, Sol is the temporary continuity manager (§13). Use Astra only when independent frontier-level judgment has clear expected value:

- **Strong triggers:** materially contradictory evidence that Opus cannot reconcile; major recovery after repeated failure; serious scope drift; an unusually consequential architecture decision or reroute; manager uncertainty on a genuinely important decision; selected high-risk final acceptance.
- **Not triggers:** elapsed time, a milestone, a finished batch, "more review is safer", the importance, size or difficulty of a task on its own, one or two failed attempts, available capacity, or Astra not having been used recently.

**How it works.** Astra receives a compact evidence packet (§4) and challenges, diagnoses, reframes or recommends, unconstrained by any decomposition that already failed. It may use read-only evidence workers (§13). **The current manager decides and executes.** That is Opus, or Sol while Sol-manager mode holds. Astra may also **challenge or supervise Sol-manager mode** on a strong trigger, for example a consequential scope, architecture or recovery call Sol faces while Opus is unavailable (`autonomous-mode.md` §4). It advises there too, and the conservative-option rule still governs. For a globally interwoven problem where Opus + Sol decomposition keeps failing, Astra's job is to produce a better global frame and plan, not to take over the work. Before invoking it on such a problem, there should be evidence that Opus has run a serious plan, Sol has worked the hard engineering, and the failure is not just missing evidence, a bad brief, too little reasoning, a provider failure or unclear acceptance. Pick Astra only when its cost is likely below continued failed attempts. If its guidance fails, identify the blocker (missing evidence, environment, architecture, product ambiguity, human judgment) and acquire new information before another expensive run.

## 12. Reasoning effort (separate from model choice)

Use the lowest level likely to complete the role reliably, raising it for uncertainty, context load, coordination burden, consequence or rework risk. Never maximize it by default.

| Model | Normal policy |
|---|---|
| **Luna** | `low`/`medium` as appropriate |
| **Terra** | `medium`; higher only when the task is still clearly Terra-class but benefits from extra care |
| **Sol** | `medium` default for substantial engineering; `high`/`xhigh` when bounded work genuinely needs it; `max`/`ultra` only exceptionally. Catalog default is `low`, so never leave it implicit |
| **Astra** | explicit selection **required** (low catalog default); usage itself stays exceptional |
| **OpenCode workers** | the explicit model ID is the whole routing decision; no per-call reasoning variant in current policy |

### Autonomous Mode preferred levels — EXPERIMENT

Inside Autonomous Mode, prefer these levels. This is an experiment, not doctrine. Findings are recorded per `autonomous-mode.md` §13.

| Model | Preferred levels |
|---|---|
| **Luna** | `high` for lighter mechanical work and liveness checks; usually `xhigh`/`max`. `max` is fine for dense clerical/browser/harness/evidence work where omissions cause rework |
| **Terra** | `medium`/`high`/`xhigh` for normal bounded engineering; `max` only when coordinating many Luna agents or unusually broad scope |
| **Sol** | `medium`/`high` routine serious engineering; `xhigh` difficult implementation/debug/integration; `max`/`ultra` when leading many sub-agents, acting as continuity manager (§13), or doing higher-level integration/decision work |
| **Astra** | `high` default; `xhigh` for unusually hard contradictions or high-consequence global judgment |
| **Opus** | `high` default as manager; `xhigh` when parallelism, context or coordination load rises; `max` only for genuinely intricate, high-stakes problems |
| **Sonnet** | `high`/`xhigh` when a Sonnet-specific task justifies it |

`ultra` is valid only where the verified Codex catalog lists it: currently every routed Codex model except Luna (`codex-cli-invocation.md`). `scripts/codex-route.sh` accepts `ultra` for any model, so the catalog, not the script, is the check.

Claude-side levels (Opus, Sonnet) cannot be set per call on an ad-hoc subagent. A subagent inherits the session's level unless it uses an agent definition (`.claude/agents/*.md`), and GT3 has none yet. Record the **actual** level, not the intended one.

Every routed job passes its model explicitly, and every Codex job also passes reasoning effort explicitly (`codex-cli-invocation.md` §"Default-fallback protection"). Never rely on a global or default model or effort.

## 13. Delegation direction and continuity

Who may hand work to whom. This governs *who spawns*. §11 governs *which model fits*, and §3 governs *whether to delegate at all*.

- **Opus (primary manager)** may invoke any appropriate worker, and may invoke Astra on a §11 trigger. **Sol, while in Sol-manager mode,** may also invoke Astra on a §11 trigger.
- **Sol** (as execution lead, or as any Sol worker) may delegate to Muse / DeepSeek / Terra / Bunny / Luna through the same wrappers, from its own worktree. Sol does not spend Claude capacity. A subtask that genuinely needs Sonnet or Opus goes back up to the manager.
- **Muse / DeepSeek / Terra** may use Bunny or Luna. **Bunny and Luna** delegate to no one. **Astra** is advisory and dispatches no execution work. It may only use read-only evidence workers (below).
- **Workers never self-escalate.** Hitting a lane boundary or a model/tool/route limit means checkpoint and report upward (done, evidence, what blocks it). Only a parent reassigns or escalates (§6).
- **Opus worker instances are workers**, not the manager: bounded scope, no manager authority, report upward. Use one for an Anchor Task that benefits from context separation, or for Sol-level work while Codex is unavailable.
- **Support/evidence workers attached to a review or decision** (for example Bunny or Luna gathering facts) are **read-only by default**: no tracked-file edits, commits or heavy local jobs unless the manager schedules them.
- Children of any worker share the local-machine budget (`autonomous-mode.md` §6). Delegation never gets around it. Routed Codex and OpenCode jobs run from dedicated worktrees, never the user's main checkout.
- A parent that delegates collects its children's material results into its own upward report, so tracking (§15) survives depth.

**Manager continuity (Opus → Sol).** Opus is primary manager while available. If Opus nears quota/tool exhaustion (not context pressure, which compaction handles) and meaningful in-scope work remains, Sol may become **temporary continuity manager** on the Codex side (`high`/`xhigh` minimum, `max`/`ultra` under heavy coordination). It still routes by this file's scarcity-adjusted rules and does not recreate Claude-style management in another model family. Failover is not normal architecture. **Sol, not Astra, is the manager failover path.** Astra may challenge or supervise Sol-manager mode on a §11 trigger, but it never assumes management. Procedure: `autonomous-mode.md` §4.

## 14. Compact routing tree

Enter at the branch that matches the task's dominant bottleneck, not its size. Then apply §3 (delegate at all?) and §10 (current quota mode).

```
TASK
├─ Deterministic tooling can answer it?                       → tooling / script
├─ Mechanical / repetitive / known procedure?                  → Luna   (Muse if it needs modest interpretation)
├─ Bounded implementation, clear contract?                     → Muse   (free + healthy)
│     Muse route down, or Muse meaningfully riskier here      → Terra
├─ "Why is this broken?" (bounded debugging / root cause)?     → DeepSeek (free) — escalate to Sol after one serious failed attempt
├─ Facts needed first (locate, trace, gather) for a worker?    → Bunny retrieves → that worker reasons   [experimental]
├─ Serious engineering: hard debug, 3D/camera, perf, complex
│  state, integration, bounded architecture, or a batch to lead? → Sol (medium; high/xhigh when needed)
├─ Exceptionally Sonnet-suited, worth Claude scarcity?         → Sonnet (positive reason required)
├─ Project-wide decomposition / architecture / integration /
│  acceptance, or a broad × ambiguous × consequential Anchor?   → Opus
└─ Strong Astra trigger (§11): contradiction, repeated failed
   recovery, scope drift, consequential reroute, globally
   interwoven failure of Opus + Sol decomposition?             → Astra (independent judgment; manager decides)
```

Examples: an obvious rename goes to Luna. A contained CSS/component change or contained audio bug goes to Muse. A subtle bounded regression goes to DeepSeek, and to Sol if one serious attempt fails. A tiny native patch where OpenCode overhead is silly goes to Terra. A Grand Tour camera/render/perf issue goes to Sol. A multi-part engineering batch goes to Sol as lead, delegating only the separable pieces. A project-wide architecture tradeoff is Opus, possibly as an Anchor Task. Conflicting Sol investigations that Opus cannot reconcile are an Astra judgment.

## 15. Routing learns from GT3

This map is a strong prior, not permanent truth. **Track material model work, not every command**, in [`routing-evidence.md`](./routing-evidence.md). Every material Muse, DeepSeek and Bunny task gets a row, as do other models where useful (always for Sonnet and Astra, since their scarcity needs justifying). The key metrics are **first-pass acceptance and rework**, not raw completion. Over time this builds a GT3-specific skill matrix: what Muse is unusually good at, where Terra is reliably enough, which bugs DeepSeek cracks, where Sonnet earns its cost, whether Bunny helps. Model reputation is not GT3 performance. Change routing only on repeated evidence, never on one anecdote.

**2026-10-04 benchmark (complete; archived separately as `gt3-model-benchmark`; not reopened during ordinary development).** It ran standardized debugging, bounded-implementation and one open-ended performance (Frontier) task, graded by the manager under the same conditions:

- **Muse** was the strongest free bounded worker. It did not establish a frontier lane.
- **DeepSeek** accepted on bounded tasks but failed Frontier (timeout, missed target, regressed driving).
- **Bunny** read and critiqued well but completed unreliably under time limits.
- **MiMo** was promising on UI engineering (not visual taste) with poor completion, so it stays experimental. **Laguna S/XS** earned no lane.
- **Sol** beat every free alternative on Frontier. Its self-reported gain was revised down by the manager-owned grader.
- Terra, Sonnet, Opus and Luna were placed by routing policy, not re-measured.

**2026-10-05 doctrine migration.** This was a policy change, not new measurement. Sonnet moved from default upper-mid worker and Autonomous Mode reviewer to a specialist exception (Claude scarcity). Terra became the preferred paid bounded worker. DeepSeek gained a debugging lane. Bunny went on probation as a retrieval/support layer. Sol gained the execution-lead pattern. Opus gained Anchor Tasks. Astra lost its manager-takeover role and became an event-triggered independent senior supervisory/escalation layer. Sol remains the only manager failover path. Reviews and supervision became risk- and event-driven. These placements are hypotheses for `routing-evidence.md` to confirm or revise.
