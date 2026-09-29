# CONT-1 controller

This is an opt-in, per-run controller. `GT3_RUN_DIR` selects an armed run; no
watcher, quota probe, or model call is included. The controller alone writes
`manager.json`. Callers must use `controller.sh` for every ownership change.

## Lock and state

On this macOS host, `/usr/bin/flock` is absent, while Python 3.9 provides
`fcntl.flock`. The controller takes an exclusive lock on a permanent
`.controller.lock` inode for every transition, admission, and controlled write.
The kernel releases the lock when a crashed process closes its descriptor.
Atomic JSON replacement and directory `fsync` publish state. The tests crash
after lock acquisition and before publication, then demonstrate recovery;
concurrent claimers yield one successful transition. Do not delete or replace
the lock file while a run is armed.

`manager.json` has `mode`, `holder`, `managerId`, `generation`, `since`, and an
`activeTurn` marker containing a PID and process birth identity. An Opus return
uses its *previous* session/generation only for `request-handback`; it cannot
admit actions. `sol-starting` is held by Sol and refuses a second failover.
Only `failover` and `handback` transfer authority and increment generation.

The process birth token uses Linux `/proc` start ticks when present and macOS
`ps -o lstart=` otherwise. The macOS token has one-second resolution; it is
not a perfect proof against unusually fast PID reuse. A late acknowledgement
does not start another manager. A `sol-starting` invocation must be reconciled
by later tooling before any retry; session ID alone is not proof of liveness.

## CLI

Set `GT3_RUN_DIR` and use `scripts/autonomy/controller.sh` (shown as `ctl`
below). Every armed mutation except failover and Opus's special return request
requires `GT3_MANAGER_ID` and `GT3_MANAGER_GEN`. Missing credentials fail
closed. `status` is read only.

```text
ctl init --opus-id SESSION
ctl status
ctl turn start --pid PID | ctl turn end
ctl failover --expect-gen N --expect-id OPUS_SESSION --sol-id SOL_SESSION
ctl ack --expect-gen N
ctl request-handback --expect-gen N
ctl write PATH < CONTENT
ctl checkpoint --file RUN_DIR/continuity.md
ctl handback --expect-gen N
ctl admit ACTION                       # prints action ID
ctl done ACTION_ID [--outcome TEXT]
ctl reconcile ACTION_ID --outcome not-started|completed|externally-verified --reason TEXT
ctl run ACTION -- COMMAND [ARGS...]
ctl launch-manager -- COMMAND [ARGS...]
ctl register-process --pid PID --tag TAG
ctl stop-process --pid PID
```

`ACTION` is `dispatch`, `repository-commit`, `repository-push`,
`repository-branch`, `process-control`, or `file-write` for `admit`.
`run` supports dispatch and the three repository actions. `run dispatch`
records launch completion under the lock, strips manager credentials from the
child, then waits for its exit. Repository `run` keeps the action pending
until the command exits, so transfers wait. `ctl write` reads stdin, admits
and atomically replaces the target under the same lock; it refuses controller
state files. Use it for manager-controlled files, including the handback
packet. `checkpoint` records that packet's digest after handback was
requested. `handback` checks the digest and pending actions before transfer.
`launch-manager` is reserved for the Sol session in `sol-starting` or
`sol-continuity` (and CONT-2 event delivery during `handback-requested`): it passes that manager's credentials, records the active
turn's PID and birth identity, and refuses a second live turn. Ordinary
worker dispatches use `run dispatch` and receive no manager credentials.

Action records in `actions.json` move `intent → admitted → done`. Crashes can
leave an unresolved record, and transfers then fail closed. Inspect external
process and file evidence before using `reconcile`; a child launched just
before a crash may not yet have a durable PID record. `register-process`
stores PID plus birth identity; `stop-process` refuses missing or reused PIDs.

Exit codes: `0` success; `2` invalid CLI arguments; `3` fenced/refused action;
`97` only for test fault injection; `run` otherwise returns the child's exit
code. `GT3_CTL_CRASH_AT` is a test-only fault injector and must be unset in
live use.

## Routed boundaries

When `GT3_RUN_DIR` is set, `scripts/codex-route.sh` calls `ctl run dispatch`
before invoking Codex. `guarded-git.sh` is an optional wrapper example for
commit, push, and branch-changing commands. Use `ctl register-process` and
`ctl stop-process` for owned process control, and `ctl write` for controlled
file writes. A repository hook could call `ctl admit` and `ctl done` around a
specific hook event, but hooks can be disabled; the wrapper covers more of
the command lifetime. Direct `git`, direct shell writes, raw `codex`, and
unregistered process commands bypass the controller. The one-manager
guarantee is therefore **cooperative** wherever paths are not routed or
isolated. The stale-credential test proves refusal only at the routed
dispatch, repository, and file-write boundaries.

