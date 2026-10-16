# GT3 — Claude CLI Invocation (canonical)

Execution layer for **headless Claude Code workers** (Opus, Sonnet, Haiku) launched by any manager, primarily a Codex-native Sol manager (`model-routing.md` §11b). Role and routing policy live in [`model-routing.md`](./model-routing.md). Isolation, provenance and host rules live in [`operating-contract.md`](./operating-contract.md) §5–§6. In-session Claude subagents under an Opus manager (the Agent tool) are a different mechanism and are not covered here.

**Status:** verified 2026-10-16 on the M4, Claude Code 2.1.301, claude.ai Pro login, first-party provider. The Intel is unverified. Re-verify `claude --version` and `claude auth status` at session start (see "This file drifts").

## Required invocation path: `scripts/claude-route.sh`

```
scripts/claude-route.sh -m <model> -r <effort> -s <mode> "<prompt>"
scripts/claude-route.sh -m <model> -r <effort> -s <mode> @path/to/brief.md
```

| Flag | Values | Notes |
|---|---|---|
| `-m` | `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` | Full IDs only; aliases are refused. |
| `-r` | `low` `medium` `high` `xhigh` `max` | Passed as `--effort`. Unlike in-session subagents, headless workers **can** set effort per call. |
| `-s` | `read-only`, `edit`, `auto` | Required. See modes below. |

The wrapper refuses to run, before any model call, if:
- a flag is missing or invalid;
- `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` or a Bedrock/Vertex/Foundry switch is set;
- `claude auth status` does not report `authMethod: claude.ai` with `apiProvider: firstParty` (exit 3: billing unverified);
- a writing mode is launched in the main checkout or on `main`;
- the Sol-led roster check fails (`GT3_CONFIG=sol-led`).

It unsets inherited `CLAUDE_CODE_*` session variables so the worker is an independent process.

Internally (edit mode shown):

```
claude -p --model <m> --effort <r> --output-format json --no-session-persistence \
  --strict-mcp-config --no-chrome --permission-prompts none \
  --permission-mode acceptEdits --allowedTools "Bash(git status:*)" … \
  --disallowedTools Agent "Bash(git push:*)" … \
  --append-system-prompt "GT3 ROLE: worker … report: done / evidence / unverified / blocked" "<prompt>"
```

## Modes

| Mode | Enforcement | Verified 2026-10-16 (M4) |
|---|---|---|
| `read-only` | `--tools Read,Grep,Glob` | Opus, Sonnet and Haiku each returned the expected reply; `modelUsage` named the exact model |
| `edit` | `acceptEdits` + Bash allowlist (`git status/diff/log/show`, `node --check`, `bash -n`, `npm run build`, `ls`); `--permission-prompts none` denies everything else | Haiku: in-worktree write and `git status` allowed; `/tmp` touch, write outside the worktree, `git push --dry-run` and subagent launch all **denied** (`permission_denials` lists them); filesystem confirmed |
| `auto` | Claude Code auto-mode classifier; prompts denied | not exercised |

The disallow list (Agent tool, push, merge, rebase, reset, checkout of main, `codex`/`opencode`/`claude` CLIs and route scripts) is best-effort pattern matching. `edit` and `read-only` are the enforced boundaries. In `auto`, shell indirection could evade a pattern.

## Output, completion, cancellation

- stdout is one JSON object: `result`, `is_error`, `subtype`, `modelUsage`, `permission_denials`, `total_cost_usd`. Under a subscription login `total_cost_usd` is Claude Code's usage **estimate**, not a charge. There is no API billing path when no API key exists and the login is claude.ai.
- Observed wall time for a trivial prompt: Haiku 3 s, Sonnet 6 s, Opus 9 s (M4).
- Long jobs: run detached and wait on the PID with a script (`operating-contract.md` §5.3). TERM to the owned PID stopped a running worker in ≤ 1 s with exit 143 and no orphan processes. A cancelled worker emits no JSON; its file edits remain in the worktree.
- Commits: workers in `edit`/`read-only` cannot commit. The manager reviews the diff and commits with `GT3-Run: <run>/e<epoch>/<task>`.

## Quota

Workers draw on the **same Claude subscription** as any interactive Claude Code session on that account, on either Mac. Every Claude worker spends the same scarce pool an Opus manager would (`model-routing.md` §10). On a usage-limit error, mark the route BLOCKED with its reset time; do not retry.

## Not covered

- Cloud sessions (`claude --cloud`) run on Anthropic infrastructure from a pushed branch and are reviewer-only (`cloud-opus-invocation.md`).
- Remote Control (`claude remote-control`, `--remote-control`, `/remote-control`) is an owner interface to a local session (`operating-contract.md` §9), not a worker route.
- Background sessions (`claude --bg`, `claude agents`) are not used for routed workers; their permission and lifecycle behaviour has not been verified for this contract.

## This file drifts

CLI flags, model IDs and plan features change. Re-check `claude --help`, `claude --version` and `claude auth status` when a session starts relying on this route, and update the tables when they change.
