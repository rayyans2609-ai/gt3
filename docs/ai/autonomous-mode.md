# GT3 — Autonomous Mode (canonical)

Protocol for leaving GT3 unattended for hours on a **bounded objective**. It owns unattended-execution rules: supervision, continuity, quota, host protection, recovery, handoff. It does not restate other doctrine:

- Model roles, thinking levels, delegation direction, manager failover architecture → [`model-routing.md`](./model-routing.md)
- Codex slugs and syntax → [`codex-cli-invocation.md`](./codex-cli-invocation.md) (route through `scripts/codex-route.sh`)
- OpenCode free-route IDs and syntax → [`opencode-invocation.md`](./opencode-invocation.md) (route through `scripts/opencode-route.sh`)
- Product truth → `SPEC.md`. Measured history → `BUILD_LOG.md`.

**Posture: be safe, but get a dangerous amount done.** Maximize useful work inside explicit scope and safety limits. Do everything that can be safely finished without the user. When a genuine user-only judgment appears, mark it **NEEDS HUMAN VERIFICATION**, preserve the artifact, and keep going on independent work. Stop only when remaining meaningful work actually depends on the user. Never invent phases, features, refactors or cleanup to stay busy.

**Status: current evidence-based default, revisable — not permanent doctrine.** Roles, cadences, thresholds and the thinking-level table may change when real runs show better. Agents must not silently rewrite this framework mid-run; they record process failures and improvement candidates in the handoff (§12). Promotion happens deliberately after review (§13).

Host rules (§6) apply to **any** heavy GT3 work on this 8 GB Mac, attended or not.

---

## 1. Invocation

Any clear phrasing invokes the mode when the active task is clear: "Enter GT3 Autonomous Mode", "Use Autonomous Mode for this", "I WILL USE AUTONOMOUS MODE FOR THIS", "Run this autonomously".

```
Enter GT3 Autonomous Mode. Objective: <desired end state>.
Branch: <branch/worktree>  Commits: yes|no  Push: yes|no  main: forbidden
Exclusions: …   Human-review boundaries: …   Horizon: …
```

Invoked mid-task, infer objective and boundaries from the conversation and repo where safe. Ask only if the objective, branch, or a safety boundary genuinely cannot be inferred — once, before starting. The user never assigns models or commands.

| Field | Default |
|---|---|
| Branch | Current branch if not `main`; else a new worktree branch named for the objective |
| Commits / Push | yes / no |
| `main` | forbidden (no commit, merge, rebase, push) |
| Exclusions | everything not needed for the objective; no next phase unless named |
| Human-review boundaries | anything subjective: feel, visual/art direction, product intent |
| Horizon | ~4 h, or objective done, whichever is first |

The manager writes a run plan to the ledger (§11): objective, done-criteria, ordered work items, verification plan, exclusions. If done-criteria cannot be stated, the objective is not bounded enough — ask.

## 2. Manager

Opus is primary manager while available. It owns: objective, done criteria, decomposition, task ownership, worker/model routing, worker briefs, escalation/reassignment, integration, evidence reconciliation, scope, git/repo safety, host/resource decisions, quota continuity, stop/continue, and the final handoff.

- Stay managerially separate from execution. If Claude-side Sol-level work is needed, use a bounded Opus worker instance (`model-routing.md` §8), not the manager itself.
- Clerical/mechanical work goes to Luna, not Opus or Sol. Delegate to save manager attention, not for ceremony; small tasks go classify → execute → verify → finish.
- **Brief review (light, not bureaucratic).** Before dispatching a meaningful brief, check: objective, scope, context, file/system ownership, exclusions, expected evidence, acceptance condition, and fit with the resource budget (§6).
- Worker completion is not acceptance; the manager reviews diff and evidence (`model-routing.md` §6).

## 3. Independent review — the absent-user check

While the user is away, independent review stands in for them: direction/scope sanity, evidence challenge, recovery/routing challenge, final acceptance sanity. **Sonnet** is the reviewer (`high`/`xhigh`, `model-routing.md` §4), run in a context separate from the manager and used only when a second model perspective is actually useful. Opus remains manager and acceptance owner; the reviewer advises and may investigate. **The manager decides.** Overriding a material review finding is allowed, but the finding and the reason go in the ledger and the handoff. Sol-manager mode is stricter (§4).