`failover` checks expected owner/session, generation, state, pending actions,
and the active-turn process identity. It does not diagnose Claude limits or
prove that an unmarked invocation is dead. The later watcher must supply that
evidence and must not retry merely because an acknowledgement is late. This
split also does not provide worker-event delivery, quota handling, or live
Opus wake behaviour.

Run local stubs with `python3 scripts/autonomy/test_controller.py`.

## CONT-2 watcher (opt-in; not armed for a live run)

`continuity-watch.sh` wraps the Python watcher. A run must already be initialized
by the CONT-1 controller. Copy `continuity.md` into the run directory, fill it
with current facts, and write `watch-config.json` with `jobDir`, `worktree`,
`deadline` (ISO timestamp), optional `transcripts`, `enableStalenessAdvisory`
(default false), `staleSeconds` (1800 when enabled), and `workerStaleSeconds`
(default 1800). The packet's `Takeover effort:`
field is `high` or `xhigh`. No priming is used. The run's sole ownership writer
remains `controller.sh`; never edit `manager.json` directly.

For a foreground smoke test, use `GT3_RUN_DIR=... continuity-watch.sh tick`.
For a detached watcher, use `nohup continuity-watch.sh --run-dir "$GT3_RUN_DIR"
loop --interval 120 >"$GT3_RUN_DIR/watch.log" 2>&1 </dev/null &` and record
its PID. A Claude background shell task may run the same `loop` command. The
watcher does not exit at `opusResetAt`: it logs `opus-available`, touches
`opus-wake`, and continues events. A Claude notification from an optional Opus
waker has not been verified. No waker is installed here.

Each tick consumes all complete unseen timeline lines. The cursor records
inode, byte offset and last event time; partial lines wait for a newline,
rotation or truncation starts a new scan, and earlier ownership-period entries
are ignored for current failover. Limit-text `blocked` entries trigger even if
followed by a user-question `blocked`; user questions alone do not. A current
limit-text `state.json`, a configured dead Opus PID, or ambiguous staleness plus
a Luna `manager-dead` advisory are the other triggers. A stale worker does not
count as manager progress; monitor log chatter does not count. Luna does not
transfer ownership itself. Ambiguous staleness requires the explicit
`enableStalenessAdvisory` opt-in. The real `continuity.md` must contain text
before failover; the deadline gates failover and every manager turn. Use
`tick --dry-run` against a scratch run to inspect the limit trigger and exact
takeover route command without transferring ownership or launching a model.

`worker-launch` requires a stable task ID, bounded permissions, brief, model,
effort and command. It records launch intent before a controller-admitted
supervisor starts. The supervisor records PID plus process birth and writes
the completion record. `launching` without confirmation and a disappeared PID
without supervisor completion are unresolved and require reconciliation, not
redispatch. Worker commands have no manager credentials or armed-run dispatch
variables; the manager should pass `scripts/codex-route.sh` with explicit flags
as the command. Permissions are an explicit cooperative bound, not OS sandbox
enforcement. Events have durable IDs in `event-queue.json`, are delivered one
manager resume at a time, and require `continuity-watch.sh ack EVENT_ID` with
manager credentials. Delivery may repeat after a crash; handlers must record
and apply effects idempotently. Events continue in `handback-requested`.

`continuity-watch.sh quota-snapshot ROUTE --available true|false|unknown`
accepts optional `--remaining`, `--capacity`, `--warning` and requires active
manager credentials. It writes through `controller.sh write`. Watcher quota
changes come only from real limit text or successful calls after a reset.
Records are route-specific (`claude:opus`, `codex:gpt-6-sol`, etc.). A
`resetAt` is eligibility to retry, never proof of availability. Missing or
ambiguous observations stay `null`; no quota polling model calls are made.
An unavailable Codex route suspends event resume until reset eligibility and
the run deadline. The watcher makes no pre-limit prediction.

The watcher saves manager call logs under `calls/`, extracts session IDs from
Codex's `session id:` header, and resumes through `codex-route.sh resume -m
gpt-6-sol -r ... SESSION_ID PROMPT`. Only one live manager turn is admitted by
the controller. `sol-starting` with a missing ACK is an unresolved launch,
not a reason to start a second manager. The one-manager guarantee is
**cooperative** for raw Codex/Git/shell/file paths that bypass the controller.
The same-host watcher and manager can both stop on host sleep or crash.

Run the deterministic A–K and edge-case sandbox with
`python3 scripts/autonomy/test_continuity.py`; it recreates
`/tmp/gt3-cont-sim/` and never invokes real models. Keep live probes outside
that directory while rerunning the harness.
