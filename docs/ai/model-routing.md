# GT3 — Model Routing (canonical)

This is the canonical, repo-portable source of truth for AI model routing on GT3. It survives new Claude sessions, different machines, Codex used directly, future agents/managers, and loss/reset of any single agent's private memory.

Unattended multi-hour execution (host limits, recovery, handoff) is governed by [`docs/ai/autonomous-mode.md`](./autonomous-mode.md); this file stays the routing authority for it.

Execution-specific detail lives separately, and this file does not duplicate it:

- [`docs/ai/codex-cli-invocation.md`](./codex-cli-invocation.md) — Codex models (Luna, Terra, Sol, Astra): verified slugs, reasoning-effort values, invocation, config-default behavior. Route through `scripts/codex-route.sh`.
- [`docs/ai/opencode-invocation.md`](./opencode-invocation.md) — OpenCode free routes (Muse, DeepSeek, Bunny, MiMo): exact model IDs, providers, credential isolation, route health. Route through `scripts/opencode-route.sh`.

**Status:** current evidence-based default, not permanent doctrine. Roles, tree and escalation rules change only when measured GT3 runs show better (§7). Agents must not rewrite them mid-run because they prefer something else; propose changes in the run handoff instead. The thinking-level table in §4 is explicitly an **experiment**. Last revised 2026-10-04 from the completed GT3 model benchmark (§7).

---

## 1. Optimization target

Not "always cheapest." Total cost to accepted result:

```
inference cost + retry cost + manager attention + context consumption + coordination overhead + rework risk
```

Use the least expensive combination of models, reasoning, context, and coordination with a high probability of an accepted result. Escalate only when doing so is likely to cost less than continued retries, decomposition, context consumption, rework, or manager intervention.

A model's token appetite is part of its cost, not just its price per token. Astra in particular consumes far more tokens per task than any other lane, so choosing Astra is a cost decision as well as a capability one (§3).

## 2. Core principle

Route directly to the lowest-cost model reasonably likely to succeed. **There is no escalation staircase.** Luna → Muse → DeepSeek → Terra → Sonnet → Sol → Opus → Astra is *not* a ladder to climb. An obviously complex task goes straight to the lane that can handle it. Never run a model expected to be underpowered "to try the cheap tier first," and never burn cheap attempts purely to climb.

## 3. Approved roles (current)

| Model | Role |
|---|---|
| **GPT-6 Luna** | mechanical economy; clerical/watchdog-style checks |
| **Muse Spark 1.3** (free, OpenCode) | **default** bounded implementation + bounded debugging worker while its free route is healthy |
| **DeepSeek V4.1 Flash Free** (OpenCode) | secondary free bounded worker; Muse's fallback for reasoning/debugging-heavy bounded work |
| **GPT-5.6 Terra** | reliable native bounded fallback / low-latency shortcut |
| **Space Bunny** (free, OpenCode) | reader / investigator / evidence-gatherer / first-pass reviewer |
| **Claude Sonnet** | upper-mid implementation, investigation, critique, alternate perspective |
| **GPT-6.1 Sol** | primary serious engineering worker |
| **Claude Opus** | primary manager / architect / integrator |
| **GPT-6 Astra** | rare, token-expensive, last-resort manager takeover for globally interwoven problems |

Not in the active tree: **MiMo V2.6 Flash Free** is experimental only, used for explicit experiments or when the user asks for it. **Laguna S / XS** have no routing role; their benchmark results are historical evidence only.

Direct routing to any lane is allowed. **Opus + GPT-6.1 Sol is assumed capable of nearly all GT3 development, including difficult work.**

### GPT-6 Luna — mechanical economy
Renames, formatting, simple file edits, boilerplate, repetitive transformations, obvious CSS tweaks, simple extraction/classification, deterministic housekeeping. Small scope, explicit instructions, known files, clear acceptance criteria. **Not for:** ambiguous features, architecture, difficult debugging, significant UI judgment, complex state, 3D logic, broad repo reasoning.

**Luna is the explicit home for clerical/mechanical work:** known harnesses, browser/DOM checks, screenshots and captures, log reading, repetitive verification, lightweight evidence support, status checks. Opus and Sol should not burn context on work Luna can own. (Not a reason to spawn Luna for trivia that a single command answers.)

