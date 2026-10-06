# GT3 — OpenCode Invocation (canonical)

Execution-specific layer only. Which worker gets which task (Muse, DeepSeek, Bunny, MiMo) lives in [`docs/ai/model-routing.md`](./model-routing.md) — do not duplicate it here. Codex execution is in [`codex-cli-invocation.md`](./codex-cli-invocation.md).

**Status:** verified 2026-10-04 against a locally installed `opencode v2.0.22` (`~/.opencode/bin/opencode`, macOS). The route IDs below were also used throughout the GT3 model benchmark (2026-10-03/04). Re-verify at the start of a session that depends on them — see "This file drifts".

## Required invocation path: `scripts/opencode-route.sh`

Every routed GT3 OpenCode job goes through this wrapper, not a bare `opencode run`:

```
scripts/opencode-route.sh -m <provider/model> "<prompt>"
scripts/opencode-route.sh -m <provider/model> @path/to/brief.md
```

It exits with an error and does **not** invoke OpenCode if `-m` is missing or empty, isn't a full `provider/model` ID, or names a `tokenharbor/` model without the `:free` suffix. It never picks a model, and never reads, sets or exports credentials.

Internally it runs:

```
opencode run --standalone --auto -m <provider/model> "<prompt>" < /dev/null
```

- `--standalone` — private server for the job, independent of the background service's state.
- `--auto` — auto-approves permissions not explicitly denied. Required for unattended work, and it is why jobs must run from a dedicated worktree (below).
- `-m` takes `provider/model`, optionally `provider/model#variant`. The wrapper checks the `:free` rule on the part before `#`.
- Output: the worker's final reply goes to stdout; stderr carries a `> <agent> · <model>` header. The default agent is `build`.

**Live-run verification (2026-10-04):** `scripts/opencode-route.sh -m opencode/muse-spark-1.3-contributor-free "<trivial prompt>"` from a scratch directory: exit 0, the expected reply on stdout, and stderr showing `> build · muse-spark-1.3-contributor-free`. Zero spend (free Zen route). The refusal paths (missing model, non-`provider/model`, paid Token Harbor IDs including `#variant` forms, missing prompt or brief file) were tested against a stub binary.

## Benchmark-proven free routes

| Role (see `model-routing.md`) | Exact model ID | Provider | Live catalog 2026-10-04 |
|---|---|---|---|
| Muse Spark 1.3 | `opencode/muse-spark-1.3-contributor-free` | Zen (OpenCode) | listed; executed OK |
| Space Bunny | `opencode/space-bunny-free` | Zen (OpenCode) | listed |
| DeepSeek V4.1 Flash Free | `tokenharbor/deepseek-v4.1-flash:free` | Token Harbor | listed |
| MiMo V2.6 Flash Free — **experimental, no default lane** | `tokenharbor/mimo-v2.6-flash:free` | Token Harbor | listed |

Only these IDs are approved GT3 routes. Other entries in the catalog (OpenRouter, Nvidia, Poolside and similar, plus `opencode/mimo-v2.6-flash-free`, a Zen MiMo listing the benchmark did not test) are not routes. Use them only on explicit user request.

**Token Harbor `:free` is mandatory.** Token Harbor lists paid siblings next to the free IDs: `tokenharbor/deepseek-v4.1-flash` and `tokenharbor/mimo-v2.6-flash`, and paid `claude-*`/`gpt-*` entries too. Never drop the suffix, never substitute a sibling, never spend money or top up a provider without explicit user approval. The wrapper refuses any `tokenharbor/` ID that doesn't end in `:free`.

## Route health

Free routes are shared and can be rate-limited, overloaded or withdrawn. A provider or route failure is **not** a model capability failure (`model-routing.md` §10, "Free-route health"). When a job fails on a route:

1. Re-check that the exact ID is still listed (command below) before concluding anything.
2. Don't retry a broken free route in a loop. Fall through to the next lane in `model-routing.md` §14.
3. If an ID has drifted, update this table rather than guessing a replacement.

## Credential isolation

Token Harbor and the other external providers are for **OpenCode only**. OpenCode keeps their credentials in its own store (`opencode auth login`, the `/connect` flow). Verified 2026-10-04: `opencode auth list` shows Token Harbor stored there. No `ANTHROPIC_*` or `OPENAI_*` variables are set in the environment, and none appear in shell startup files. The only Token Harbor shell entry is a `PATH` addition for its CLI binary in `~/.bash_profile`, which changes no provider.

Never:

- set `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`, or `OPENAI_BASE_URL` / `OPENAI_API_BASE` / `OPENAI_API_KEY`, to Token Harbor, globally or in shell startup;
- source a Token Harbor env file from shell startup;
- route Claude Code or Codex through Token Harbor. Claude Code stays on Anthropic's native provider, and Codex on OpenAI's (`codex-cli-invocation.md`);
- print or copy a key into docs, prompts, logs or repo files. `opencode auth export` prints secrets, so don't run it in a logged session.

## Safe verification commands

```
opencode --version
opencode service status                  # background server URL
opencode auth list                       # provider names + "stored"; no secrets
script -q /dev/null opencode models | grep -E 'muse-spark-1.3-contributor-free|space-bunny-free|deepseek-v4.1-flash|mimo-v2.6-flash'
```

`opencode models` prints **nothing** when stdout isn't a terminal (observed on v2.0.22). Wrap it in `script` as above when calling it from an agent. The command exactly as written was verified 2026-10-04. A variant piping `script` output with stdin redirected from `/dev/null` printed nothing, so keep the form above. `opencode run` is not affected.

## Dedicated worktree rule

Like Codex jobs, routed OpenCode jobs run with auto-approved edits and commands in their launch directory. Launch them from a manager-created worktree on the job's branch, never the user's main checkout. The host limits in `autonomous-mode.md` §6 (one heavy local job at a time on this 8 GB Mac) apply to OpenCode workers too: inference is remote, but their builds, browsers and tests run locally.

## This file drifts

Free-route IDs, providers and pricing are operational data, not permanent truth. They were valid during the benchmark (2026-10-03/04) and in the live catalog on 2026-10-04. Re-verify against `opencode models` when a job fails or a session starts relying on them, and update this file when they change.
