# GT3 — OpenCode Invocation (canonical)

Execution-specific layer only. Which worker gets which task (HY4; Bunny, MiMo) lives in [`docs/ai/model-routing.md`](./model-routing.md) — do not duplicate it here. Codex execution is in [`codex-cli-invocation.md`](./codex-cli-invocation.md).

**Status (2026-11-01, Intel):** `opencode v2.1.2`, binary at `~/.opencode/bin/opencode` (not on the default shell PATH). Since 2026-11-04 the wrapper resolves `GT3_OPENCODE_BIN`, then PATH, then `~/.opencode/bin`, and `host-check identity` reports the path it found, so no PATH change is needed; re-verified that day with a minimal PATH (GLM, trivial prompt, exit 0). Owner decision: **Muse is withdrawn and replaced by GLM 5.3 Flash Free and DeepSeek V4.1 Flash Free, both on OpenCode Zen.** Live catalog: `opencode/glm-5.3-flash-free` and `opencode/deepseek-v4.1-flash-free` listed and INVOCATION VERIFIED (`opencode-route.sh`, trivial prompt, exit 0, header `> build · <model>`, zero spend). `opencode/muse-spark-1.3-contributor-free` and `opencode/space-bunny-free` are no longer listed. Token Harbor is no longer used for DeepSeek, as active route or fallback. Earlier status, kept as history — **(2026-10-16, M4):** `opencode v2.0.30`. `opencode auth list` reports **no authenticated integrations**, so Token Harbor routes (DeepSeek, MiMo) are **unavailable on the M4** until the owner logs in there. The live catalog lists `opencode/muse-spark-1.3-contributor-free`, `opencode/space-bunny-free`, `opencode/mimo-v2.6-flash-free` and a Zen `opencode/deepseek-v4.1-flash-free`. The Zen DeepSeek ID is untested and **not** an approved substitute. Route availability is per host (`operating-contract.md` §10.3). Earlier status: verified 2026-10-04 against a locally installed `opencode v2.0.22` (`~/.opencode/bin/opencode`, macOS). The route IDs below were also used throughout the GT3 model benchmark (2026-10-03/04). Re-verify at the start of a session that depends on them — see "This file drifts".

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

## Approved free routes

| Role (see `model-routing.md`) | Exact model ID | Provider | Status |
|---|---|---|---|
| HY4 Flash Free — **provisional** (replaced Muse/GLM, owner 2026-11-26) | `opencode/hy4-flash-free` | Zen (OpenCode) | executed end to end 2026-11-25 (Intel); first bounded implementation trial 2026-11-25, Terra-reviewed |
| Space Bunny | `opencode/space-bunny-free` | Zen (OpenCode) | **unavailable**: not listed 2026-11-01 |
| MiMo V2.6 Flash Free — **experimental, no default lane** | `tokenharbor/mimo-v2.6-flash:free` | Token Harbor | listed 2026-11-01; not re-tested |