### Muse Spark 1.3 — default bounded worker (free)
First choice for ordinary bounded execution while `opencode/muse-spark-1.3-contributor-free` is healthy, available and free (§6 "Free routes"): contained component/CSS/UI implementation, contained bugs (including audio and UI state), asset integration, simple refactors, utility logic, straightforward tests, wiring between established systems. In the benchmark it was the strongest free bounded worker. It accepted on hard bounded debugging and on bounded UI implementation, with small relevant patches and better completion and self-verification than the other free workers. **Not for** open-ended or frontier systems work. It did not establish that lane, so send that to Sol.

### DeepSeek V4.1 Flash Free — secondary free bounded worker
Muse's fallback when Muse's route is unavailable, overloaded, broken or quota-constrained, especially for **reasoning/debugging-heavy** bounded work. Accepted on bounded debugging and (with a fix) bounded implementation. **Not for** open-ended performance investigations, broad optimization, frontier or ambiguous system-wide work. On an open-ended performance task it hit the time cap, missed the target and badly regressed normal driving, with a broad, noisy diff. Always the exact `:free` route, never a paid sibling (`opencode-invocation.md`).

### GPT-5.6 Terra — reliable native fallback / shortcut
Reliable, fast, native to Codex, low-friction, but **no longer the default bounded lane** while Muse is healthy. Use Terra when the free routes are unavailable/unhealthy/rate-limited; when OpenCode/provider overhead is irrational for a tiny straightforward task; when a native Codex path is operationally preferable; or when the task is explicit and routine enough that Terra's success probability is high. Prefer DeepSeek over Terra as the Muse fallback when the bounded work is reasoning/debugging-heavy. Prefer Terra when it is straightforward, latency-sensitive or better run natively.

### Space Bunny — reader / reviewer (free)
Repo reconnaissance, tracing requirements to code, comparing implementation to spec, collecting evidence, reviewing diffs, first-pass critique, flagging likely problems, and handing concise findings to Muse/Sonnet/Sol/Opus. It reads and reviews well but completes poorly as primary implementer under time limits. **Do not** make Bunny the default implementer or the primary patch owner when timely completion matters. Muse is the doer, Bunny the reader.

### Claude Sonnet — upper-mid engineering / critique
Above Terra and the free bounded workers for engineering complexity, below GPT-6.1 Sol for serious engineering. (This placement is a routing-policy decision, not a benchmark measurement.) Use for upper-mid implementation, nontrivial investigation, debugging, bounded planning, code review, independent critique, an alternate-model perspective, and recovery from an incomplete weaker-worker attempt. Choose it when work exceeds straightforward Muse/Terra territory, when there is moderate cross-file reasoning or ambiguity, or when independent critique is worth its cost. **Sonnet is not a mandatory stop before Sol**: clearly serious rendering/3D/performance/race-condition/architecture-heavy work goes straight to Sol. Don't use Sonnet merely to duplicate a task already assigned to Sol; cross-model duplication needs an explicit reason (§6). Sonnet is also Autonomous Mode's **independent reviewer** when a second model perspective is useful (`autonomous-mode.md` §3). Routine watchdog checks go to Luna.

### GPT-6.1 Sol — primary serious engineering worker
Difficult debugging, hard multi-file engineering, rendering/Three.js, camera systems, performance, state/lifecycle/race conditions, complex UI engineering, difficult integrations, architecture inside a bounded subsystem, difficult technical investigations, and recovery from weaker-worker failures when the problem is still fundamentally an engineering problem. Sol should solve the overwhelming majority of hard GT3 engineering without Astra. **Reasoning escalation and model escalation are different decisions** (§4): a hard bounded problem gets Sol at `high`/`xhigh`, not Astra.

Benchmark nuance: an early Sol performance run self-reported ~84% improvement, but the standardized manager-owned grader measured ~59% under the same conditions. Sol still clearly beat the free alternatives and preserved normal scrolling. The lesson is about verification, not Sol: performance claims need comparable, manager-owned measurement, and visually consequential optimizations need human/product review (§6).

### Claude Opus — primary manager / architect / integrator
Broad repo-state understanding, interpreting product intent, planning, decomposition, routing, cross-system architecture, dependency management, synthesis, reconciling worker outputs, integration strategy, resolving contradictions and worker conflicts, deciding what evidence is required, reviewing consequential work, acceptance, recognizing when the current strategy is failing. Should generally not spend its own context on bulk edits, mechanical changes, routine coding, formatting, simple refactors, repeated test runs, or clerical inspection another worker can own. Delegate because it saves manager attention, not for its own sake. For small tasks the fastest path is often just classify → execute → verify → finish, done directly.

