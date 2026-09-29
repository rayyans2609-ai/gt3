# GT3 — Autonomous Mode (canonical)

Protocol for leaving GT3 unattended for hours on a **bounded objective**. It owns unattended-execution rules: supervision, continuity, quota, host protection, recovery, handoff. It does not restate other doctrine:

- Model roles, thinking levels, delegation direction, manager failover architecture → [`model-routing.md`](./model-routing.md)
- Codex slugs and syntax → [`codex-cli-invocation.md`](./codex-cli-invocation.md) (route through `scripts/codex-route.sh`)
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

**Defaults the prompt never needs to restate:**
- Opus is primary manager.
- For any substantial unattended run, **arm continuity at the start** (§4): the controller at `opus-primary`, the continuation packet written, the watcher started with its cursor at the timeline's end, and `quota.json` seeded. Opus then keeps the packet current.
- Sol `high`/`xhigh` is the failover manager.
- A separate Sol `xhigh` session reviews non-trivial briefs (§2).
- Luna plus deterministic sampling is the watchdog (§7).
- Astra is event-only (§3).
- Manager failover, quota routing and host scheduling are operational and never user decisions.

The readiness bar is **10–12 hours unattended with near-maximum useful work**. Autonomy work beyond that bar is deferred unless real runs show it would otherwise waste hours.

## 2. Manager

Opus is primary manager while available. It owns: objective, done criteria, decomposition, task ownership, worker/model routing, worker briefs, escalation/reassignment, integration, evidence reconciliation, scope, git/repo safety, host/resource decisions, quota continuity, stop/continue, and the final handoff.

- Stay managerially separate from execution. If Claude-side Sol-level work is needed, use a bounded Opus worker instance (`model-routing.md` §8), not the manager itself.
- Clerical/mechanical work goes to Luna, not Opus or Sol. Delegate to save manager attention, not for ceremony; small tasks go classify → execute → verify → finish.
- **Brief self-check (light, not bureaucratic).** Before dispatching a meaningful brief, the author checks: objective, scope, context, file/system ownership, exclusions, expected evidence, acceptance condition, and fit with the resource budget (§6).
- **Independent brief verification (non-trivial implementation work).** Before execution, where practical, every written brief for non-trivial implementation, debugging or verification-design work gets an independent sanity check from **GPT-6 Sol `xhigh`**, read-only. It is not required for trivial, clerical or purely deterministic work.
  - **What it checks:** missing requirements, unsupported assumptions that should be measured, contradictions with `SPEC.md` / architecture / repo state / phase ownership, scope creep into other phases, missing dependencies and regression risks, cross-task interactions, weak or misleading verification, subjective acceptance leaking to agents, and needless complexity or decomposition errors.
  - **What it returns:** `PASS`, or `PATCH BRIEF` with the exact material changes. The author patches the brief before dispatch and applies the same fix to every dependent brief, so the gap is not inherited.
  - **Briefs already running:** review them immediately; don't restart them just for the review. Carry material corrections into the active task if a safe channel exists. Otherwise make them required checks in that task's acceptance review or follow-up, and in all dependent tasks. Record each correction in the ledger (§11).
  - **Keep the roles distinct:** brief author, independent reviewer, implementation worker, and acceptance reviewer. No model silently "independently" verifies its own brief. When Sol is the manager (§4), the reviewer is still a **separate** Sol `xhigh` session, never the manager's own session. That gives procedural independence, but same-model errors can correlate, so record it.
  - **Escalation:** only to Astra, only for a genuinely serious cross-system, architectural, contradictory or decomposition-level problem, with the repo state, evidence, assumptions and exact question. Routine patches never escalate.
  - **Heaviness:** the reviewer is light work (§6): read-only, no builds, browsers or dev servers.
- Worker completion is not acceptance; the manager reviews diff and evidence (`model-routing.md` §6).

## 3. Astra — the absent-user supervisory layer

While the user is away, Astra is the closest thing to them: independent senior review, direction/scope sanity, evidence challenge, recovery/routing challenge, final acceptance sanity. Opus remains manager; Astra advises, and may investigate. **The manager decides.** Overriding a material Astra finding is allowed, but the finding and the reason go in the ledger and the handoff. Sol-manager mode is stricter (§4).

**Event-triggered only, never by clock.** Astra is a token-expensive senior co-manager and escalation layer. Invoke it only for a concrete unresolved judgment problem:
- conflicting evidence;
- a suspect decomposition;
- repeated competent failure;
- scope or product-boundary risk;
- a consequential integration or architecture decision beyond the manager's confidence;
- a serious issue escalated by the Sol `xhigh` brief reviewer.

