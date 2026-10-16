# GT3 — Autonomous Mode (canonical)

Protocol for leaving GT3 unattended for hours on a **bounded objective**, under either manager configuration (Opus-led or Sol-led) on either Mac. It **extends** [`model-routing.md`](./model-routing.md) and [`operating-contract.md`](./operating-contract.md) for unattended operation. The routing, delegation, context, review, verification and quota principles there apply unchanged, and nothing here creates a separate or heavier architecture. This file owns only what is specific to running unattended: supervision, continuity, quota trajectory, host protection, recovery, ledger and handoff.

- Model roles, quota modes, thinking levels, delegation direction → `model-routing.md`
- Hosts and resource limits, seat/epoch authority, run record, handoffs, worker isolation, evidence provenance, remote control → `operating-contract.md`
- Codex slugs and syntax → [`codex-cli-invocation.md`](./codex-cli-invocation.md) (route through `scripts/codex-route.sh`)
- OpenCode free-route IDs and syntax → [`opencode-invocation.md`](./opencode-invocation.md) (route through `scripts/opencode-route.sh`)
- Product truth → `SPEC.md`. Measured history → `BUILD_LOG.md`. Model-work evidence → [`routing-evidence.md`](./routing-evidence.md).

**Posture: be safe, but get a dangerous amount done.** Optimize for **maximum useful accepted progress during the unattended horizon**, not maximum continuous AI activity. Do everything that can be safely finished without the user. When a genuine user-only judgment appears, mark it **NEEDS HUMAN VERIFICATION**, preserve the artifact, and continue independent work. **Waiting or stopping cleanly is a valid optimization** (§9). Never invent phases, features, refactors, reviews or cleanup to look busy.

The mode protects: product intent, scope, repo safety, host stability, quota, manager continuity, evidence quality, human-only judgment, clean recovery, and a useful handoff.

**Status: current evidence-based default, revisable, not permanent doctrine.** Agents must not silently rewrite this framework mid-run. They record process lessons in the handoff (§12), and promotion is deliberate (§13).

Host rules apply to **any** heavy GT3 work on either Mac, attended or not. They live in `operating-contract.md` §6, with per-host profiles.

---

## 1. Invocation

Any clear phrasing invokes the mode when the active task is clear: "Enter GT3 Autonomous Mode", "Use Autonomous Mode for this", "I WILL USE AUTONOMOUS MODE FOR THIS", "Run this autonomously".

```
Enter GT3 Autonomous Mode. Objective: <desired end state>.
Configuration: opus-led|sol-led   Branch: <branch/worktree>  Commits: yes|no  Push: yes|no  main: forbidden
Exclusions: …   Human-review boundaries: …   Horizon: …
```

If invoked mid-task, infer the objective and boundaries from the conversation and repo where safe. Ask only if the objective, branch or a safety boundary genuinely cannot be inferred, and ask once, before starting. The user never assigns models or commands.

| Field | Default |
|---|---|
| Configuration | the harness you are running in (Claude Code → opus-led, Codex → sol-led) |
| Branch | Current branch if not `main`; else a new worktree branch named for the objective |
| Commits / Push | yes / no |
| `main` | forbidden (no commit, merge, rebase, push) |
| Exclusions | everything not needed for the objective; no next phase unless named |
| Human-review boundaries | anything subjective: feel, visual/art direction, product intent |
| Horizon | ~4 h, or objective done, whichever is first |

The manager writes a run plan to the ledger (§11): objective, done criteria, work items **each with its owner (model @ effort), assigned before execution starts, with Opus-owned items labelled Anchor Task or bounded fast path (`model-routing.md` §9, §11)**, verification plan (with its executor) (sized by blast radius, with the triggers that would widen it: `model-routing.md` §5), exclusions. If done criteria cannot be stated, the objective is not bounded enough, so ask.

## 2. Manager