### GPT-6 Astra — rare last-resort manager takeover
**Default assumption: Opus managing + GPT-6.1 Sol engineering is sufficient.** Astra is a token hog, and it is *not*: a normal next tier after Sol or Opus, "harder Sol," a routine second opinion, a normal reviewer/architect/manager, a prestige choice for important work, or an automatic escalation after one or two failed attempts.

Not valid reasons on their own: the task is important, large, or difficult; Sol needed a retry; an implementation failed once; Opus is managing several workers; the problem spans a few files or subsystems; a stronger model might theoretically do better.

**Valid trigger:** the problem has become too globally interwoven for normal Opus + Sol handling to stay reliable. It is deeply coupled across phases, systems, architecture layers and runtime states, and decomposition itself is losing critical information or producing repeated coordination failure. For example: an issue tightly coupled across Landing, Hub, Showcase, Grand Tour, state lifecycle, audio, rendering and persistence; several competent Sol investigations producing conflicting partial truths that Opus cannot reconcile; a long-running architectural problem where every decomposition creates new contradictions; emergent behavior whose root cause can't be isolated to one subsystem; Opus's decomposition demonstrably being the bottleneck; coordination and context repetition costing more than one integrated takeover.

**Before Astra, there should normally be evidence that:**
1. Opus has already formed and managed a serious plan;
2. GPT-6.1 Sol has already investigated/implemented the relevant hard engineering where appropriate;
3. the failure is *not* simply missing evidence, a bad prompt, insufficient reasoning effort, provider failure, unclear acceptance criteria, or a routine implementation error;
4. further decomposition/retries are becoming less reliable or more expensive than consolidated ownership;
5. the problem genuinely benefits from global end-to-end context.

**Token economics:** pick Astra only when its much higher usage is likely to cost *less overall* (§1) than continued failed Opus/Sol decomposition and retries. If there is reasonable confidence Opus or Sol can solve it reliably, use them.

**When invoked, Astra temporarily takes over as manager** for that bounded global problem. It may own investigation, reframing, architecture, planning, worker routing, implementation, integration, verification and acceptance synthesis. Don't constrain it to the decomposition that already failed. Give it the current repo state, the exact objective, relevant history, previous attempts, measured failures, runtime evidence, rejected hypotheses, system dependencies, constraints and acceptance criteria, and let it reframe globally. **Once that problem is resolved, management returns to Opus and normal routing immediately.** Astra never becomes the standing GT3 manager. If Astra itself fails, don't blindly rerun it. First identify whether the blocker is missing evidence, an environment/tool limitation, architecture, ambiguous product intent, a missing requirement, human judgment, or genuine unresolved technical uncertainty, and acquire new information before spending another expensive run.

**No standing role.** Astra has no periodic, milestone or supervisory review role, in Autonomous Mode or elsewhere. Periodic independent review is Sonnet's (`autonomous-mode.md` §3). Astra consumes tokens only once the takeover criteria above are met.

## 4. Reasoning-effort policy (separate from model selection)

Model choice and reasoning-effort choice are two independent decisions. Do not automatically maximize reasoning merely because a stronger model was selected.

| Model | Normal policy |
|---|---|
| **Luna** | `low`/`medium` as appropriate to the task |
| **Terra** | `medium` normally; higher only when the task is still clearly Terra-class (bounded, understood) but benefits from extra care |
| **Sol** | `medium` default for substantial engineering; `high`/`xhigh` when bounded work genuinely needs deeper reasoning; `max`/`ultra` only exceptionally and deliberately. GPT-6.1 Sol's catalog default is `low`, so never leave it implicit |
| **Astra** | explicit reasoning selection is **required** — never rely on Astra's low default; choose effort based on the actual task. Astra *usage itself* remains exceptional regardless of the effort chosen |
| **OpenCode workers** (Muse, DeepSeek, Bunny) | the explicit model ID is the whole routing decision; no per-call reasoning variant is part of current policy |

### Autonomous Mode preferred levels — EXPERIMENT

Inside Autonomous Mode, prefer these levels instead of the normal table above. This is a measured experiment, not doctrine (see `autonomous-mode.md` §13 for the 2–3-run findings requirement).