There is no periodic cadence, no mandatory milestone review, and no automatic final sweep. Astra is not the brief reviewer, not the watchdog and not a worker. It never takes run ownership or substitutes for human acceptance.

Never for clerical, browser or repetitive work. Distinct from the watchdog (§7): the watchdog checks *health*; Astra checks *judgment*.

**Context to give (compact):** objective/done criteria, manager mode, branch/head, relevant constraints, work since last review, evidence, unresolved issues, failures/recovery, host/tool and quota state if relevant, proposed next action.

**Questions Astra tests:** Are we solving the requested problem? Does evidence support the claimed state? Is scope drifting or work unnecessary? Are app/harness/host/tool/quota failures classified correctly? Is prior evidence still valid? Is routing sensible? Over-testing or under-verifying? Continue, correct, wait, escalate, or stop?

**Astra's workers.** Astra may use bounded review/investigation workers (authority rules: `model-routing.md` §8). The manager schedules any heavy local job they need under §6, like any other heavy job.

**Astra unavailable** (Codex exhausted or down): defer reviews and log the gap. Don't substitute a Claude worker as "Astra" by default, because Claude is scarcer. If the final sweeps can't run within the horizon, the handoff says they were not run.

**Optional final sweeps** (only when a concrete judgment problem remains at handoff and usage allows; do not redo clerical evidence):
1. **Work sweep** — material changes, evidence, integration, unresolved claims, omissions/contradictions.
2. **Human-verification sweep** — inspect every NEEDS HUMAN VERIFICATION item; drop bogus or redundant ones and anything automation already established; keep only genuine subjective judgment.

## 4. Manager continuity: Opus → Sol

[CORE] **Failover must not depend on Opus.** Claude gives **no advance warning**. Session limits are visible only after the fact: `quotaLimits.status: "rejected"` in the transcript, and `state: "blocked"` with "hit your session limit · resets <time>" in the job's `timeline.jsonl`/`state.json`. Background processes survive the block. So every substantial unattended run **arms continuity at the start**. The mechanism is `scripts/autonomy/` (see its `README.md` and `ARMED.md`):
- **Controller** (`controller.sh`): the sole writer of `RUN_DIR/manager.json`. It uses a kernel `fcntl` lock and a generation counter; modes are `opus-primary → sol-starting → sol-continuity → handback-requested → opus-primary`. Credentials (`GT3_MANAGER_ID`/`GT3_MANAGER_GEN`) fail closed. It admits every routed mutation: dispatch through `codex-route.sh`, guarded repository commands, process control, and `ctl write`. Only `failover` and `handback` transfer authority. Exactly one manager can admit actions. The guarantee is **cooperative** for paths that bypass the controller (raw shell writes, direct CLI calls), so managers route every mutation through it.
- **Watcher** (`continuity-watch.sh`): detached, deterministic, zero model tokens while idle. It fails over on a new limit-text `blocked` timeline entry, read through a durable inode and byte cursor so historical entries never trigger. User-question `blocked` never triggers. A staleness-based trigger exists but stays **opt-in**: a quiet Opus waiting on workers looks like a dead one. It checks that a non-empty packet exists **before** transferring ownership, and it enforces the run deadline.
- **Takeover:** the watcher launches a fresh Sol manager from `sol-takeover.md` plus the packet. It runs at `high`, or `xhigh` for integration, recovery or conflicting-evidence work. It runs in the run's worktree and uses the fenced route. A stored session ID reserves no quota; priming is optional and not the default.

[CORE] **The Sol manager fully inherits the manager role**: plan, briefs, routing, dispatch, integration, operational decisions, verification states, stop/continue and handback.
- **Delegation:** it stays separate from bulk execution and is exempt from downward-only delegation. It launches separate Sol workers for serious engineering, Terra for bounded implementation, and Luna for mechanical, browser and status work, plus a separate Sol `xhigh` reviewer. It escalates to Astra only as §3 allows.
- **Workers and events:** workers carry task IDs and bounded permissions, never manager credentials. Events (worker exits and completions) are queued, delivered at least once and handled idempotently. Sol ends each turn after dispatching; the watcher resumes it on the next event, including during `handback-requested`.
- **Takeover procedure:** Sol reads the packet, then verifies branch, HEAD, working tree, processes and pending actions. **Live repo and runtime truth beats the packet.** Healthy running workers are inherited, never killed or restarted. Completed reviews are not re-run, and human gates are unchanged.

