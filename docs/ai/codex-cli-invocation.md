# GT3 — Codex CLI Invocation (canonical)

Execution-specific layer only. Role/escalation/reasoning-*policy* doctrine lives in [`docs/ai/model-routing.md`](./model-routing.md) — do not duplicate it here.

**Status:** re-verified 2026-09-26 against a locally installed `codex-cli 0.157.1` (npm, macOS x86_64). Re-verify against `codex doctor` / `codex --version` / `~/.codex/models_cache.json` at the start of a new working session rather than trusting this file indefinitely — see "This file drifts" below. `scripts/codex-route.sh` itself was verified end-to-end by a live routed job on 2026-09-27 (see "Live-run verification").

## Required invocation path: `scripts/codex-route.sh`

Every GT3 Codex delegation should go through this wrapper, not a bare `codex exec` call. It makes explicit model + reasoning effort a hard requirement instead of a documentation convention someone has to remember:

```
scripts/codex-route.sh -m <model> -r <reasoning-effort> "<prompt>"
scripts/codex-route.sh -m <model> -r <reasoning-effort> @path/to/brief.md
```

It exits with an error and does **not** invoke Codex if `-m` or `-r` is missing, empty, or `-r` isn't one of the recognized levels. See "Default-fallback protection" below for why this exists.

Internally it runs:

```
codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check \
  -m <model> -c model_reasoning_effort="<effort>" "<prompt>" < /dev/null
```

which remains the verified-correct raw syntax on 0.157.1 if you ever need to bypass the wrapper for a one-off interactive case — but the wrapper is the canonical path for routed jobs.

## Verified current model slugs

From `~/.codex/models_cache.json` (Codex's own catalog, fetched 2026-09-25 as of last check — this file is refreshed by Codex itself, so re-check its `fetched_at` before trusting slugs long after this doc's date):

| Slug | Catalog description | `supported_in_api` / `visibility` |
|---|---|---|
| `gpt-6-astra` | Frontier intelligence for the most demanding work | true / list |
| `gpt-6-sol` | Workhorse model for coding and everyday work | true / list |
| `gpt-6-luna` | Fast and affordable model for easier tasks | true / list |
| `gpt-5.6-sol` | *Older* coding model for complex work | true / list |
| `gpt-5.6-terra` | *Older* balanced model for straightforward work | true / list |
| `gpt-5.6-luna` | *Older* fast and efficient model | true / list |

GPT-6 is the current generation; the GPT-5.6 models are explicitly labeled "Older" in Codex's own catalog but are fully supported (no retirement notice) — `gpt-5.6-terra` stays in active routing per `model-routing.md` §3 specifically because GPT-6 has no Terra-equivalent tier. (`gpt-5.5` also still exists but is scheduled to retire 2026-10-14 and auto-upgrade to `gpt-5.6-sol`; it isn't part of the routing tier set regardless.)

## Verified reasoning-effort values

All six routing-tree models accept: `low`, `medium`, `high`, `xhigh`, `max`. `gpt-6-sol`, `gpt-6-astra`, and `gpt-5.6-sol` additionally accept `ultra` ("maximum reasoning with automatic task delegation") — not part of current routing policy, available if a deliberate reason arises.

Per-model catalog defaults (what the model would use if nothing else specified an effort — see the caveat immediately below): `gpt-6-luna`/`gpt-5.6-luna`/`gpt-5.6-terra`/`gpt-6-sol` default to `medium`; `gpt-6-astra` and `gpt-5.6-sol` default to `low`.

**Caveat — do not rely on the above table.** `~/.codex/config.toml` can set a top-level `model_reasoning_effort` that acts as the effective default for *any* invocation that omits `-c model_reasoning_effort=`, regardless of which model catalog default would otherwise apply. Which one actually wins for a bare (no `-c`) invocation was not conclusively verified in this environment (a live test invocation was blocked — see "What could not be verified"). **This ambiguity is exactly why `scripts/codex-route.sh` makes `-r` mandatory: it makes the question irrelevant, because reasoning effort is never left to default resolution on a routed job.**