**Cadence — when enough changed to justify it, not by clock:**
- after meaningful milestones
- roughly hourly during substantive ongoing work (skip if one healthy long task is running and nothing material changed)
- when evidence conflicts; after repeated recovery/failure; on suspected scope drift
- before a consequential change of approach; when the manager's interpretation is uncertain
- near final acceptance/handoff

Never for clerical, browser or repetitive work. Distinct from the watchdog (§7): the watchdog checks *health*; the reviewer checks *judgment*.

**Astra has no standing role in Autonomous Mode.** No periodic, milestone or final-sweep Astra reviews. Astra is invoked only when the last-resort takeover criteria in `model-routing.md` §3 are actually met: normal Opus + Sol handling has demonstrably become unreliable because the problem is globally interwoven and decomposition/coordination itself is failing. It then temporarily takes over management of that problem and hands back to Opus.

**Context to give (compact):** objective/done criteria, manager mode, branch/head, relevant constraints, work since last review, evidence, unresolved issues, failures/recovery, host/tool and quota state if relevant, proposed next action.

**Questions the reviewer tests:** Are we solving the requested problem? Does evidence support the claimed state? Is scope drifting or work unnecessary? Are app/harness/host/tool/quota failures classified correctly? Is prior evidence still valid? Is routing sensible? Over-testing or under-verifying? Continue, correct, wait, escalate, or stop?

**Reviewer's workers.** The reviewer may use read-only evidence workers such as Bunny or Luna (authority rules: `model-routing.md` §8). The manager schedules any heavy local job they need under §6, like any other heavy job.

**Reviewer unavailable** (Claude exhausted or down): defer reviews and log the gap. Don't substitute Astra. If the final sweeps can't run within the horizon, the handoff says they were not run.

**Final sweeps** (when the objective is otherwise complete and usage allows; do not redo clerical evidence):
1. **Work sweep** — material changes, evidence, integration, unresolved claims, omissions/contradictions.
2. **Human-verification sweep** — inspect every NEEDS HUMAN VERIFICATION item; drop bogus or redundant ones and anything automation already established; keep only genuine subjective judgment.

## 4. Manager continuity: Opus → Sol

If Opus nears quota/tool exhaustion (a usage warning, rate-limit notice, or known reset window) while meaningful in-scope work remains **and Codex is available**, Sol (`high`/`xhigh`; higher per `model-routing.md` §4 under heavy coordination load) may become **temporary continuity manager**. Failover, not normal architecture. Context pressure alone is not a trigger; compaction handles it.

**One manager at a time.** The ledger's manager-mode field (§11) is the lock: `opus`, `sol-starting`, `sol`, or `handback-requested`, plus the holder's PID. Nobody dispatches work while the field names someone else. Write it atomically (temp file + `mv`). Only the holder changes it, except that a returning Opus may set `handback-requested`. A lock whose holder PID is dead (identity re-checked, §6) is stale. The next manager reconciles owned processes against the ledger before reclaiming it.

**Continuation packet — keep it current, don't write it at the end.** Opus may be cut off without warning, so the ledger always holds: objective, done criteria, branch/head, working tree, commits, active/completed tasks with owners/models, evidence, verified/unverified/blocked/human-review states, owned PIDs and host state, quota/reset state, latest review findings, risks, exclusions, exact next action. If Opus is cut off before handing over, no failover happens and the ledger is the handoff.

**Entering Sol-manager mode.** Opus first quiesces its own workers: each finishes or checkpoints, and anything left running is listed as transferred. Opus then sets `sol-starting`. It launches Sol with the packet as its brief via `scripts/codex-route.sh` from the run's worktree, detached so it survives the Claude session ending. The brief includes the absolute run deadline, and Sol stops at it. Sol acknowledges by setting `sol` with its own PID. If no acknowledgement arrives within a few minutes, Opus reverts to `opus` (if still able) or the run simply stops. Sol first secures Claude-side state (in-flight work checkpointed, owned processes reconciled against the ledger), then continues bounded work. Its worker pool is Codex-side (Terra, Luna) plus the free OpenCode workers (Muse, DeepSeek, Bunny); Claude workers are assumed unavailable. Astra joins only under the `model-routing.md` §3 takeover criteria. The Sol-manager process itself is one of the ≤ 2 top-level tasks (§6), so at most one heavy worker runs beneath it.

