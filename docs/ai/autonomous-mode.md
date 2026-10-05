# GT3 — Autonomous Mode (canonical)

Protocol for leaving GT3 unattended for hours on a **bounded objective**. It **extends** [`model-routing.md`](./model-routing.md) for unattended operation. The routing, delegation, context, review, verification and quota principles there apply unchanged, and nothing here creates a separate or heavier architecture. This file owns only what is specific to running unattended: supervision, continuity, quota trajectory, host protection, recovery, ledger and handoff.

- Model roles, quota modes, thinking levels, delegation direction → `model-routing.md`
- Codex slugs and syntax → [`codex-cli-invocation.md`](./codex-cli-invocation.md) (route through `scripts/codex-route.sh`)
- OpenCode free-route IDs and syntax → [`opencode-invocation.md`](./opencode-invocation.md) (route through `scripts/opencode-route.sh`)
- Product truth → `SPEC.md`. Measured history → `BUILD_LOG.md`. Model-work evidence → [`routing-evidence.md`](./routing-evidence.md).

**Posture: be safe, but get a dangerous amount done.** Optimize for **maximum useful accepted progress during the unattended horizon**, not maximum continuous AI activity. Do everything that can be safely finished without the user. When a genuine user-only judgment appears, mark it **NEEDS HUMAN VERIFICATION**, preserve the artifact, and continue independent work. **Waiting or stopping cleanly is a valid optimization** (§9). Never invent phases, features, refactors, reviews or cleanup to look busy.

The mode protects: product intent, scope, repo safety, host stability, quota, manager continuity, evidence quality, human-only judgment, clean recovery, and a useful handoff.

**Status: current evidence-based default, revisable, not permanent doctrine.** Agents must not silently rewrite this framework mid-run. They record process lessons in the handoff (§12), and promotion is deliberate (§13).

Host rules (§6) apply to **any** heavy GT3 work on this 8 GB Mac, attended or not.

---

## 1. Invocation

Any clear phrasing invokes the mode when the active task is clear: "Enter GT3 Autonomous Mode", "Use Autonomous Mode for this", "I WILL USE AUTONOMOUS MODE FOR THIS", "Run this autonomously".

```
Enter GT3 Autonomous Mode. Objective: <desired end state>.
Branch: <branch/worktree>  Commits: yes|no  Push: yes|no  main: forbidden
Exclusions: …   Human-review boundaries: …   Horizon: …
```

If invoked mid-task, infer the objective and boundaries from the conversation and repo where safe. Ask only if the objective, branch or a safety boundary genuinely cannot be inferred, and ask once, before starting. The user never assigns models or commands.

| Field | Default |
|---|---|
| Branch | Current branch if not `main`; else a new worktree branch named for the objective |
| Commits / Push | yes / no |
| `main` | forbidden (no commit, merge, rebase, push) |
| Exclusions | everything not needed for the objective; no next phase unless named |
| Human-review boundaries | anything subjective: feel, visual/art direction, product intent |
| Horizon | ~4 h, or objective done, whichever is first |

The manager writes a run plan to the ledger (§11): objective, done criteria, work items, verification plan, exclusions. If done criteria cannot be stated, the objective is not bounded enough, so ask.

## 2. Manager

Opus is primary manager while available, with the role and Anchor Task allowance in `model-routing.md` §11. It owns: objective, done criteria, decomposition, routing, briefs, escalation, integration, evidence reconciliation, scope, git/repo safety, host/resource decisions, quota mode, stop/continue, and the handoff.

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

**Final acceptance is conditional.** When evidence is strong, integration was straightforward, no contradictions occurred, blast radius is low and manager confidence is high, the manager accepts directly. Independent final review (Astra included) happens only when the run's actual risk warrants it. The **human-verification sweep** is a cheap manager pass, not a model review. Before handoff, inspect every NEEDS HUMAN VERIFICATION item, drop bogus or redundant ones and anything automation already settled, and keep only genuine subjective judgment.

## 4. Manager continuity: Opus → Sol

If Opus nears quota/tool exhaustion (a usage warning, rate-limit notice, or known reset window) while meaningful in-scope work remains **and Codex is available**, Sol (`high`/`xhigh`; higher per `model-routing.md` §12 under heavy coordination) may become **temporary continuity manager**. This is failover, not normal architecture. Context pressure alone is not a trigger, because compaction handles it.

**One manager at a time.** The ledger's manager-mode field (§11) is the lock: `opus`, `sol-starting`, `sol`, or `handback-requested`, plus the holder's PID. Nobody dispatches while the field names someone else. Write it atomically (temp file + `mv`). Only the holder changes it, except that a returning Opus may set `handback-requested`. A lock whose holder PID is dead (identity re-checked, §6) is stale, and the next manager reconciles owned processes against the ledger before reclaiming it.

**Continuation packet.** Opus can be cut off without warning, so the ledger always holds what the *next manager actually needs*, updated on the events in §11:

- objective and done criteria
- branch/head, relevant working-tree state, meaningful commits
- active and completed tasks with their owners, and which work is accepted or unaccepted
- important evidence
- material quota/reset state and important host/process state (owned PIDs)
- unresolved risks, exclusions, exact next actions