| Model | Preferred levels |
|---|---|
| **Luna** | `high` for lighter mechanical work and routine watchdog checks; usually `xhigh`/`max`. `max` is fine for dense clerical/browser/harness/evidence work, or watchdog checks needing log/evidence interpretation, where omissions cause rework |
| **Terra** | `medium`/`high`/`xhigh` for normal bounded engineering; `max` only when Terra must coordinate many Luna agents or has unusually broad execution scope |
| **Sol** | `medium`/`high` routine serious engineering; `xhigh` difficult implementation/debug/integration; `max`/`ultra` when coordinating many sub-agents, acting as continuity manager (§8), or doing higher-level integration/decision work |
| **Astra** | only under a §3 takeover: `high` default; `xhigh` for unusually hard contradictions or high-consequence global judgment |
| **Opus** | `high` default as primary manager; `xhigh` when parallelism, context or coordination load rises; `max` only for genuinely intricate, high-stakes multi-constraint problems |
| **Sonnet** | `high`/`xhigh` for independent review and demanding coding/debug; `low`/`medium` only as the watchdog fallback when Codex is unavailable |

`ultra` is only valid where the verified Codex catalog lists it: currently every routed Codex model except the Luna models (see `codex-cli-invocation.md`). `scripts/codex-route.sh` accepts `ultra` for any model, so the catalog, not the script, is the check.

Claude-side levels (Opus, Sonnet) cannot be set per call on an ad-hoc subagent. A subagent inherits the session's level unless it uses an agent definition (`.claude/agents/*.md` frontmatter), and GT3 has none yet. Until one exists, a "Sonnet `high` reviewer" may actually run at the inherited level. Record the **actual** level in Thinking-Level Findings, not the intended one.

Governing rule: the lowest level likely to perform the role reliably; raise it when coordination complexity, agent spawning, context burden or rework risk justifies it.

Every routed Codex job must pass reasoning effort explicitly (see `docs/ai/codex-cli-invocation.md` §"Default-fallback protection") — never rely on whatever the global Codex config happens to default to. Every routed job, Codex or OpenCode, must pass its model explicitly, never relying on a global or default model.

## 5. Task classification

Before routing, identify the dominant bottleneck: mechanical execution, evidence gathering/reading, bounded implementation, bounded debugging, difficult implementation, investigation, planning/decomposition, architecture, integration, synthesis, critique, verification, acceptance, or global end-to-end recovery. Task size ≠ model cost automatically. A large project may decompose into cheap independent work, and a small but deeply ambiguous issue may need high reasoning. Route by the nature of the bottleneck, not raw size:

- *Reading/evidence/first-pass review* → Bunny; *doing* bounded work → Muse.
- *Bounded and well-defined* → Muse (or its fallbacks), even if fiddly; *moderate ambiguity or cross-file reasoning* → Sonnet; *serious engineering* (3D, camera, rendering, performance, races, lifecycle, hard integration) → Sol directly.
- *Hard but still one bounded technical problem* → Sol at higher reasoning, not Astra. *Several files but decomposable* → Opus + Sol, not Astra.

## 6. Operating rules

**Failure diagnosis before retry.** Never blindly repeat a failed attempt. Classify why it failed: wrong model, insufficient reasoning effort, missing context, missing evidence, incorrect assumption, poor decomposition, ambiguous requirement, implementation mistake, architecture misunderstanding, verification failure, tooling/environment/provider problem, or a genuine capability limit. Then change that variable. Same model + same prompt + same context + no new evidence is not a legitimate retry.

**Free routes.** Free models are preferred because they cut routing cost, but "free" never overrides reliability:

- The preference applies only while the exact route is healthy, available and genuinely free.
- A provider/route failure is **not** a model capability failure. Re-check live route availability (`opencode-invocation.md`) before assuming a model was removed or is incapable.
- Don't repeatedly retry a broken free provider. Fall through immediately to the next appropriate sustainable lane (Muse → DeepSeek or Terra per §3; anything above bounded work → Sonnet/Sol).
- Never silently substitute a paid sibling. Never spend money or top up a provider without explicit user approval.

**Resource economics.** Free routes are preferred when reliable. Codex is metered but normally available. Claude quota is generally more constrained, so spend it where its model-specific value matters. Don't waste either provider, and don't choose a weaker worker merely to preserve quota when rework would cost more. This is not a provider-cost ladder; routing stays on expected cost-to-accepted-result (§1).

- Choose Sonnet because its Claude-side reasoning, critique, ambiguity handling or implementation quality is specifically useful, not to conserve Codex.
- Use Terra and GPT-6.1 Sol normally when they are the better technical/economic fit. Don't artificially avoid Sol, the serious-engineering lane, for quota reasons. Terra stays the native bounded fallback/shortcut, and Luna the cheap mechanical/watchdog worker.
- Opus manager context is valuable; don't burn it on routine worker execution. Astra stays exceptionally expensive and last-resort only (§3).

