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
Configuration: opus-led|sol-led   Failover: automatic|restricted by owner   Branch: <branch/worktree>  Commits: yes|no  Push: yes|no  main: forbidden
Exclusions: …   Human-review boundaries: …   Horizon: …
```

If invoked mid-task, infer the objective and boundaries from the conversation and repo where safe. Ask only if the objective, branch or a safety boundary genuinely cannot be inferred, and ask once, before starting. The user never assigns models or commands.

| Field | Default |
|---|---|
| Configuration | the harness you are running in (Claude Code → opus-led, Codex → sol-led) |
| Failover | none |
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
- **Prioritize by expected value per scarce resource**, within scope and dependencies. Weigh critical path, user value, dependency unlocking, model scarcity, likelihood of acceptance, and available free capacity. If an optional premium-heavy task blocks nothing, a batch of valuable cheap GLM/DeepSeek tasks may reasonably go first. This is a heuristic, not a scheduler.
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

## 4. Manager continuity (both configurations)

**One manager at a time.** The run record's seat and epoch are the authority (`operating-contract.md` §3–§4). Every change of manager is the ordinary `release` → `claim`.

**Cooperative continuity.** Within the authorized objective, host, horizon and permissions, an eligible same-host successor is Sol for Opus and Opus for Sol, unless the owner explicitly restricts it. Worker-only scarcity reroutes work; manager-provider scarcity triggers the thresholds in `model-routing.md` §10. Finish only immediately closable work once handoff is triggered. Reconcile workers (finish, checkpoint, or list transferred workers), update the continuation packet, release via `gt3-run.sh`, then launch the successor with the record as its brief. The successor checks status and claims before dispatching. If it cannot claim, remain released and stop. Cross-host transfer and forced recovery retain the owner-confirmation safeguards in `operating-contract.md` §4. A successor has only the existing objective and permissions; owner-only decisions remain owner-only.

Keep the packet current at meaningful checkpoints: objective and done criteria, branch and head, accepted and partial task states, workers and their ownership, evidence, outstanding requirements, known defects, quota and host state, risks, exact next actions and deadline. Weekly wind-down also identifies independently executable human or freelancer tasks; do not contact anyone. Commit and publish only when existing Git permissions permit.

**Recovery and handback.** Opus is preferred. While Sol manages, retain the last known Claude five-hour and weekly percentages and reset times, including applicable model-specific limits, and detect when relevant windows are due to refresh. Prefer fresh supported telemetry. If inactive Claude sessions cannot supply it, a future implementation may perform a minimal bounded availability probe after the expected reset, without launching a competing manager or substantive work. Require confirmed sufficient headroom across relevant windows and buckets, accounting for shared account activity, before Sol finishes its current meaningful task boundary, checkpoints, releases and automatically launches Opus to claim. Apply equivalent recovery detection to Codex worker capacity so either manager can restore unavailable routes. Stale or missing data is unknown, not recovered; failed probes back off to a bounded next check or known reset, never loop. Record transition intent and outcome in the run record, deduplicate triggers by provider/window/reset and seat epoch, and require a meaningful headroom margin and stable recovery before handback to avoid oscillation. A returning manager never dispatches or claims an active seat; forced takeover still requires owner confirmation.

## 5. Quota trajectory, telemetry and limits

Apply `model-routing.md` §10 independently to each applicable provider window and bucket, using observed trajectory, active workers and resets. Weekly wind-down overrides short-window thresholds. A blocked route remains unavailable until confirmed recovered; no retry loops. If both frontier providers are exhausted, checkpoint and stop or wait for a known reset within the horizon. Never promote a free worker to manager. Account-level quota is shared across hosts; changing Macs does not restore it.

**Telemetry design — not implemented.** Extend the existing run record and handoff mechanisms with a minimal deterministic provider-neutral snapshot available to either manager: provider, account/limit bucket and model applicability where exposed, used percentage, window duration, observation timestamp, reset timestamp, source, freshness and availability (including unknown). Preserve Claude's last known five-hour and weekly observations across manager changes. Claude Code's supported [statusline](https://code.claude.com/docs/en/statusline) exposes `rate_limits.five_hour.used_percentage`, `rate_limits.five_hour.resets_at`, `rate_limits.seven_day.used_percentage` and `rate_limits.seven_day.resets_at`; Codex [App Server](https://developers.openai.com/codex/app-server) documents `account/rateLimits/read` and `account/rateLimits/updated`, including `usedPercent`, `windowDurationMins`, `resetsAt` and multiple windows or buckets where exposed. Subscription quota is distinct from model context-window usage.

Prefer passive events and inexpensive reads at meaningful boundaries; permit bounded deterministic refreshes and the recovery probe above when necessary. No model-based polling, excessive provider requests, invented usage estimates, undocumented subscription endpoints, automatic purchases, credits or plan changes. Preserve user configuration and credentials. Validate locally installed CLI versions and session capabilities before selecting an implementation: documented interfaces may not exist in every session, and telemetry may not interrupt an in-flight inference. Treat sparse, stale or missing observations conservatively; include concurrent workers and other hosts' account activity, without assuming local observations account for all consumption.

**Simulation verification before implementation is adopted.** Exercise Opus→Sol and Sol→Opus, worker-only exhaustion, simultaneous exhaustion and clean suspension, five-hour and weekly reset recovery, model-specific limits, missing/stale/sparse telemetry, failed probes and backoff, shared account activity, duplicate triggers, in-flight work, failed launch/claim and oscillation prevention. Verify the existing release→claim epoch fence, worker reconciliation, owner-only Git and forced-recovery safeguards, packet completeness, and no dispatch before claim. The 2026-11-26 Opus→Sol handoff on M4 demonstrated checkpoint, release and detached successor launch with a worker identified for transfer; the owner monitored usage manually at 94%. It does not demonstrate automatic quota detection or recovery.

## 6. Host and concurrency

Host profiles, workload classes, concurrency limits, pre-flight, degradation, calibration and process cleanliness are canonical in `operating-contract.md` §6. They apply attended or not, and per host: Intel rules on the Intel, the provisional envelope on the M4. Unattended additions:

- **Pre-flight is mandatory** before every heavy spawn or class change (`node scripts/host-check.mjs preflight <class>`; exit 75 = classify the cause first (`operating-contract.md` §6.4): wait a bounded time only for temporary degradation; report sustained contention from the owner's usage and defer the work rather than wait on it; never retry in a loop).
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
- HY4 only for a narrow, explicit interpretation check (provisional scope, `model-routing.md` §11); otherwise Terra.
- Terra when a stronger bounded interpretation is worth paid capacity.
- Bunny experimentally for factual status or repo-state reading (tracked), while its route is available (unavailable since 2026-11-01).
- Sonnet only with a clear task-specific advantage that justifies Claude capacity.

The manager never polls workers itself. If observability already makes state obvious, don't create a watchdog task. **Classify** what you find as legitimate wait / process hang / harness failure / host degradation / tool outage / quota exhaustion, and log only meaningful interventions.

## 8. Verification, evidence, human-verification queue

Verification follows `model-routing.md` §5: it must earn its cost, the default is the minimum sufficient evidence (possibly none beyond the diff), escalation is regression-driven, and nonessential browser checks on a constrained host are deferred, not run (§6). Unattended runs apply the same rule: don't fill the horizon with verification the owner's review or better hardware will settle more cheaply. Use the cheapest sufficient evidence, stop once it is sufficient, and move evidence upward in compressed form. If Luna already ran a valid browser check, nobody above re-runs it merely because authority moved up. Raw artifacts stay available for anomalies and disputes. Builds belong at meaningful checkpoints. Don't broad-rerun unaffected evidence.

- **UNVERIFIED ≠ PASS. BLOCKED ≠ FAIL. NEEDS HUMAN VERIFICATION ≠ technical failure.** Static plausibility ≠ runtime proof. Build pass ≠ accepted. Worker finished ≠ accepted.
- Inspect artifacts from interrupted runs before discarding them.
- **Classify before touching product code:** app / harness / host-tool / model-quota / environment. Never change product code to work around a broken harness.
- Working behavior is a regression boundary. Gather evidence before modifying it.
- When the same check recurs across tasks or runs, note it as a candidate for a deterministic script (`model-routing.md` §8).

**Human-verification queue.** Settle without the user only what machine evidence can settle at a justified cost (§5), not exhaustively. For each genuine subjective judgment: record the item, preserve the exact artifact/state (capture path, commit, URL/state), mark it NEEDS HUMAN VERIFICATION, and continue independent work. Agents may gather and prune evidence, but they never record human acceptance. The run stops for human review only when remaining meaningful work depends on it. The human-verification sweep (§3) prunes the queue before handoff.

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

Include in any tier when present: process lessons/improvement candidates and the `routing-evidence.md` rows recorded. Don't drop important state to be brief, and don't pad a simple run with empty sections.

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

**Thinking levels.** Record the actual effort in each material `routing-evidence.md` row, with a short verdict (under / ok / over) when it is evident. The former mandatory 3-run experiment was retired on 2026-10-16 with no runs recorded; refine levels from accumulated rows instead.