No transcripts. If Opus is cut off before handing over, no failover happens and the ledger is the handoff.

**Entering Sol-manager mode.** Opus quiesces its own workers first: each finishes or checkpoints, and anything still running is listed as transferred. Opus sets `sol-starting` and launches Sol with the packet as its brief via `scripts/codex-route.sh` from the run's worktree, detached so it survives the Claude session. The brief includes the absolute run deadline, and Sol stops at it. Sol acknowledges by setting `sol` with its own PID. If no acknowledgement arrives within a few minutes, Opus reverts to `opus` (if still able), or the run simply stops. Sol secures Claude-side state first, then continues bounded work. Its pool is Codex-side (Terra, Luna) plus the free OpenCode workers (Muse, DeepSeek, Bunny). Claude workers are assumed unavailable. Astra never replaces the manager. On a strong trigger (`model-routing.md` §11), for example a consequential scope, architecture or recovery call, Sol may invoke Astra to challenge or supervise its decision. Astra advises, and the conservative-option rule below still governs. **Sol manages with the same scarcity-adjusted, net-leverage routing**, not a copy of Claude-style management in another model family: it can do coupled work itself and delegates only separable work. The Sol-manager process is one of the ≤ 2 top-level tasks (§6), so at most one heavy worker runs beneath it.

**Sol-manager authority.** Temporary. Scope and safety rules are unchanged. Sol may not widen scope, touch `main`, push unless the invocation allows it, or start work outside the run plan. **On any scope-sensitive or consequential decision, take the conservative option** (checkpoint, or record it as blocked) and leave it for Opus or the user.

**Handback.** A returning Opus reads the ledger before doing anything. If the field is `sol`, it sets `handback-requested` and dispatches nothing. Sol checks the field at each task boundary. It stops creating work, checkpoints or finishes current bounded work quickly, writes a concise run-over (work done, evidence, commits, active tasks, host/process state, quota events, unresolved items, next action), sets the field to `opus`, and exits. Opus consumes the run-over without redoing established work, confirms Sol and its workers have exited or been explicitly transferred, and retakes authority. If Sol died instead, the lock is stale (above). If Opus never returns within the run, Sol writes the handoff (§12) and records the failover.

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

The handoff reports each affected route and its reset time if known.

## 6. Host and concurrency

Local CPU/RAM/browser/build capacity is scarce. The goal is stable throughput, not parallelism. (Origin: the 2026-09-28 run hit load 500–800, 6.5-min builds and unresponsive Chrome from swap thrash while jobs overlapped.)

**Concurrency.** Count across the whole agent tree, not per level:
- **At most one heavy workload anywhere at a time.** Heavy means a build, a dev server + browser verification (one workload together), a capture sweep, a timing run, or a worker implementing with local processes.
- **At most 2 active top-level tasks**, and only if both are light or one is mostly waiting. A waiting manager process, including a Sol manager, counts as a light top-level task.
- **Light work** (read-only review, log reading, remote-inference reasoning) may run beside the heavy workload only while the host stays within the degradation thresholds.
- **The deterministic host monitor** (below) never counts as a task and needs no watcher of its own.

Never overlap heavy workloads merely for speed. Before each spawn, ask whether it adds a heavy local process and whether it can wait.

**Pre-flight** before heavy work. Sample twice, 10 s apart: `sysctl kern.memorystatus_vm_pressure_level`, `sysctl vm.swapusage`, `vm_stat` Pageouts/Swapouts, `top -l 1 -n 0`, and `ps` for chrome/puppeteer/vite/node/codex/claude. Start only if pressure is normal, Pageouts and Swapouts are unchanged across samples, CPU idle is ≥ 25 %, system CPU is < 50 %, no heavy job competes, and no stale owned child remains. Swap *allocation* alone is informational. Never gate on load average or free RAM alone.

Before starting Vite (port 5173), inspect the listener with `lsof -nP -iTCP:5173 -sTCP:LISTEN`. **Reuse it only if its process cwd is this run's checkout** (`lsof -a -p <pid> -d cwd`). Otherwise start an owned server on a free port (`--port <n> --strictPort`) and pass that exact URL to the harness, because a server from another worktree yields false evidence. Record the tested commit and tree state with each piece of runtime evidence.

**Host monitor during heavy work.** While a heavy workload runs, a deterministic shell loop owned by the run samples pressure, Pageouts/Swapouts and CPU every ~1–2 min to the ledger and applies the degradation rule below. It is not a model.

**Degradation.** If pressure leaves normal, Pageouts/Swapouts rise, idle < 15 % or system CPU > 65 % for two consecutive samples, or responsiveness collapses: stop spawning, checkpoint, drop to one task, clean owned stale processes, recover, and re-run pre-flight. Never escalate by launching stronger models in parallel under pressure.

**Extended overload.** Stop heavy work, continue useful light/static work, preserve state and evidence, and reassess at intervals without hammering the machine. When light work is exhausted, wait. No fake memory fixes, cache purges or daemon manipulation.