**Sol-manager authority.** Temporary. Scope and safety rules are unchanged; Sol may not widen scope, touch `main`, push unless the invocation allows it, or start work outside the run plan. Sonnet review (§3) is unavailable with Claude, so it is deferred and the gap logged; Sol may use Bunny for first-pass diff/evidence review. **On any scope-sensitive or consequential decision, take the conservative option** (checkpoint, or record it as blocked) and leave it for Opus or the user.

**Handback.** A returning Opus reads the ledger before doing anything. If the field is `sol`, it sets `handback-requested` and dispatches nothing. Sol checks the field at each task boundary. It stops creating new work, checkpoints or finishes current bounded work quickly, writes a run-over to the ledger (work done, evidence, commits, current tasks, host/process state, quota events, review findings, unresolved items, next action), sets the field to `opus`, and exits. Opus reviews the run-over, confirms Sol and its workers have exited or been explicitly transferred, and retakes authority. If Sol died instead, the lock is stale (above). If Opus never returns within the run, Sol writes the final handoff (§12) and records the failover.

If Codex is also unavailable, there is no continuity manager: checkpoint, update the packet, stop cleanly (§5).

## 5. Quota and usage limits

Quota exhaustion is an expected autonomous state, not an implementation failure. Track whatever usage/reset information is exposed, enough to avoid dying mid-task; do not invent unavailable data or spend quota polling it.

- **Approaching a limit:** checkpoint, preserve evidence, prepare reassignment context.
- **Exhausted:** no retry loops, no identical re-briefs. Mark the route **TEMPORARILY UNAVAILABLE / BLOCKED (not FAIL)** until reset or evidence of recovery. Reroute if a capable alternative exists.
- **All heavy workers unavailable:** useful light work (§9), else wait or stop cleanly. Waiting is valid when the reset is known and within the horizon.
- **Manager exhaustion:** §4.

**Codex exhausted, Claude available** (Claude is scarcer — conserve it):
- **Reset < 30 min away:** prefer waiting, light/static work, review/planning, handoff prep over spending Claude on implementation Codex can resume shortly.
- **Otherwise: Claude-only conservation mode.** Opus stays manager. Sol-level work runs in bounded Opus worker instances. New bounded work stays on the free OpenCode workers (Muse, else DeepSeek; `model-routing.md` §3) while their routes are healthy, and otherwise goes to Sonnet. Sonnet also helps wrap lower-level work in flight. Do not spend Sonnet on brand-new trivial Luna-level tasks just to stay busy — batch or defer clerical work. Do less total work than with Codex; prioritize critical-path completion, verification continuity and state preservation; skip optional work.

The handoff reports each affected route and its reset time if known.

## 6. Host and concurrency

Local CPU/RAM/browser/build capacity is scarce. Goal: stable throughput, not parallelism. (Origin: the 2026-09-28 run hit load 500–800, 6.5-min builds and unresponsive Chrome from swap thrash while jobs overlapped.)

**Concurrency.** Count across the whole agent tree, not per level:
- **At most one heavy workload anywhere at a time.** Heavy = a build, a dev server + browser verification (one workload together), a capture sweep, a timing run, or a worker implementing with local processes.
- **At most 2 active top-level tasks**, only if both are light or one is mostly waiting. A waiting manager process, including a Sol manager, counts as a light top-level task.
- **Light work** (read-only review, log reading, remote-inference reasoning such as independent review or watchdog checks) may run beside the heavy workload only while the host stays within the degradation thresholds.
- **The deterministic host monitor** (below) never counts as a task and needs no watchdog of its own.

Never overlap heavy workloads merely for speed. Before each spawn ask: does it add a heavy local process, and can it wait? Routine browser/capture/basic verification → Luna.