**Escalation must be evidence-based.** Bad: "this seems hard." Good: "Muse attempted X, runtime evidence showed Y, Sol medium tested hypothesis Z and disproved it, the remaining failure spans systems A/B/C and now needs broader synthesis." When escalating, compress prior findings into useful evidence. Don't dump full transcripts, and don't make the stronger model rediscover what's already known.

**Context economy.** Workers get the minimum sufficient context to own their task safely: goal, relevant files, constraints, local architecture, dependencies, acceptance criteria, known findings. Exclude unrelated history, giant transcripts, irrelevant files, duplicated background. Managers may use broader context because synthesis is their job.

**Decomposition economics.** Parallelize only when ownership stays clean: genuinely independent tasks, clear file ownership, minimal dependencies, independently verifiable outputs, cheap merging. Stop decomposing and consolidate under Sol/Opus when workers need constant shared state, decisions depend heavily on each other, manager coordination gets expensive, context must be repeated constantly, reasoning fragments, or merge/integration risk dominates. Consolidate under Astra only when §3's takeover criteria are met.

**No duplicated speculative work.** Once a worker owns a bounded task, don't independently redo it while waiting. Parallel duplication needs an explicit reason: independent review, competing hypotheses, model comparison, verification, recovery.

**Implementation ≠ acceptance.** Worker completion ≠ accepted work. Use implement → verify → accept, with the cheapest reliable evidence available, in this order: deterministic checks → unit/integration tests → type/static/build checks → targeted runtime checks → browser interaction → performance measurement → model review where judgment is genuinely needed → human judgment for subjective experience. Worker-reported numbers are claims. Performance improvements count only when measured under comparable, manager-owned conditions. Don't spend Opus or Astra proving something a deterministic test already proves.

**Risk-based review.** Don't automatically spend another expensive model reviewing every change. Independent review earns its cost when blast radius is large, architecture changes, security/reliability matters, behavior resists deterministic testing, worker uncertainty is high, the subsystem has a regression history, or the change spans multiple critical systems. Small deterministic changes can be accepted from tests + inspection alone. Bunny is the cheap first-pass reviewer, and Sonnet the stronger independent critic.

**Cross-model review — use sparingly.** Diversity beats raw escalation only sometimes. Bunny evidence → Muse implementation, Sol implementation → Sonnet critique, Opus plan → Sol investigation, Sonnet investigation → Opus synthesis: use these only where a different reasoning perspective adds real value. Don't turn every task into a committee.

**Fast path.** For obvious tasks: classify → execute → verify → finish. No planning document, delegation graph, critique round, manager ceremony, or multi-model discussion when it adds no value.

**Human judgment.** Escalate to the user, never to a bigger model, when a decision materially changes product intent, visual direction, subjective feel, feature scope, meaningful UX behavior, or a major architecture tradeoff with product consequences. Visually consequential optimizations need human/product review even when the numbers improve. Don't ask the user to decide routine, reversible engineering details.

## 7. Routing learns from GT3

This table is a strong prior, not permanent truth (see Status above). Where practical, keep evidence per meaningful task: class, model, reasoning effort, result, retries, approximate cost, manager intervention, verification/acceptance result. Use repeated real evidence to refine routing. Don't rewrite the rules over one anecdotal success or failure.

**2026-10-04 revision: GT3 model benchmark (complete; archived separately as `gt3-model-benchmark`, not to be reopened during ordinary development).** Standardized debugging, bounded-implementation and one open-ended performance (Frontier) task, graded by the manager under the same conditions:

- **Muse** was the strongest free bounded worker, so it displaces Terra as the default bounded lane. It did not establish a frontier lane.
- **DeepSeek** accepted on bounded tasks, but on Frontier it timed out, missed the target and regressed normal driving. It stays bounded and becomes Muse's fallback.
- **Bunny** showed strong reading and critique but unreliable completion under time limits, so it becomes the reader/reviewer.
- **MiMo** was promising on UI engineering (not visual taste) with poor completion reliability, so it stays experimental. **Laguna S/XS** earned no lane.
- **Sol** beat every free alternative on Frontier. Its own claimed gain was revised down by the standardized grader, which reinforced manager-owned measurement (§6).
- Terra, Sonnet, Opus and Luna roles were set by routing policy, not re-measured. Astra was narrowed to a last-resort takeover on token-economics grounds.