## Default-fallback protection

`~/.codex/config.toml` is a **global, machine-wide** file — it is not GT3-specific and this repo does not (and, per `codex doctor`, cannot) override it with a project-local config. Confirmed via `codex doctor` run from inside `~/Desktop/gt3`: `config.toml ~/.codex/config.toml` — the global path, unconditionally. `codex exec --help`'s own text for `-c` confirms the same: "Override a configuration value that would otherwise be loaded from `~/.codex/config.toml`."

A file that happens to live at `./.codex/config.toml` inside this repo is **not** a Codex CLI project config — Codex has no such mechanism. It contains only an MCP server registration (`[mcp_servers.codex-executor]`, `command = "codex"`) and has no `model` or `model_reasoning_effort` keys; it does not affect model/reasoning resolution either way.

**The global default is not stable — observed drifting within a single working session.** On 2026-09-26, `~/.codex/config.toml`'s `model`/`model_reasoning_effort` keys were read twice, ~30 minutes apart, with no edit by this agent in between:

- First read: `model = "gpt-5.6-sol"`, `model_reasoning_effort = "high"`
- Second read (via `codex doctor`, then confirmed by re-reading the file directly): `model = "gpt-6-sol"`, `model_reasoning_effort = "medium"`

Something in the Codex tooling itself (the background `app-server` daemon was observed running; the doctor output also references "cloud-managed policy" as part of "configuration scope") appears to migrate or override this default outside of any action taken here. **Treat the global default as unpredictable, not merely "currently wrong."** Do not document a specific "current default" as if it were durable fact — the only durable protection is that every routed job specifies both flags itself, via `scripts/codex-route.sh`. That script cannot silently fall back to whatever `~/.codex/config.toml` currently says, because it refuses to run at all without both `-m` and `-r`.

The user's global machine-wide default was **not modified** by this work, per instruction — only documented, plus the wrapper script that makes it irrelevant to GT3 routing.

## What could not be verified

Only one item remains: which reasoning-effort value wins for a *bare* `codex exec` with no `-c model_reasoning_effort`. Routed jobs never depend on it, because the wrapper always passes `-r`. (Earlier live attempts on 2026-09-26 were blocked by Claude Code's auto-mode classifier on `--dangerously-bypass-approvals-and-sandbox`; that block did not recur on 2026-09-27. See below.)

## Live-run verification (2026-09-27)

`scripts/codex-route.sh` is **verified end-to-end.** The Phase 1a job (`scripts/codex-route.sh -m gpt-5.6-terra -r medium @<brief>`) ran to completion, exit 0, and produced the committed work. The run header echoed exactly what the wrapper passed: `model: gpt-5.6-terra`, `reasoning effort: medium`, `approval: never`, `sandbox: danger-full-access`, `workdir: <the directory it was launched from>`.

Operating notes from that run:

- **Codex works unsandboxed in its launch directory.** Launch routed jobs from a dedicated worktree on the job's branch, never from the user's main checkout, so its commits and branch changes cannot touch the working copy. A symlinked `node_modules` is fine; list it in `.git/info/exclude`, because `.gitignore`'s `node_modules/` pattern only matches directories.
- **Codex's own verification can be incomplete.** In its execution window it could not finish `npm run build` or get past the headless loading screen, and it reported that honestly. The manager re-ran the build and browser checks. Treat worker-reported verification gaps as manager work, per `model-routing.md` §6 "Implementation ≠ acceptance".

The `codex-executor` MCP server continues to fail with `CONNECTION_CLOSED` as of 2026-09-26 — routed jobs go through the `codex` CLI via Bash (or `scripts/codex-route.sh`), which draws on the same quota as the MCP path would.

## This file drifts

Codex's own model catalog (`~/.codex/models_cache.json`) is fetched and refreshed by Codex itself — it will legitimately go stale relative to this document over time, and the config-default drift observed above shows the global config can change without any local edit. Re-verify slugs, reasoning levels, and the config default against the live environment at the start of a session rather than trusting this file's tables indefinitely.
