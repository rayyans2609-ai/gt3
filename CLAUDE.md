# GT3 — read first

Start with `GT3_MASTER_CONTEXT.md` for project orientation and the source-of-truth hierarchy.

AI model routing and delegation are canonical at:

- `docs/ai/model-routing.md` — routing principles (scarcity, delegation, context, review, verification), current model roles, quota modes, reasoning-effort policy; evidence log in `docs/ai/routing-evidence.md`
- `docs/ai/codex-cli-invocation.md` — Codex execution: verified slugs, invocation syntax, config-default trap
- `docs/ai/opencode-invocation.md` — OpenCode/free-route execution: exact model IDs, `:free` rule, credential isolation

Unattended multi-hour runs ("Enter GT3 Autonomous Mode" / "Run this autonomously") and all heavy-local-job host limits: `docs/ai/autonomous-mode.md`.

Route Codex jobs through `scripts/codex-route.sh` (explicit model + reasoning effort) and OpenCode jobs through `scripts/opencode-route.sh` (explicit model; paid Token Harbor routes refused), never a bare `codex exec` / `opencode run`. Both refuse to run without an explicit model; never rely on a global or default model. Launch routed jobs from a dedicated worktree, not the main checkout.
