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
`sol-continuity`: it passes that manager's credentials, records the active
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
