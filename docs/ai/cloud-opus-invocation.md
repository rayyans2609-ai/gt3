# GT3 — Cloud Opus invocation

Execution layer for **Cloud Opus** (Claude Opus 5.5 in a Claude Code cloud session). Routing decisions stay in [`model-routing.md`](./model-routing.md); this file only records how to run it.

**Role (owner direction, 2026-10-06).** Independent senior specialist/reviewer. It is advisory: the manager decides, and the owner accepts. It is used only when independent senior analysis has decision value (`model-routing.md` §5, `autonomous-mode.md` §3), never as a routine or cadence review. Cloud sessions have no local runtime, browser or GPU. They must never claim visual, browser or performance observations they did not produce.

## Source-of-truth rule (mandatory)

A cloud session sees only what is on `origin`. Before every launch:

1. Commit the relevant work and push the development branch. Never push to `main`.
2. Record the exact SHA: `git rev-parse HEAD`, and confirm it equals `origin/<branch>`.
3. In the prompt, require **STEP 0**: `git fetch origin <branch> && git checkout -B <name> origin/<branch>`, report `git rev-parse HEAD`, and state the expected SHA. On a mismatch the session says so and names the SHA it actually analysed.

Never launch a cloud review while newer relevant work exists only locally.

## Launch

```
expect scripts/cloud-opus-launch.exp <prompt-file> claude-opus-5-5 <log-file>
```

This wraps `claude --cloud "<prompt>" --model <model>`. The script requires an explicit model, accepts the startup settings prompt, prints `CLOUD_URL=…`, and detaches. Write prompt files and logs to the job temp directory, not tracked paths.

## Prompt contract (proven shape)

- Role line: independent, advisory, no runtime claims; label each finding COMPUTED / REASONED / UNVERIFIED.
- STEP 0: branch + expected SHA confirmation (above).
- Sources to read, and a bounded, delta-focused question list. Do not replay evidence that is already valid.
- Sandbox hygiene: scratch files only under `/tmp`; refused commands are skipped and noted.
- **Delivery:** write the report to `docs/review/<name>.md`, create one new branch `p3-cloud-*` (or the phase equivalent), commit only that file, and push only that branch. No force push, no PR, no other pushes. Then finish with the pushed SHA and a short BLOCKER / SHOULD-FIX / NOTE summary.

Read the result with `git fetch origin <branch> && git show origin/<branch>:docs/review/<name>.md`. Past examples: `origin/p3-cloud-review-w2`, `origin/p3-cloud-audit-final`, `origin/p3-cloud-audit-final2`.
