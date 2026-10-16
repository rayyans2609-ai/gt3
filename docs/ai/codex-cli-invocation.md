# GT3 — Codex CLI Invocation (canonical)

Execution-specific layer only. Role/escalation/reasoning-*policy* doctrine lives in [`docs/ai/model-routing.md`](./model-routing.md) — do not duplicate it here. OpenCode free-route execution (Muse, DeepSeek, Bunny) is in [`docs/ai/opencode-invocation.md`](./opencode-invocation.md).

**Status (2026-10-16, M4):** `codex-cli 0.163.0` (npm, `~/.npm-global/bin/codex`), ChatGPT login. Catalog `fetched_at` 2026-10-16 lists the same routing slugs and effort levels as below. The ChatGPT desktop app bundles its **own** Codex (0.162.0-alpha.17.2), so a desktop-app manager and its wrapper-launched workers can run different Codex versions: record both via `node scripts/host-check.mjs identity`. The Intel is unverified (owner check in `operating-contract.md` §11). Earlier status: model catalog re-verified 2026-10-04 against a locally installed `codex-cli 0.160.0` (catalog `fetched_at` 2026-10-04); config/wrapper behavior below was verified on `0.157.1` (2026-09-26/27). Re-verify against `codex doctor` / `codex --version` / `~/.codex/models_cache.json` at the start of a new working session rather than trusting this file indefinitely — see "This file drifts" below. `scripts/codex-route.sh` itself was verified end-to-end by a live routed job on 2026-09-27 (see "Live-run verification").

## Required invocation path: `scripts/codex-route.sh`

Every GT3 Codex delegation should go through this wrapper, not a bare `codex exec` call. It makes explicit model + reasoning effort a hard requirement instead of a documentation convention someone has to remember:

```
scripts/codex-route.sh -m <model> -r <reasoning-effort> [-s read-only|workspace|full] "<prompt>"
scripts/codex-route.sh -m <model> -r <reasoning-effort> [-s read-only|workspace|full] @path/to/brief.md
```

It exits with an error and does **not** invoke Codex if `-m` or `-r` is missing, empty, or `-r` isn't one of the recognized levels. See "Default-fallback protection" below for why this exists.

Internally it runs (default `-s full`):

```
codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --disable multi_agent \
  -m <model> -c model_reasoning_effort="<effort>" "<prompt>" < /dev/null
```

### Sandbox modes and guards (2026-10-16)

| `-s` | Codex flags | Behaviour (verified on the M4) |
|---|---|---|
| `read-only` | `--sandbox read-only -c approval_policy="never"` | Live Luna run: header `sandbox: read-only`, `approval: never`; a shell write failed with "operation not permitted". May run from any checkout. |
| `workspace` | `--sandbox workspace-write -c approval_policy="never"` | Live Luna worker (2026-10-16): header `sandbox: workspace-write [workdir, /tmp, $TMPDIR]`; in-worktree create/append allowed; writes to the main checkout, home or repo root denied; `git add`/`commit` denied (index lock outside the worktree); push and curl failed DNS. The manager committed the diff. Earlier `codex sandbox -P :workspace` probe (no model): writes inside the worktree and `/tmp` succeed; writes to the main checkout or home are denied; **no network** (DNS fails); **localhost bind denied** (no Vite/browser); **git commit fails** in a linked worktree (its git dir lives in the main `.git`). Reads are unrestricted, including `~/.codex`. A `writable_roots` override did not enable commits in that probe. Use for editing-only workers; the manager commits. |
| `full` (default) | `--dangerously-bypass-approvals-and-sandbox` | Proven Phase 1–3 path; needed for builds, Vite and browsers. |

- `--disable multi_agent` is always passed: Codex's native multi-agent feature (stable, on by default in 0.163.0) would let a worker spawn unaccounted sub-agents.
- `ultra` ("maximum reasoning with automatic task delegation") is refused unless `GT3_LAUNCH_ROLE=manager`.
- `scripts/lib/route-guard.sh` also refuses writing modes in the main checkout or on `main`, refuses `OPENAI_API_KEY`/`OPENAI_BASE_URL`/`OPENAI_API_BASE`, enforces the Sol-led roster under `GT3_CONFIG=sol-led`, and logs launches under `GT3_RUN` (`operating-contract.md` §5).

### Native Codex manager (Sol-led)

A Sol-led manager is an interactive Codex session (or `codex exec` for unattended runs) that the owner starts. It is not a wrapper launch. The launch lines are in the manager card (`operating-contract.md`). Summary:
- orient with `-s read-only` in the main checkout;
- engineer with `-C <abs worktree>` in the default `workspace-write` sandbox, with per-invocation trust `-c 'projects."<abs worktree>".trust_level="trusted"'` so the project rules load;
- run unattended by adding `-c approval_policy="never"`.

Always pass `-m gpt-6.1-sol`, an explicit effort and `--disable multi_agent`.