**Process cleanliness, continuously and not only at the end.** At meaningful task boundaries (especially after browser/build/dev-server work), inspect the owned process tree, clean obsolete owned children, avoid duplicate Vite/browser workers, and keep only what is still needed. **Kill only proven owned PIDs/PPIDs** (tracked when started), and re-check identity (command + start time via `ps -o lstart,command -p <pid>`) immediately before killing, because PIDs get reused. Terminate gracefully (TERM before KILL). Never kill by name. Never touch unknown macOS/root processes, unrelated Chrome/VS Code, or Remote Control/network/session processes. An unowned stray is reported in the handoff, not killed.

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
- Luna for mechanical liveness and known health checks.
- Muse when the status needs modest interpretation or light evidence synthesis.
- Terra when a stronger bounded interpretation is worth paid capacity.
- Bunny experimentally for factual status or repo-state reading (tracked).
- Sonnet only with a clear task-specific advantage that justifies Claude capacity.

The manager never polls workers itself. If observability already makes state obvious, don't create a watchdog task. **Classify** what you find as legitimate wait / process hang / harness failure / host degradation / tool outage / quota exhaustion, and log only meaningful interventions.

## 8. Verification, evidence, human-verification queue

Verification depth and evidence reuse follow `model-routing.md` §5. Use the cheapest sufficient evidence, stop once it is sufficient, and move evidence upward in compressed form. If Luna already ran a valid browser check, nobody above re-runs it merely because authority moved up. Raw artifacts stay available for anomalies and disputes. Builds belong at meaningful checkpoints. Don't broad-rerun unaffected evidence.

- **UNVERIFIED ≠ PASS. BLOCKED ≠ FAIL. NEEDS HUMAN VERIFICATION ≠ technical failure.** Static plausibility ≠ runtime proof. Build pass ≠ accepted. Worker finished ≠ accepted.
- Inspect artifacts from interrupted runs before discarding them.
- **Classify before touching product code:** app / harness / host-tool / model-quota / environment. Never change product code to work around a broken harness.
- Working behavior is a regression boundary. Gather evidence before modifying it.
- When the same check recurs across tasks or runs, note it as a candidate for a deterministic script (`model-routing.md` §8).

**Human-verification queue.** Do everything machine-verifiable without the user. For each genuine subjective judgment: record the item, preserve the exact artifact/state (capture path, commit, URL/state), mark it NEEDS HUMAN VERIFICATION, and continue independent work. Agents may gather and prune evidence, but they never record human acceptance. The run stops for human review only when remaining meaningful work depends on it. The human-verification sweep (§3) prunes the queue before handoff.

## 9. Recovery, stop conditions, light work

**Recover without asking:** retry a transient deterministic command (after classifying the failure); fix a proven harness bug; restart an owned Vite/Puppeteer/browser process; reroute a worker; fall back from heavy to light work; checkpoint at a model/tool limit; wait for or retry a temporarily unavailable tool; correct stale claims. Routine recovery is the manager's call. Operational interruptions (quota, worker failure, reroute, host limits) are decided inside the run, never escalated to the user. No blind retries (`model-routing.md` §6).

**Stop and checkpoint, do not expand, when:** scope would materially change; product or major architecture is ambiguous; a destructive action is required; `main` or shared history needs an unauthorized change; evidence is irreconcilable; recovery has stopped yielding progress; the next phase is outside scope; or all remaining work needs human judgment.

**Deliberate inactivity is valid.** Wait or stop cleanly when that is the most efficient action, for example when:
- remaining work is low value;
- the needed resources are scarce and a reset is near;
- useful light work is exhausted;
- everything left needs user judgment;
- further activity would only create speculative cleanup or scope creep.

A clean checkpoint can be the optimal action. Stop when the objective is achieved, all machine-verifiable work is complete, only genuine human judgment remains, or remaining work is blocked and useful fallback is exhausted.

**Light-work fallback** (when heavy work is blocked): static inspection, evidence reconciliation, committed-diff review where justified, verification-script preparation, docs-vs-implementation consistency, stale-claim identification, handoff preparation, bounded next-step planning, factual repo reconnaissance, worker-brief preparation. Never speculative refactors, unrelated cleanup, new features or unnecessary documentation. When useful light work is exhausted, wait or stop.

## 10. Git safety

Work on the specified branch/worktree. Commit coherent, reviewable checkpoints (if allowed), and push only if allowed. Leave `main` untouched unless explicitly permitted. No amend/rebase/shared-history rewrite without authorization. Codex and OpenCode jobs launch from a dedicated worktree, never the user's main checkout. `SPEC.md` changes only for genuine product/runtime truth.

**Before stopping, confirm:** branch/head, working tree, commits, `main` state, owned runtime cleanup, evidence preserved.

## 11. Run ledger

Keep one compact file in the job temp dir (`$CLAUDE_JOB_DIR/tmp`) or another git-excluded path, never in tracked docs mid-run. It is the run plan, the continuation packet (§4) and the manager lock. It holds: objective/done criteria, manager-mode field + holder PID, branch/head, tasks (owner/model, state, last evidence), owned PIDs, host state, quota mode/reset state, review findings and overrides, commits, the human-verification queue, and the next action.

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