[CORE] **Continuation packet** (`RUN_DIR/continuity.md`, template in `scripts/autonomy/continuity.md`): the active manager keeps it current at meaningful transitions: dispatches, completions, brief and review changes, commits, plan changes, gates. Never write it only at the end. It holds:
- objective;
- deadline;
- worktree and branch boundaries and permissions;
- HEAD and tree state;
- task sequence and **exact next action**;
- workers;
- briefs and review status;
- implemented, verified and human-review states;
- gaps;
- host and quota facts;
- user-owned decisions.

[CORE] **Handback.** A returning Opus calls `ctl request-handback`; it cannot seize ownership. At its next clean checkpoint, Sol stops creating broad work, finishes or checkpoints bounded work, refreshes the packet, calls `ctl checkpoint`, then `ctl handback` once pending actions clear. Opus reviews the run-over and continues. There is no automatic post-reset Opus wake; the user's next message, or a bounded waker if one is ever verified, brings Opus back. Sol continues safely without it.

If Codex is also unavailable, the watcher records it, waits until the route's `resetAt` (which means eligible to retry, not confirmed capacity) and retries within the deadline. It never guesses.

## 5. Quota and usage limits

Quota exhaustion is an expected autonomous state, not an implementation failure. Track whatever usage/reset information is exposed, enough to avoid dying mid-task; do not invent unavailable data or spend quota polling it.

- **Quota state** lives in `RUN_DIR/quota.json`, per route (`claude:opus`, `codex:gpt-6-sol`, …). Record only what was observed or reported, with `source` and `observedAt`; unknown stays unknown. User snapshots are recorded as `source: user`. When a user report and a CLI observation disagree, keep both: the observed CLI rejection governs dispatch, and the cause stays `UNKNOWN` until distinguished. Managers read it at meaningful checkpoints. Never poll models for quota.
- **Approaching a limit** (only if a real signal is exposed): hand off proactively through the controller. Otherwise rely on the armed failover (§4).
- **Exhausted:** no retry loops, no identical re-briefs. Mark the route **TEMPORARILY UNAVAILABLE / BLOCKED (not FAIL)** until reset or evidence of recovery. Reroute if a capable alternative exists.
- **All heavy workers unavailable:** useful light work (§9), else wait or stop cleanly. Waiting is valid when the reset is known and within the horizon.
- **Manager exhaustion:** §4.

**Codex exhausted, Claude available** (Claude is scarcer — conserve it):
- **Reset < 30 min away:** prefer waiting, light/static work, review/planning, handoff prep over spending Claude on implementation Codex can resume shortly.
- **Otherwise: Claude-only conservation mode.** Opus stays manager. Sol-level work runs in bounded Opus worker instances; Sonnet takes new Terra-level work and helps wrap lower-level work in flight. Do not spend Sonnet on brand-new trivial Luna-level tasks just to stay busy — batch or defer clerical work. Do less total work than with Codex; prioritize critical-path completion, verification continuity and state preservation; skip optional work.

The handoff reports each affected route and its reset time if known.

## 6. Host and concurrency

Local CPU/RAM/browser/build capacity is scarce. Goal: stable throughput, not parallelism. (Origin: the 2026-09-28 run hit load 500–800, 6.5-min builds and unresponsive Chrome from swap thrash while jobs overlapped.)

**Concurrency.** Count across the whole agent tree, not per level:
- **At most one heavy workload anywhere at a time.** Heavy = a build, a dev server + browser verification (one workload together), a capture sweep, a timing run, or a worker implementing with local processes.
- **At most 2 active top-level tasks**, only if both are light or one is mostly waiting. A waiting manager process, including a Sol manager, counts as a light top-level task.
- **Light work** (read-only review, log reading, remote-inference reasoning such as Astra or watchdog checks) may run beside the heavy workload only while the host stays within the degradation thresholds.
- **The deterministic host monitor** (below) never counts as a task and needs no watchdog of its own.

Never overlap heavy workloads merely for speed. Before each spawn ask: does it add a heavy local process, and can it wait? Routine browser/capture/basic verification → Luna.

**Pre-flight** before heavy work (sample twice, 10 s apart: `sysctl kern.memorystatus_vm_pressure_level`, `sysctl vm.swapusage`, `vm_stat` Pageouts/Swapouts, `top -l 1 -n 0`, `ps` for chrome/puppeteer/vite/node/codex/claude). Start only if: pressure normal; Pageouts and Swapouts unchanged across samples; CPU idle ≥ 25 %; system CPU < 50 %; no competing heavy job; no stale owned child. Swap *allocation* alone is informational. Never gate on load average or free RAM alone. Before Vite (port 5173), inspect the listener with `lsof -nP -iTCP:5173 -sTCP:LISTEN`. **Reuse it only if its process cwd is this run's checkout** (`lsof -a -p <pid> -d cwd`). Otherwise start an owned server on a free port (`--port <n> --strictPort`) and pass that exact URL to the harness, because a server from another worktree yields false evidence. Record the tested commit and tree state with each piece of runtime evidence.