**Project execpolicy** (`.codex/rules/gt3.rules`, verified live 2026-10-16 on `codex-cli 0.163.0`):
- `allow` runs a command **outside** the sandbox without prompting. A worker launched that way is not confined by the manager's sandbox: a full-mode worker bound localhost. Commands that match no rule stay sandboxed (a bare `sysctl` was denied in the same session).
- `prompt` is rejected under `approval_policy=never`.
- Check rule decisions offline with `codex execpolicy check -r .codex/rules/gt3.rules -- <command tokens>`.
- **Matching pitfalls (found in V2):** rules match the parsed command's leading tokens. A leading `VAR=value` assignment, or an inline argument with nested escaped quotes, stops the match, and the command runs sandboxed; the GT3 wrappers then fail closed on the seat guard. Use the wrappers' `-R <run> -T <task>` flags and `@brief-file` prompts.

**Phone and desktop app.** iPhone control goes through the ChatGPT app for **desktop-app** Codex sessions after pairing (*Settings → Connections → Control this Mac or PC*). Phone access to Terminal sessions is unverified. The desktop app can't take `--disable multi_agent` from a brief, so record that rather than assert it. The CLI's `codex remote-control` / `app-server … remote-control` subcommands are experimental and not the supported path. `codex remote-control` with no subcommand runs a foreground server, so inspect it with `--help` only. See `operating-contract.md` §9.

The raw syntax above was verified on 0.157.1 if you ever need to bypass the wrapper for a one-off interactive case, but the wrapper is the canonical path for routed jobs.

## Verified current model slugs

From `~/.codex/models_cache.json` (Codex's own catalog, `fetched_at` 2026-10-04, client 0.160.0 — this file is refreshed by Codex itself, so re-check its `fetched_at` before trusting slugs long after this doc's date):

| Slug | Catalog description | `supported_in_api` / `visibility` | Routing role (`model-routing.md` §11) |
|---|---|---|---|
| `gpt-6.1-sol` | Latest workhorse model for coding and everyday work | true / list | **GPT-6.1 Sol** — heavyweight engineering / execution lead |
| `gpt-6-astra` | Frontier intelligence for the most demanding work | true / list | GPT-6 Astra — rare, event-triggered senior escalation |
| `gpt-6-luna` | Fast and affordable model for easier tasks | true / list | GPT-6 Luna — mechanical / deterministic execution |
| `gpt-5.6-terra` | Older balanced model for straightforward work | true / list | GPT-5.6 Terra — reliable bounded paid worker |
| `gpt-6-sol` | Previous generation workhorse model | true / list | none (superseded by `gpt-6.1-sol`) |
| `gpt-5.6-sol` | Older generation workhorse model | true / list | none |
| `gpt-5.6-luna` | Older fast and efficient model | true / list | none |

Use `gpt-6.1-sol` for Sol; `gpt-6-sol` is the previous generation and is no longer the Sol route. `gpt-5.6-terra` stays in active routing as the reliable bounded paid worker, preferred over Sonnet for ordinary paid bounded work; much bounded work goes to the free Muse route first (`opencode-invocation.md`). (`gpt-5.5`, listed as "Legacy coding model", and hidden internal entries such as `gpt-reserve` and `codex-auto-review` are not part of the routing set.)

## Verified reasoning-effort values

All routing-set models accept: `low`, `medium`, `high`, `xhigh`, `max`. `gpt-6.1-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-6-sol` and `gpt-5.6-sol` additionally accept `ultra` ("maximum reasoning with automatic task delegation"); the Luna models do not.

Per-model catalog defaults (what the model would use if nothing else specified an effort — see the caveat immediately below): `gpt-6.1-sol`, `gpt-6-astra` and `gpt-5.6-sol` default to `low`; `gpt-6-luna`, `gpt-5.6-terra`, `gpt-6-sol` and `gpt-5.6-luna` default to `medium`. Note that the current Sol defaults to `low`, unlike `gpt-6-sol`, so an omitted effort would silently under-reason serious work.

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

- **Codex works unsandboxed in its launch directory** (in `full` mode). Launch routed jobs from a dedicated worktree on the job's branch, never from the user's main checkout, so its commits and branch changes cannot touch the working copy. A symlinked `node_modules` is fine; list it in `.git/info/exclude`, because `.gitignore`'s `node_modules/` pattern only matches directories.
- **Codex's own verification can be incomplete.** In its execution window it could not finish `npm run build` or get past the headless loading screen, and it reported that honestly. The manager re-ran the build and browser checks. Treat worker-reported verification gaps as manager work, per the acceptance ladder in `model-routing.md` §5.

The `codex-executor` MCP server continues to fail with `CONNECTION_CLOSED` (as of 2026-09-26; still failing 2026-10-04) — routed jobs go through the `codex` CLI via Bash (or `scripts/codex-route.sh`), which draws on the same quota as the MCP path would.

## This file drifts

Codex's own model catalog (`~/.codex/models_cache.json`) is fetched and refreshed by Codex itself — it will legitimately go stale relative to this document over time, and the config-default drift observed above shows the global config can change without any local edit. Re-verify slugs, reasoning levels, and the config default against the live environment at the start of a session rather than trusting this file's tables indefinitely.