The **seat holder** manages: Opus under Opus-led (role and Anchor Task allowance in `model-routing.md` §11), Sol under Sol-led (`model-routing.md` §11b). The run is claimed with `scripts/gt3-run.sh claim` before any dispatch (`operating-contract.md` §4). The manager owns: objective, done criteria, decomposition, routing, briefs, escalation, integration, evidence reconciliation, scope, git/repo safety, host/resource decisions, quota mode, stop/continue, and the handoff.

- **Route by net leverage**, not because workers exist (`model-routing.md` §3). Choose the execution tree with the lowest expected total cost-to-acceptance. For a substantial engineering batch that may be Opus → Sol as execution lead. For a coupled change it may be Sol alone. For a broad, ambiguous, consequential problem it may be an Opus Anchor Task. "Autonomous" never means "spawn as many workers as possible".
- **Prioritize by expected value per scarce resource**, within scope and dependencies. Weigh critical path, user value, dependency unlocking, model scarcity, likelihood of acceptance, and available free capacity. If an optional premium-heavy task blocks nothing, a batch of valuable cheap Muse tasks may reasonably go first. This is a heuristic, not a scheduler.
- **Silent ownership.** After a clean handoff the worker owns its task until it completes, blocks, goes materially off course, or hits a resource limit (§7). The manager does not poll it, reread its files, or solve the same problem in parallel.
- **Batch low-value work** into one packet per compatible owner to cut startup, context and status overhead.
- **Light brief check** before dispatching a meaningful brief: objective, scope, packet sized to least privilege (`model-routing.md` §4), file/system ownership, exclusions, expected evidence, acceptance condition, host fit (§6). This is a check by the manager itself, not a review task.
- Worker completion is not acceptance. Acceptance follows the ladder in `model-routing.md` §5 and consumes the worker's evidence instead of redoing it.

## 3. Independent review — risk-triggered

While the user is away, an independent model view can stand in for the user's judgment on consequential questions. **It costs scarce capacity, so it needs a reason every time.** Before invoking a review, write in the ledger **the specific uncertainty, failure mode or risk it is expected to reduce**. If that can't be stated, don't review. There is no cadence: no hourly reviews, no automatic milestone or batch reviews, no ceremonial worker → reviewer → senior → Astra stacks.

