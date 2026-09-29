# CONT-2 verification report — 2026-09-29

Branch: `docs-brief-verification`. CONT-1 prerequisite: `32cb3ae` (controller,
admission and crash/race tests). This split is tooling and simulation only; no
live run was armed, no push was made, and `docs/ai/*.md` was untouched.

## Files

- `continuity-watch.sh`, `continuity_watch.py`: deterministic watcher, quota,
  worker supervisor, event queue and resume scheduling.
- `continuity.md`, `sol-takeover.md`: packet and takeover prompt.
- `test_continuity.py`: A–K and edge-case sandbox simulation.
- `codex-route.sh`: explicit `resume -m ... -r ... SESSION_ID PROMPT` and
  controller-admitted manager launch.
- `controller.py`: permits Sol manager event resumes in `handback-requested`.
- `README.md`: setup, boundaries and recovery behavior.

## Scenario evidence

All stubs use `/tmp/gt3-cont-sim/`; `results.json` is the index. The simulation
is reproducible with `python3 scripts/autonomy/test_continuity.py`. The test
recreates that directory, so separate live probes were recorded outside it.

| Case | Result | Evidence |
|---|---|---|
| A healthy Opus, no model work | PASS | `/tmp/gt3-cont-sim/A/run/manager.json` |
| B limit failover and exact next action | PASS | `/tmp/gt3-cont-sim/B/run/events.log`, `calls/` |
| C healthy worker inherited; completion event | PASS | `/tmp/gt3-cont-sim/C/run/workers.json`, `event-queue.json` |
| D uncommitted change reported | PASS | `/tmp/gt3-cont-sim/D/run/calls/` |
| E newer live HEAD wins over packet | PASS | `/tmp/gt3-cont-sim/E/run/calls/` |
| F heavy worker preserved, no second launch | PASS | `/tmp/gt3-cont-sim/F/run/workers.json` |
| G separate Sol/Terra/Luna workers (stubbed) | PASS | `/tmp/gt3-cont-sim/G/run/workers.json` |
| H Astra and bounded Luna subagent (stubbed) | PASS | `/tmp/gt3-cont-sim/H/run/astra-stub.json` |
| I separate Sol xhigh reviewer | PASS | `/tmp/gt3-cont-sim/I/run/reviewer.log` |
| J return, mid-task worker, event during handback | PASS | `/tmp/gt3-cont-sim/J/run/event-queue.json`, `manager.json` |
| K Codex limit rejection, no unsafe retry | PASS | `/tmp/gt3-cont-sim/K/run/quota.json`, `manager.json` |
| User-question `blocked` negative case | PASS | `/tmp/gt3-cont-sim/negative/run/manager.json` |
| Event delivery crash, one redelivery, one effect | PASS | `/tmp/gt3-cont-sim/ack-crash/run/event-queue.json`, `stub-handled.json` |
| Partial line, limit followed by user block | PASS | `/tmp/gt3-cont-sim/cursor/run/timeline-cursor.json` |
| Rotation and historical event | PASS | `/tmp/gt3-cont-sim/cursor/run/timeline-cursor.json` |
| Hung live worker does not suppress advisory | PASS | `/tmp/gt3-cont-sim/stale-worker/run/workers.json`, `manager.json` |
| Detached watcher survives parent exit | PASS | `/tmp/gt3-cont-sim/detached/idle-host.txt` |
| User snapshot versus CLI rejection | PASS | `/tmp/gt3-cont-sim/K/run/quota.json` |

CONT-1's 12 crash/race tests also pass, including claim/publication/admission,
child registration, stale credentials, simultaneous return/failover and
handback. Python compilation, shell syntax and `git diff --check` pass.

## Four capped live probes

Sanitized session IDs, per-turn usage and source paths are in
`/tmp/gt3-cont-live-probes/live-summary.json`. The original takeover and resume
ran in a throwaway repo. A subsequent simulation cleanup removed their local
logs and repo; the persisted Codex session JSONL proves the two completed
turns and `high` → `xhigh` override. The takeover ACK was verified in
`manager.json` before cleanup. The resume wrapper exited 1 when its controller
state disappeared during cleanup, so a clean controller-completed resume was
not demonstrated by that live call; the model resume itself completed. The
reviewer and Luna logs remain in
`/tmp/gt3-cont-live-probes/`.

| Call | Model/effort | Session | CLI-style tokens (uncached input + output) | Result |
|---|---|---|---:|---|
| Fresh takeover from real packet | Sol high | `01a0ed4f-7e5f-7561-a013-26f9a18c7aa1` | 14,082 | ACK, verified live branch/HEAD, stated stop |
| Explicit resume of same session | Sol xhigh | same ID | 22,301 | persisted turn confirms resume and `xhigh` |
| Independent reviewer | Sol xhigh | `01a0ed51-7d00-7583-be51-f9e4aa5bef69` | 21,783 | found missing filename in tiny brief |
| Advisory classification | Luna high | `01a0ed51-fdca-7f22-997f-e68fbd7c9210` | 13,614 | `legit-wait` |

Total CLI-style tokens: **71,780**. Including cached input, the session records
show **148,452** total tokens. The resume figure comes from persisted per-turn
usage because its local CLI log was removed. No live Astra, G worker launch or
H subagent call was made.

## Trigger and resource cost

In `opus-primary`, a complete timeline entry dated to the current ownership
period, or a current `state.json`, triggers failover only when `state=blocked`
and detail matches `hit your session limit`, `usage limit` or `rate limit`.
Other triggers are a configured Opus PID proven gone, or `working` with no
timeline/packet/transcript progress past `staleSeconds` and no progressing
worker, followed by a Luna `manager-dead` advisory. A user-question `blocked`
does not trigger. The controller must still accept the expected owner,
generation and state and find no live Opus turn or pending action. Late Sol ACK
does not launch a second manager.

Idle watcher uses **0 model tokens** per tick. A detached process survived its
parent shell at the normal 120-second interval; after three seconds `ps`
reported **0.0% CPU**, **11,412 KB RSS**, and **0.11 seconds cumulative CPU**
including startup (`/tmp/gt3-cont-sim/idle-default-cost.txt`). A test at a
0.2-second interval measured 4.9% CPU and 11,392 KB RSS, as expected for the
deliberately accelerated harness.

## Quota observability

`codex login status` says only `Logged in using ChatGPT`. Safe inspection of
`~/.codex/auth.json` showed `auth_mode=chatgpt` and top-level key names; no
secret values were printed. No safe account identity was exposed. Persisted
Codex session events include `limit_id=codex` and primary/secondary window
percentages/reset epochs, but they do not establish ChatGPT app capacity,
explain a separate CLI bucket, or identify a model-specific cause. Actual CLI
rejection text is recorded per route; a user snapshot can coexist with a
contradictory CLI rejection with `discrepancyCause: UNKNOWN`. That CLI rejection
continues to govern dispatch until its reset makes a retry eligible. A reset
never asserts that capacity is available. No pre-limit warning signal was
observed or implemented.

## Limits

The one-manager guarantee is **cooperative** outside controller-routed
dispatch, Git, file and process paths. Worker permission strings likewise
require the worker to cooperate; they are not OS isolation. Events are
at-least-once, not exactly once; handlers must make effects idempotent. PID
birth checks are imperfect, especially macOS `ps` one-second resolution.
Same-host sleep/crash or watcher failure can stop both sides; both providers
may be unavailable. The Opus waker is deferred and unverified. A separate Sol
reviewer is procedurally independent but same-model errors can correlate.
There is no advance Claude limit warning. Priming was deferred, so dormant
session cost was not measured; default takeover uses a fresh Sol launch.