**Host monitor during heavy work.** The watchdog (§7) is too slow to catch thrashing. While a heavy workload runs, a deterministic shell loop owned by the run samples pressure, Pageouts/Swapouts and CPU every ~1–2 min to the ledger and applies the degradation rule below. It is not a model.

**Degradation (during a heavy run; revised 2026-09-29 by independent review from browser-workload evidence).** Sample every **30 s**.
- **Memory:** stop on the **first** sample showing pressure above normal or **any new swapouts**.
- **CPU:** give browser launch and asset decode a **45 s CPU-only grace window**. After it, stop if idle < 15 % or system CPU > 65 % on **two consecutive** samples.
- **Responsiveness:** stop immediately if it collapses.
- **Pageouts:** record them, but they are not a stop signal on their own (page-cache flushes occur in normal browser runs).

A stopped run is **incomplete**, never a product failure. Timings overlapping swapouts are *memory-affected*, not clean app evidence. On a stop: stop spawning, checkpoint, drop to one task, clean owned stale processes, recover, re-run pre-flight. Never escalate by launching stronger models in parallel under pressure.

**Extended overload.** Stop heavy work; continue useful light/static work; preserve state and evidence; reassess periodically; don't hammer the machine; when light work is exhausted, wait. No fake memory fixes, cache purges or daemon manipulation.

**Process cleanliness — continuously, not only at the end.** At meaningful task boundaries (especially after browser/build/dev-server work) inspect the owned process tree, clean obsolete owned children, avoid duplicate Vite/browser workers, keep only what is still needed. **Kill only proven owned PIDs/PPIDs** (tracked when started), and re-check identity (command + start time via `ps -o lstart,command -p <pid>`) immediately before, because PIDs get reused. Terminate gracefully (TERM before KILL). Never kill by name; never touch unknown macOS/root processes, unrelated Chrome/VS Code, or Remote Control/network/session processes. An unowned stray is reported in the handoff, not killed.

## 7. Watchdog

Every active task, manager work included, gets a watchdog (except the host monitor and the watchdog itself; no recursion). It judges progress. Host safety is the monitor's job (§6). [CORE] **Deterministic sampling plus Luna interpretation.** A shell sampler (e.g. `taskwatch.sh`) checks the task every few minutes:
- process alive;
- log growth and latest stage headings;
- changed and newest files and commits;
- error, quota and tool-block text;
- host-monitor state.

It writes a status file the manager can read at any time ("where is the task, and is it healthy?"). **Luna** (`low`) interprets it only when the evidence changed (at most every ~20 min) or on an anomaly (stale log, error or quota text, process gone). It returns stage, activity (coding, testing, simulating, blocked, waiting or finished), health, and whether intervention is needed. The deterministic lines are authoritative; Luna's line is an interpretation. The manager is notified only when the task finishes or dies, or when intervention is needed.

The manager-health watcher (§4) is separate and never uses Luna for live failover.

**Adaptive timing** (tune to expected duration; not a kill timer): < 30 min task → ~15–20 min if progress isn't already clear; 30–90 min → ~30 min; > 90 min → ~45–60 min unless risk or host state justifies earlier.

**Evaluate:** real progress, evidence/log movement, host health, stuck vs legitimate wait, loops/retries, scope creep, whether to decompose/reroute, marginal value. **Classify:** legitimate wait / process hang / harness failure / host degradation / tool outage / quota exhaustion. Log only meaningful interventions.

## 8. Verification, evidence, human-verification queue

Cheapest sufficient evidence first: static/syntax → targeted deterministic check → build → browser smoke → full browser regression → screenshots/captures → timing/performance. Builds only at meaningful checkpoints. Don't broad-rerun unaffected evidence.

- **UNVERIFIED ≠ PASS. BLOCKED ≠ FAIL. NEEDS HUMAN VERIFICATION ≠ technical failure.** Static plausibility ≠ runtime proof. Build pass ≠ accepted. Worker finished ≠ accepted.
- Inspect artifacts from interrupted runs before discarding them.
- **Classify before touching product code:** app / harness / host-tool / model-quota / environment. Never change product code to work around a broken harness.
- Working behavior is a regression boundary; evidence before modification.