**Good reasons:** evidence conflicts; recovery keeps failing; scope may be drifting; a consequential change of approach or architecture; the manager is uncertain on a decision that matters; a high-blast-radius or hard-to-reverse change lacks deterministic proof; a consequential operational call (rerouting onto scarce Claude capacity, discarding a cut-off worker's work, waiting vs proceeding) that the manager isn't confident about.

**Reviewer choice follows scarcity-adjusted routing** (`model-routing.md` §10–§11). Sol handles technical and evidence challenges. Astra is used only on its strong triggers. Sonnet needs a specific Sonnet advantage. Bunny may gather facts for any reviewer, and is tracked. The reviewer gets a compact packet: objective, the question, relevant evidence, and the proposed action. It does not get the run transcript. Reviewer evidence workers are read-only (`model-routing.md` §13).

**The manager decides.** The reviewer advises and may investigate. Overriding a material finding is allowed, but the finding and the reason go in the ledger and the handoff. If the warranted reviewer is unavailable, take the conservative option (checkpoint or block) for consequential decisions and log the gap.

**Final acceptance is conditional.** When evidence is strong, integration was straightforward, no contradictions occurred, blast radius is low and manager confidence is high, the manager accepts directly. Independent final review (Astra included) happens only when the run's actual risk warrants it, and it audits evidence sufficiency rather than replaying the checks. A final regression is a risk-based integration check (`model-routing.md` §5), not a replay of everything tested earlier in the run. The **human-verification sweep** is a cheap manager pass, not a model review. Before handoff, inspect every NEEDS HUMAN VERIFICATION item, drop bogus or redundant ones and anything automation already settled, and keep only genuine subjective judgment.

## 4. Manager continuity: Opus → Sol (Opus-led emergency failover)

This section covers only **unplanned** continuity inside an Opus-led run on one host. A deliberate switch in either direction, a host transfer, or a Sol-led run uses the ordinary handoff in `operating-contract.md` §4.

If Opus nears quota/tool exhaustion (a usage warning, rate-limit notice, or known reset window) while meaningful in-scope work remains **and Codex is available**, Sol (`high`/`xhigh`; higher per `model-routing.md` §12 under heavy coordination) may become **temporary continuity manager**. This is failover, not normal architecture. Context pressure alone is not a trigger, because compaction handles it.

**One manager at a time.** The run record's seat and epoch (`operating-contract.md` §3–§4) are the authority, replacing the former PID-in-ledger lock. Transitions go through `scripts/gt3-run.sh release` / `claim`, serialized on the host. Nobody dispatches while the record names another seat. A returning Opus that finds Sol active writes `handback requested` under *Next step* and dispatches nothing. This is same-host only. Across hosts there is no automatic failover (`operating-contract.md` §4.3).

**Continuation packet.** Opus can be cut off without warning, so the ledger always holds what the *next manager actually needs*, updated on the events in §11:

- objective and done criteria
- branch/head, relevant working-tree state, meaningful commits
- active and completed tasks with their owners, and which work is accepted or unaccepted
- important evidence
- material quota/reset state and important host/process state (owned PIDs)
- unresolved risks, exclusions, exact next actions

No transcripts. If Opus is cut off before handing over, no failover happens and the ledger is the handoff.

**Entering Sol-manager mode.** Opus quiesces its own workers first: each finishes or checkpoints, and anything still running is listed as transferred. Opus runs `gt3-run.sh release <run> opus@<host>` and launches Sol with the packet as its brief via `GT3_LAUNCH_ROLE=manager scripts/codex-route.sh` from the run's worktree, detached so it survives the Claude session. The brief includes the absolute run deadline, and Sol stops at it. Sol acknowledges by running `gt3-run.sh claim <run> sol@<host>`. If no claim appears within a few minutes, Opus re-claims (if still able), or the run simply stops released, which is a safe pause. Sol secures Claude-side state first, then continues bounded work. Its pool is Codex-side (Terra, Luna) plus the free OpenCode workers (Muse, DeepSeek, Bunny). Claude workers are assumed unavailable. Astra never replaces the manager. On a strong trigger (`model-routing.md` §11), for example a consequential scope, architecture or recovery call, Sol may invoke Astra to challenge or supervise its decision. Astra advises, and the conservative-option rule below still governs. **Sol manages with the same scarcity-adjusted, net-leverage routing**, not a copy of Claude-style management in another model family: it can do coupled work itself and delegates only separable work. The Sol-manager process counts as an active agent under the host profile's limits (`operating-contract.md` §6.3). On the Intel that leaves room for at most one heavy worker beneath it.

**Sol-manager authority.** Temporary. Scope and safety rules are unchanged. Sol may not widen scope, touch `main`, push unless the invocation allows it, or start work outside the run plan. **On any scope-sensitive or consequential decision, take the conservative option** (checkpoint, or record it as blocked) and leave it for Opus or the user.

**Handback.** A returning Opus reads the record before doing anything. If Sol holds the seat, Opus records `handback requested` and dispatches nothing. Sol checks the record at each task boundary. It stops creating work, checkpoints or finishes current bounded work quickly, writes a concise run-over into the record (work done, evidence, commits, active tasks, host/process state, quota events, unresolved items, next action), runs `gt3-run.sh release`, and exits. Opus consumes the run-over without redoing established work, confirms Sol and its workers have exited or been explicitly transferred (`gt3-run.sh status`), and claims. If Sol died without releasing, the record stays active under Sol: Opus verifies the Sol PID is gone (owned-PID identity check), notes it in the record, and the owner confirms before Opus forces the claim. If Opus never returns within the run, Sol writes the handoff (§12) and records the failover.

If Codex is also unavailable, there is no continuity manager: checkpoint, update the packet, and stop cleanly (§9).

## 5. Quota trajectory and limits

Quota modes (Normal / Conservation / Critical reserve), Claude scarcity and reserve capacity are defined in `model-routing.md` §10. Unattended runs apply them **by trajectory**: remaining capacity + time to reset + burn rate + remaining expected work. If the current burn would exhaust a resource well before its reset while productive work remains, change mode immediately instead of waiting for the hard limit. Re-assess at natural boundaries (task completion, a usage warning, a rate-limit notice). Do not poll quota, and do not invent usage data that isn't exposed. **Never plan the run to consume 100 % of frontier quota.** Keep reserve for integration, recovery, blockers, final decisions and the handoff.

Quota exhaustion is an expected autonomous state, not an implementation failure.

- **Approaching a limit:** checkpoint, preserve evidence, prepare the reassignment packet.
- **Exhausted:** no retry loops, no identical re-briefs. Mark the route **TEMPORARILY UNAVAILABLE / BLOCKED (not FAIL)** until reset or evidence of recovery, and reroute if a capable alternative exists.
- **All heavy routes unavailable:** useful light work (§9), else wait or stop cleanly. Waiting is valid when the reset is known and within the horizon.
- **Manager exhaustion:** §4.

**Codex exhausted, Claude available.** Claude is the scarcer resource, so conserve it.
- **Reset soon** (roughly < 30 min): prefer waiting, light/static work, planning and handoff prep over spending Claude on work Codex can resume shortly.
- **Otherwise, conservation mode on the Claude side.** Opus stays manager. New bounded work goes to the free OpenCode workers (Muse, DeepSeek for debugging) while their routes are healthy. Sonnet takes bounded paid work only where the free routes can't (that is its positive reason here). Sol-level work runs in a bounded Opus worker instance only if it is critical-path. Batch or defer clerical work rather than spend Claude on it. Do less total work, prioritize critical-path completion and state preservation, and skip optional work.

**Sol-led runs** mirror the above:
- **Claude exhausted:** Opus/Sonnet/Haiku routes are BLOCKED and Sol continues with Terra, Luna and Muse.
- **Codex exhausted:** the manager itself is constrained. Sol checkpoints and releases. Continuing under Opus in a single unattended run is not automatic; the owner may hand the seat to Opus (`operating-contract.md` §4).

Changing Macs does not help when quota is account-level (`operating-contract.md` §11).

The handoff reports each affected route and its reset time if known.

## 6. Host and concurrency

Host profiles, workload classes, concurrency limits, pre-flight, degradation, calibration and process cleanliness are canonical in `operating-contract.md` §6. They apply attended or not, and per host: Intel rules on the Intel, the provisional envelope on the M4. Unattended additions:

- **Pre-flight is mandatory** before every heavy spawn or class change (`node scripts/host-check.mjs preflight <class>`; exit 75 = wait, never retry in a loop).
- **The deterministic host monitor runs for the whole heavy window** and writes to the run's local ledger. It never counts as a task and needs no watcher.
- **Before Vite or a harness**, use `scripts/with-verification-server.sh` with a run-specific `GT3_PORT` (`operating-contract.md` §7). A server from another worktree yields false evidence.
- On degradation, unattended runs drop to light work and checkpoint before anything else. They do not wait for the owner.

## 7. Supervision: event-driven, not clock-driven

Supervision wakes on **events**. Clocks are only a fallback liveness mechanism.

| Event | Response |
|---|---|
| Healthy worker progressing | leave it alone (silent ownership) |
| Worker completes | notify the parent/integrator |
| Worker blocked | wake the cheapest capable authority |
| Evidence conflicts | escalate by consequence (§3) |
| Scope or architecture boundary crossed | escalate (`model-routing.md` §6) |
| Host threshold crossed | reduce load, checkpoint (§6) |
| Quota trajectory unsafe | switch quota mode (§5) |
| Failure/recovery repeats | escalate; consider a review (§3) |

**Fallback liveness.** Use this only where progress isn't otherwise observable. Prefer deterministic signals: PID alive, log or output still advancing, expected files appearing. These cost nothing and need no model. Schedule checks to match the task's expected duration, how visible its progress is, failure risk, host and quota state, and observability quality. **The healthier the observability, the less supervision should cost.** No fixed interval is an automatic model invocation point. Don't invoke an agent because 15, 30 or 60 minutes passed if state is clearly healthy.

**When a model is genuinely needed to judge progress** (deterministic signals are ambiguous: stuck vs. legitimate wait, loop, scope creep), route it by scarcity:
- No model for completion detection, timeouts, PID/log/marker checks, host sampling or notifications: those are scripts (`model-routing.md` §8).
- Luna for browser/test execution and known health checks.
- Muse for watchdog judgment that needs modest interpretation, log/anomaly reading or light evidence synthesis (trial scope, `model-routing.md` §11).
- Terra when a stronger bounded interpretation is worth paid capacity.
- Bunny experimentally for factual status or repo-state reading (tracked).
- Sonnet only with a clear task-specific advantage that justifies Claude capacity.

The manager never polls workers itself. If observability already makes state obvious, don't create a watchdog task. **Classify** what you find as legitimate wait / process hang / harness failure / host degradation / tool outage / quota exhaustion, and log only meaningful interventions.

## 8. Verification, evidence, human-verification queue

Verification follows **right-sized verification** in `model-routing.md` §5. That means blast-radius depth, dependency-cone scope, representative rather than combinatorial coverage, failure-driven escalation and the stop rule. Before launching a heavy verification task, answer §5's pre-verification questions in the ledger, because on this host every unnecessary browser sweep also costs swap and wall-clock (§6). Use the cheapest sufficient evidence, stop once it is sufficient, and move evidence upward in compressed form. If Luna already ran a valid browser check, nobody above re-runs it merely because authority moved up. Raw artifacts stay available for anomalies and disputes. Builds belong at meaningful checkpoints. Don't broad-rerun unaffected evidence.

- **UNVERIFIED ≠ PASS. BLOCKED ≠ FAIL. NEEDS HUMAN VERIFICATION ≠ technical failure.** Static plausibility ≠ runtime proof. Build pass ≠ accepted. Worker finished ≠ accepted.
- Inspect artifacts from interrupted runs before discarding them.
- **Classify before touching product code:** app / harness / host-tool / model-quota / environment. Never change product code to work around a broken harness.
- Working behavior is a regression boundary. Gather evidence before modifying it.
- When the same check recurs across tasks or runs, note it as a candidate for a deterministic script (`model-routing.md` §8).

**Human-verification queue.** Settle without the user everything that machine evidence can usefully settle (to §5's stop rule, not exhaustively). For each genuine subjective judgment: record the item, preserve the exact artifact/state (capture path, commit, URL/state), mark it NEEDS HUMAN VERIFICATION, and continue independent work. Agents may gather and prune evidence, but they never record human acceptance. The run stops for human review only when remaining meaningful work depends on it. The human-verification sweep (§3) prunes the queue before handoff.

## 9. Recovery, stop conditions, light work

**Recover without asking:** retry a transient deterministic command (after classifying the failure); fix a proven harness bug; restart an owned Vite/Puppeteer/browser process; reroute a worker; fall back from heavy to light work; checkpoint at a model/tool limit; wait for or retry a temporarily unavailable tool; correct stale claims. Routine recovery is the manager's call. Operational interruptions (quota, worker failure, reroute, host limits) are decided inside the run, never escalated to the user. No blind retries (`model-routing.md` §6).

**Stop and checkpoint, do not expand, when:** scope would materially change; product or major architecture is ambiguous; a destructive action is required; `main` or shared history needs an unauthorized change; evidence is irreconcilable; recovery has stopped yielding progress; the next phase is outside scope; or all remaining work needs human judgment.

**Deliberate inactivity is valid.** Wait or stop cleanly when that is the most efficient action, for example when:
- remaining work is low value;
- the needed resources are scarce and a reset is near;
- useful light work is exhausted;
- everything left needs user judgment;
- further activity would only create speculative cleanup or scope creep.

A clean checkpoint can be the optimal action. Stop when the objective is achieved, machine verification is sufficient (`model-routing.md` §5), only genuine human judgment remains, or remaining work is blocked and useful fallback is exhausted.

**Light-work fallback** (when heavy work is blocked): static inspection, evidence reconciliation, committed-diff review where justified, verification-script preparation, docs-vs-implementation consistency, stale-claim identification, handoff preparation, bounded next-step planning, factual repo reconnaissance, worker-brief preparation. Never speculative refactors, unrelated cleanup, new features or unnecessary documentation. When useful light work is exhausted, wait or stop.

## 10. Git safety

Work on the specified branch/worktree. Commit coherent, reviewable checkpoints (if allowed), and push only if allowed. Leave `main` untouched unless explicitly permitted. No amend/rebase/shared-history rewrite without authorization. Codex and OpenCode jobs launch from a dedicated worktree, never the user's main checkout. `SPEC.md` changes only for genuine product/runtime truth.

**Before stopping, confirm:** branch/head, working tree, commits, `main` state, owned runtime cleanup, evidence preserved.

## 11. Run ledger

The run's authority and portable state live in the run record, `local/runs/<run>/run.md` (`operating-contract.md` §3), managed by `scripts/gt3-run.sh`. The manager's private ledger (host samples, owned PIDs, logs) sits beside it in `local/runs/<run>/`. Both are git-ignored and harness-neutral, so Claude and Codex managers can read them, and neither is tracked mid-run. Together they hold the run plan and the continuation packet (§4): objective/done criteria, seat and epoch, branch/head, tasks (owner/model, state, last evidence), owned PIDs, host state, quota mode/reset state, review findings and overrides, commits, the human-verification queue, and the next action.

**Update it on meaningful transitions, not continuously:** dispatched, completed, blocked, rerouted, accepted, quota event, host event, checkpoint, commit, manager failover, and new human-verification item. The ledger must be enough to reconstruct the run, not a chronicle of every command. The manager is not a bookkeeper.

## 12. Final handoff

Depth scales with the run. Keep implemented ≠ verified ≠ accepted separate in every tier.

**Simple run:** completed · verified (claim → evidence) · unresolved · branch/HEAD/commits/tree state · next action.

**Complex run** (several owners, integration, notable events) adds: meaningful tasks with owner/model · verified vs unverified · integration state · key evidence · quota/resource events · needs human verification (item → artifact/state to inspect) · unresolved risks.

**Failure- or recovery-heavy run** adds: failure classification · recovery attempts · rerouting · manager failovers · material reviews/interventions and any overrides · quota/host issues and cleanup.

Include in any tier when present: process lessons/improvement candidates, Thinking-Level Findings (§13), and the `routing-evidence.md` rows recorded. Don't drop important state to be brief, and don't pad a simple run with empty sections.

## 13. Learning and promotion

Do not mutate canonical doctrine during a run unless explicitly authorized. After the run, promote only measured, recurring lessons, deliberately, to the narrowest home:

| Lesson | Home |
|---|---|
| Durable project-wide principle / pointer | `GT3_MASTER_CONTEXT.md` |
| Routing principles, model roles, quota modes, thinking levels, delegation, failover | `model-routing.md` |
| Unattended protocol, host thresholds, supervision, recovery, ledger, handoff | this file |
| Material model-work outcomes (data, not doctrine) | `routing-evidence.md` (rows appended at a checkpoint/handoff commit) |
| Codex / OpenCode syntax | `codex-cli-invocation.md` / `opencode-invocation.md` |
| Measured run evidence | `BUILD_LOG.md` |
| Product/runtime constraint | `SPEC.md` |

**Thinking-level experiment (`model-routing.md` §12).** For the next 2–3 Autonomous Mode runs, record the thinking level for *material* tasks only, in the `routing-evidence.md` row: whether it was underpowered / appropriate / excessive, and its effect on quality, retries/rework and quota. Summarize in a short **Thinking-Level Findings** line in the handoff. No per-command telemetry. After 2–3 runs, recommend refinements from that evidence.

*Experiment status: 0 of 3 runs recorded.* Update this line when a run's findings are reviewed.