**Retired routes (history).** `opencode/muse-spark-1.3-contributor-free` (Muse; benchmark-proven 2026-10-04, withdrawn from the catalog by 2026-11-01) and `tokenharbor/deepseek-v4.1-flash:free` (the benchmark's DeepSeek listing; retired by the owner 2026-11-01, not a fallback). `opencode/glm-5.3-flash-free` (deprecated by the owner 2026-11-26) and `opencode/deepseek-v4.1-flash-free` (no further work, owner 2026-11-26). Their evidence stays in `routing-evidence.md` and `model-routing.md` §15.

Only these IDs are approved GT3 routes. Other entries in the catalog (OpenRouter, Nvidia, Poolside and similar, other Zen `*-free` models, `opencode/mimo-v2.6-flash-free`, and paid `tokenharbor/glm-5.3*` listings) are not routes. Use them only on explicit user request.

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
script -q /dev/null opencode models | grep -E 'hy4-flash-free|space-bunny-free|mimo-v2.6-flash'
```

`opencode models` prints **nothing** when stdout isn't a terminal (observed on v2.0.22). Wrap it in `script` as above when calling it from an agent. The command exactly as written was verified 2026-10-04. A variant piping `script` output with stdin redirected from `/dev/null` printed nothing, so keep the form above. `opencode run` is not affected.

## Dedicated worktree rule

Like Codex jobs, routed OpenCode jobs run with auto-approved edits and commands in their launch directory. Launch them from a manager-created worktree on the job's branch, never the user's main checkout. `scripts/lib/route-guard.sh` **enforces** this: it refuses the main checkout and branch `main`. Under `GT3_CONFIG=sol-led`, only GLM and DeepSeek (Zen) are allowed. The host limits in `operating-contract.md` §6 apply to OpenCode workers too: inference is remote, but their builds, browsers and tests run locally and count host-wide.

## Browser verification from OpenCode workers (verified 2026-11-25, Intel, opencode v2.4.1)

An OpenCode worker must **never launch Chrome and never use `open`**. Verify in the dedicated attach-only browser below. The Codex-side equivalent (a narrow door out of the Seatbelt sandbox) is `codex-cli-invocation.md` "Browser harnesses from a confined worker"; OpenCode needs no door because the browser is already running.

**Why the other paths fail** (diagnosed 2026-11-25 from OpenCode session logs and reproduced):

| Symptom | Cause |
|---|---|
| Playwright MCP or a direct Chrome launch dies with Crashpad `bootstrap_check_in … unknown error code (141)` → `SIGABRT` | A process started inside an agent or sandboxed context cannot register Crashpad's Mach port. A Seatbelt profile denying Mach registration reproduces it (exit 134); the same Chrome launches fine from a plain shell. It is the same class as Codex's `workspace-write` failure, and a long-lived `opencode serve --service` started from such a context carries it into every later session. |
| `open` fails: `LSCopyApplicationURLsForBundleIdentifier() failed`, `kLSNoExecutableErr`, "Unable to find application" | LaunchServices lookups are denied in the same context. Not a missing app. |
| `browse` MCP: "The tab went away" / "The user dismissed the browser's debugging bar" | Chrome sends a debugger detach (`target.detached reason=released-by-user` in `~/.local/state/browse/logs/relay.log`) about 1 s after `browse` attaches in the owner's real profile, with no human action; reproduced 2026-11-25. Relay, pairing and extension all report healthy. **Not fixable from the agent side; the Chrome-side trigger was not identified.** `browse` stays installed for tasks that need the owner's logged-in tabs, but is not a verification route. |

**The route: `chrome-devtools-verify`.** A Chrome DevTools MCP (`chrome-devtools-mcp@1.14.0 --browserUrl=http://127.0.0.1:9333`) attached over CDP to a headless Chrome that **launchd owns** (LaunchAgent `dev.opencode.verify-chrome`, parent PID 1, bound to 127.0.0.1 only, own profile `~/.local/share/opencode-verify-browser/profile`, `KeepAlive`, about 350 MB resident idle, real Metal-backed WebGL on the Intel GPU). Because the agent only attaches, no agent process ever starts Chrome. These pieces live in the owner's home, **outside the repo and per host**; nothing here installs them, and the M4 needs them recreated:

| Piece | Location |
|---|---|
| LaunchAgent | `~/Library/LaunchAgents/dev.opencode.verify-chrome.plist`: Chrome with `--headless=new --remote-debugging-port=9333 --remote-debugging-address=127.0.0.1 --user-data-dir=<profile> --no-first-run --no-default-browser-check --window-size=1440,900 --enable-unsafe-swiftshader` |
| MCP entry (additive; other servers untouched) | `~/.config/opencode/opencode.json` → `mcp.servers.chrome-devtools-verify` (backup `opencode.json.pre-verify-browser`) |
| Control | `~/.local/bin/opencode-verify-browser start\|stop\|restart\|reset\|status\|health\|selftest` |
| Self-test | `~/.config/opencode/browser/selftest.mjs [--url <dev url>]`: spawns the configured MCP command and **executes** navigate, DOM snapshot, JS evaluation, screenshot and animation sampling; connection status alone is not evidence |
| Worker guidance | `~/.config/opencode/AGENTS.md` and skill `browser-verify` |

**Worker rules** (also in the global `AGENTS.md`, so a brief only needs "use `chrome-devtools-verify`"):

- `new_page {url}` → take `pageId` from the `[selected]` line → pass `pageId` to **every** later tool (omitting it is the common first-call error). Close only your own pages; the browser is shared.
- `emulate {pageId, prefersReducedMotion:"no-preference"}` before sampling GT3 motion. GT3 correctly disables its animations under `prefers-reduced-motion: reduce`; a 2026-11-25 worker misread that as a regression. The dedicated browser reports `no-preference` by default.
- Sample motion inside **one** async `evaluate_script` (timers or rAF, return an array); separate tool calls are too slow to sample. Screenshot `filePath` must be under the OS temp dir.
- Dev servers are reached at `http://127.0.0.1:<port>/`. GT3's harness rules still apply: owned, provenance-stamped Vite (`with-verification-server.sh`) for runtime evidence, and the host preflight (`host-check.mjs preflight browser`) before heavy runs. The idle browser counts toward the 8 GB host budget (`operating-contract.md` §6); `opencode-verify-browser stop` frees it.
- If the tools report connection refused: `opencode-verify-browser start`. If it is genuinely unusable, report BLOCKED with the exact error. Do not retry-loop and do not try other launch methods (that is the failure this section exists to end).

**Verified 2026-11-25:** the self-test's 11 checks pass against a fixture and a live GT3 Vite page, including from inside a Seatbelt profile where the old launch-its-own-Chrome `chrome-devtools` entry fails ("Target closed"). A real `opencode run --standalone --auto -m opencode/hy4-flash-free` loaded the skill on its own, ran the MCP end to end (5 distinct animation samples, a PNG screenshot, page closed), and the browser restarted itself 15 s after being killed. Logged in `routing-evidence.md`. The `playwright` and `chrome-devtools` entries in `opencode.json` still launch their own Chrome and still fail in agent contexts; they are kept only so existing setups do not break. `opencode/hy4-flash-free` was used as the probe because it is the model that reported the failures. After Terra's independent review of its first implementation, the owner approved it provisionally on 2026-11-26 (see "Approved free routes"). The owner accepted this infrastructure and its documentation on 2026-11-26. Token Harbor `:free` routes additionally need the owner to confirm free-model data sharing in the provider dashboard; an unconfirmed route fails with that message, which is an owner action, not a worker fault.

## This file drifts

Free-route IDs, providers and pricing are operational data, not permanent truth. They were valid during the benchmark (2026-10-03/04) and in the live catalog on 2026-10-04. Re-verify against `opencode models` when a job fails or a session starts relying on them, and update this file when they change.