**Human-verification queue.** Do everything machine-verifiable without the user. For each genuine subjective judgment: record the item, preserve the exact artifact/state (capture path, commit, URL/state), mark NEEDS HUMAN VERIFICATION, continue independent work. Agents may gather and prune evidence; they never record human acceptance. The run stops for human review only when remaining meaningful work depends on it. Astra's human-verification sweep (§3) prunes the queue.

## 9. Recovery, stop conditions, light work

**Recover without asking:** retry a transient deterministic command (after classifying the failure); fix a proven harness bug; restart an owned Vite/Puppeteer/browser process; reroute a worker; heavy → light fallback; checkpoint at a model/tool limit; wait/retry a temporarily unavailable tool; Astra evidence review; correct stale claims. No blind retries (`model-routing.md` §6).

**Operational decisions stay inside the run.** Quota limits, worker failures, retry and reroute choices, checkpointing, and temporary tool or host limits are **not escalated to the user**.

- **Routine recovery** (the list above) is the manager's call.
- **Consequential operational choices** go to an independent reviewer, under the same independence rule as brief verification (§2): Sol `xhigh`, or the strongest available Claude-side reviewer when Codex is unavailable. Examples: rerouting work onto scarcer Claude quota, taking over or discarding a cut-off worker's partial output, proceeding versus waiting out a limit. The reviewer **recommends** the safest course consistent with the objective and the resource policy (§5–6). The manager decides and records any deviation from that recommendation.
- The manager proceeds, then records the decision in the ledger and the handoff, marked **overridable by the user**. Record reviewer substitutions made because of quota (e.g. a Claude reviewer standing in for Sol) the same way.
- **Host health is operational, but never convenience.** When host load blocks heavy work:
  1. Clear avoidable user-level load first: idle browsers, idle Claude/Codex sessions, stale dev servers, harnesses and monitors. Never touch the run's own session chain or the app/terminal the user is attached through.
  2. Measure the clean-host baseline.
  3. Have an independent reviewer recommend the smallest defensible §6 rule from the before/after evidence. Memory pressure and swapouts stay strict safety signals, and CPU/system-load protection stays in place.
  4. Apply that rule and record it as overridable.

  Do not design thresholds around avoidable noise. Evidence filters never relax safety gates.
- **Stop for the user only** when a decision changes product intent, subjective experience, feature scope, a major architecture/product tradeoff, a protected resource constraint, or an existing human-review gate.
- Astra escalation is unchanged (§2–3).

**Stop and checkpoint — do not expand — when:** scope would materially change; product or major architecture is ambiguous; a destructive action is required; `main` or shared history needs an unauthorized change; evidence is irreconcilable; recovery has stopped yielding progress; the next phase is outside scope; all remaining work needs human judgment.

**Stop discipline:** objective achieved; all machine-verifiable work complete; only genuine human judgment remains; or remaining work is blocked and useful fallback exhausted. Do not invent a next phase, unrelated cleanup, extra features, broad refactors, speculative architecture, or unnecessary tests.

**Light-work fallback** (when heavy work is blocked): static inspection, evidence reconciliation, diff review, verification-script prep, docs/implementation consistency, stale-claim review, handoff prep, next-step planning, worker briefs with manager review, Opus/Astra read-only reasoning. No speculative cleanup. When useful light work is exhausted, wait cleanly.

## 10. Git safety

Work on the specified branch/worktree. Commit coherent, reviewable checkpoints (if allowed); push only if allowed; `main` untouched unless explicitly permitted; no amend/rebase/shared-history rewrite without authorization. Codex jobs launch from a dedicated worktree, never the user's main checkout. `SPEC.md` changes only for genuine product/runtime truth.

**Before stopping confirm:** branch/head, working tree, commits, `main` state, owned runtime cleanup, evidence preserved.

## 11. Run ledger

One compact file in the job temp dir (`$CLAUDE_JOB_DIR/tmp`) or another git-excluded path — never tracked docs mid-run. It doubles as the continuation packet and the manager lock (§4), so keep it current at every task boundary. Contents: objective/done criteria, manager-mode field + holder PID (§4), branch/head, active tasks (owner/model, state, last evidence), owned PIDs, host state, quota/reset constraints, last watchdog, last Astra review/findings, commits, human-verification queue, next action.

## 12. Final handoff

Run the two Astra sweeps first when available and worth the usage. Then report, keeping each category separate (implemented ≠ verified ≠ accepted):

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
Material Astra findings: …
Brief verifications: <brief → PASS | PATCH (what changed, propagated to …)>

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