## 8. Delegation direction

Who may hand work to whom. This governs *who spawns*; §2–§3 govern *which model fits*. Not a capability ranking.

- **The primary manager (Opus) may invoke any appropriate worker, including Astra under §3's takeover criteria.** That is *manager-directed specialist escalation*, not a subordinate promoting itself.
- **Ordinary delegation goes downward only:** Astra (while it holds a §3 takeover) → any worker; Sol → Sonnet / Muse / DeepSeek / Terra / Bunny / Luna; Sonnet → Muse / DeepSeek / Terra / Bunny / Luna; Muse / DeepSeek / Terra → Bunny / Luna; Bunny and Luna delegate to no one.
- **Ordinary workers never escalate upward.** A worker that hits work above its lane, or a model/tool/route limit, checkpoints and reports to the manager (done, evidence, what blocks it). The manager decides reassignment or escalation per §6.
- **Opus worker instances are workers, not the manager.** When Claude-side Sol-level execution is needed, prefer a bounded Opus worker/subagent so the primary manager's context stays separate from implementation. A worker instance has bounded scope, no manager authority, and reports upward like any worker.
- **Independent reviewer (Autonomous Mode).** The Sonnet reviewer advises the manager and holds no manager authority. Any evidence workers it uses (Bunny, Luna) are **read-only by default**: no tracked-file edits, commits, or heavy local jobs unless the manager schedules them. They count toward the host budget and follow process-safety rules.
- Sub-agents share the local-machine budget with top-level jobs (`autonomous-mode.md` §6); delegation is never a way around it.
- **Routed Codex and OpenCode jobs run from manager-created dedicated worktrees**, never the user's main checkout.

### Manager continuity (Opus → Sol)

The primary manager is Opus while available. If Opus nears quota/tool exhaustion (not context pressure, which compaction handles) and meaningful in-scope work remains, **Sol may become temporary continuity manager** on the Codex side, at `high`/`xhigh` minimum, or `max`/`ultra` per §4 when the coordination load is heavy. This is failover, not normal architecture: Sol holds temporary management authority for the run; Opus regains it on return; scope-sensitive decisions are taken conservatively meanwhile. The procedure (continuation packet, review, handback) is in `autonomous-mode.md` §4. Continuity failover is not an Astra takeover.

## 9. Compact routing tree

Direct routing, not a ladder. Enter at the branch that matches the task's character.

```
TASK
├─ Deterministic tooling can solve it?                → deterministic tooling
├─ Mechanical / obvious / repetitive / clerical?       → GPT-6 Luna
├─ Repo reading / evidence gathering / first-pass review?
│                                                      → Space Bunny
├─ Bounded implementation or bounded debugging?        → Muse Spark 1.3 (while free + healthy)
│     Muse unavailable / overloaded / broken / quota-constrained:
│     ├─ reasoning/debugging-heavy bounded work        → DeepSeek V4.1 Flash Free
│     └─ straightforward / native / latency-sensitive  → GPT-5.6 Terra
├─ Moderate complexity / ambiguity / strong alt. perspective / critique?
│                                                      → Claude Sonnet
├─ Serious engineering: difficult debug, 3D, perf,
│  complex state, integration, bounded architecture?   → GPT-6.1 Sol (medium; high/xhigh when needed)
├─ Project-wide planning / decomposition / architecture /
│  integration / routing / acceptance?                 → Claude Opus
└─ Normal Opus + Sol handling demonstrably unreliable because the problem is
   exceptionally interwoven across systems/phases and decomposition itself
   is failing (§3 criteria)?                           → GPT-6 Astra temporary takeover — LAST RESORT
```

Examples: obvious rename → Luna. Contained CSS/component or a contained audio bug → Muse. Muse route dead on a subtle bounded bug → DeepSeek. Tiny native patch where OpenCode overhead is silly → Terra. Moderately complex feature with ambiguity → Sonnet. Grand Tour camera/render/perf issue → Sol. Project-wide architecture decision → Opus. Complex multi-file feature that decomposes well → Opus + Sol, not Astra. A very hard bug Sol can own as one problem → Sol `high`/`xhigh`, not Astra.

**Governing rule:** use the least expensive combination of models, reasoning, context, and coordination with a high probability of an accepted result; escalate intelligence only when doing so is likely to cost less, token appetite included, than continued retries, decomposition, context consumption, rework, or manager intervention.
