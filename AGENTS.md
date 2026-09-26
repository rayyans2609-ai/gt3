# GT3 — read first

Start with `GT3_MASTER_CONTEXT.md` for project orientation and the source-of-truth hierarchy.

AI model-routing and Codex-delegation rules are canonical at:

- `docs/ai/model-routing.md` — roles, escalation, reasoning-effort policy
- `docs/ai/codex-cli-invocation.md` — verified slugs, invocation syntax, config-default trap

Route Codex jobs through `scripts/codex-route.sh`, not a bare `codex exec` call — it refuses to run without an explicit model and reasoning effort.