**Pre-flight** before heavy work (sample twice, 10 s apart: `sysctl kern.memorystatus_vm_pressure_level`, `sysctl vm.swapusage`, `vm_stat` Pageouts/Swapouts, `top -l 1 -n 0`, `ps` for chrome/puppeteer/vite/node/codex/claude). Start only if: pressure normal; Pageouts and Swapouts unchanged across samples; CPU idle ≥ 25 %; system CPU < 50 %; no competing heavy job; no stale owned child. Swap *allocation* alone is informational. Never gate on load average or free RAM alone. Before Vite (port 5173), inspect the listener with `lsof -nP -iTCP:5173 -sTCP:LISTEN`. **Reuse it only if its process cwd is this run's checkout** (`lsof -a -p <pid> -d cwd`). Otherwise start an owned server on a free port (`--port <n> --strictPort`) and pass that exact URL to the harness, because a server from another worktree yields false evidence. Record the tested commit and tree state with each piece of runtime evidence.

**Host monitor during heavy work.** The watchdog (§7) is too slow to catch thrashing. While a heavy workload runs, a deterministic shell loop owned by the run samples pressure, Pageouts/Swapouts and CPU every ~1–2 min to the ledger and applies the degradation rule below. It is not a model.

**Degradation.** If pressure leaves normal, Pageouts/Swapouts rise, idle < 15 % or system CPU > 65 % for two consecutive samples, or responsiveness collapses: stop spawning, checkpoint, drop to one task, clean owned stale processes, recover, re-run pre-flight. Never escalate by launching stronger models in parallel under pressure.

**Extended overload.** Stop heavy work; continue useful light/static work; preserve state and evidence; reassess periodically; don't hammer the machine; when light work is exhausted, wait. No fake memory fixes, cache purges or daemon manipulation.

**Process cleanliness — continuously, not only at the end.** At meaningful task boundaries (especially after browser/build/dev-server work) inspect the owned process tree, clean obsolete owned children, avoid duplicate Vite/browser workers, keep only what is still needed. **Kill only proven owned PIDs/PPIDs** (tracked when started), and re-check identity (command + start time via `ps -o lstart,command -p <pid>`) immediately before, because PIDs get reused. Terminate gracefully (TERM before KILL). Never kill by name; never touch unknown macOS/root processes, unrelated Chrome/VS Code, or Remote Control/network/session processes. An unowned stray is reported in the handoff, not killed.

## 7. Watchdog

Every active task, manager work included, gets a watchdog (except the host monitor and the watchdog itself; no recursion). It judges progress. Host safety is the monitor's job (§6). **Luna is the routine watchdog worker** for lightweight progress/process/health checks, at a higher level when code/log/evidence interpretation is needed (`model-routing.md` §4). The manager receives the result instead of polling. Where a deterministic check answers the question (PID alive, log still growing, output file advancing), use it and skip the model. When Codex is unavailable, the watchdog falls to deterministic checks or a Sonnet `low`/`medium` check.

**Adaptive timing** (tune to expected duration; not a kill timer): < 30 min task → ~15–20 min if progress isn't already clear; 30–90 min → ~30 min; > 90 min → ~45–60 min unless risk or host state justifies earlier.

**Evaluate:** real progress, evidence/log movement, host health, stuck vs legitimate wait, loops/retries, scope creep, whether to decompose/reroute, marginal value. **Classify:** legitimate wait / process hang / harness failure / host degradation / tool outage / quota exhaustion. Log only meaningful interventions.

## 8. Verification, evidence, human-verification queue

Cheapest sufficient evidence first: static/syntax → targeted deterministic check → build → browser smoke → full browser regression → screenshots/captures → timing/performance. Builds only at meaningful checkpoints. Don't broad-rerun unaffected evidence.

- **UNVERIFIED ≠ PASS. BLOCKED ≠ FAIL. NEEDS HUMAN VERIFICATION ≠ technical failure.** Static plausibility ≠ runtime proof. Build pass ≠ accepted. Worker finished ≠ accepted.
- Inspect artifacts from interrupted runs before discarding them.
- **Classify before touching product code:** app / harness / host-tool / model-quota / environment. Never change product code to work around a broken harness.
- Working behavior is a regression boundary; evidence before modification.

**Human-verification queue.** Do everything machine-verifiable without the user. For each genuine subjective judgment: record the item, preserve the exact artifact/state (capture path, commit, URL/state), mark NEEDS HUMAN VERIFICATION, continue independent work. Agents may gather and prune evidence; they never record human acceptance. The run stops for human review only when remaining meaningful work depends on it. The final human-verification sweep (§3) prunes the queue.

## 9. Recovery, stop conditions, light work

**Recover without asking:** retry a transient deterministic command (after classifying the failure); fix a proven harness bug; restart an owned Vite/Puppeteer/browser process; reroute a worker; heavy → light fallback; checkpoint at a model/tool limit; wait/retry a temporarily unavailable tool; independent evidence review (§3); correct stale claims. No blind retries (`model-routing.md` §6).

**Stop and checkpoint — do not expand — when:** scope would materially change; product or major architecture is ambiguous; a destructive action is required; `main` or shared history needs an unauthorized change; evidence is irreconcilable; recovery has stopped yielding progress; the next phase is outside scope; all remaining work needs human judgment.

**Stop discipline:** objective achieved; all machine-verifiable work complete; only genuine human judgment remains; or remaining work is blocked and useful fallback exhausted. Do not invent a next phase, unrelated cleanup, extra features, broad refactors, speculative architecture, or unnecessary tests.

**Light-work fallback** (when heavy work is blocked): static inspection, evidence reconciliation, diff review, verification-script prep, docs/implementation consistency, stale-claim review, handoff prep, next-step planning, worker briefs with manager review, Opus/reviewer read-only reasoning. No speculative cleanup. When useful light work is exhausted, wait cleanly.

## 10. Git safety

Work on the specified branch/worktree. Commit coherent, reviewable checkpoints (if allowed); push only if allowed; `main` untouched unless explicitly permitted; no amend/rebase/shared-history rewrite without authorization. Codex and OpenCode jobs launch from a dedicated worktree, never the user's main checkout. `SPEC.md` changes only for genuine product/runtime truth.

**Before stopping confirm:** branch/head, working tree, commits, `main` state, owned runtime cleanup, evidence preserved.

## 11. Run ledger

One compact file in the job temp dir (`$CLAUDE_JOB_DIR/tmp`) or another git-excluded path — never tracked docs mid-run. It doubles as the continuation packet and the manager lock (§4), so keep it current at every task boundary. Contents: objective/done criteria, manager-mode field + holder PID (§4), branch/head, active tasks (owner/model, state, last evidence), owned PIDs, host state, quota/reset constraints, last watchdog, last independent review/findings, commits, human-verification queue, next action.

## 12. Final handoff

Run the two final review sweeps (§3) first when available and worth the usage. Then report, keeping each category separate (implemented ≠ verified ≠ accepted):

```
Autonomous Mode handoff
Status:             <done | partial | stopped: reason>     Manager mode / failovers: <…>
Branch / HEAD:      <branch> @ <hash>   Tree: <…>   main: <unchanged | state>
Completed:          …
Verified:           <claim → evidence>
Unverified:         …
Blocked:            <item → blocker/route + reset if known>
Needs human verification: <item → artifact/state to inspect>
Changes / commits:  <hash — subject>
Quota / tool events:…
Host / process events + cleanup: …
Watchdog interventions: …
Material review findings: …
Process lessons / improvement candidates: …
Thinking-level findings: <experiment runs only, §13>
Unresolved risks:   …
Exact next action:  …
```

## 13. Learning and promotion

Do not mutate canonical doctrine during a run unless explicitly authorized. After the run, promote only measured, recurring lessons, deliberately, to the narrowest home:

| Lesson | Home |
|---|---|
| Durable project-wide principle / pointer | `GT3_MASTER_CONTEXT.md` |
| Model roles, thinking levels, routing, delegation, failover | `model-routing.md` |
| Unattended protocol, host thresholds, recovery, cadences | this file |
| Codex syntax | `codex-cli-invocation.md` |
| Measured run evidence | `BUILD_LOG.md` |
| Product/runtime constraint | `SPEC.md` |

**Thinking-level experiment (`model-routing.md` §4).** For the next 2–3 Autonomous Mode runs, record for *material* tasks only: model, thinking level, task type, whether the level was underpowered / appropriate / excessive, and its impact on quality, speed, retries/rework, spawning/coordination and quota. Put a concise **Thinking-Level Findings** section in each handoff; no per-command telemetry. After 2–3 runs, recommend rule refinements from that evidence.

*Experiment status: 0 of 3 runs recorded.* Update this line when a run's findings are reviewed.
