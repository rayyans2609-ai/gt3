#!/usr/bin/env bash
# Canonical GT3 Codex invocation path — see docs/ai/codex-cli-invocation.md.
#
# Requires explicit model + reasoning effort on every call so a routed job can
# never silently fall back to whatever ~/.codex/config.toml currently defaults
# to (that default has been observed to drift on its own — see the doc above).
#
# Usage:
#   scripts/codex-route.sh -m <model> -r <reasoning-effort> [-s <sandbox>] "<prompt>"
#   scripts/codex-route.sh -m <model> -r <reasoning-effort> [-s <sandbox>] @path/to/brief.md
#
# -s sandbox (default: full, the proven Phase 1–3 behaviour):
#   read-only  Codex read-only sandbox; may run from any checkout (review/evidence/inspection).
#   workspace  writes confined to the worktree; no network, no localhost bind, and git
#              commits in a linked worktree fail. The worker leaves a diff; the manager
#              reviews and commits it (docs/ai/operating-contract.md §5).
#   full       --dangerously-bypass-approvals-and-sandbox. Needed for builds, Vite, browsers.
#
# Workers run with Codex native multi-agent disabled so nested agents cannot bypass host
# accounting; `ultra` (automatic task delegation) is refused unless GT3_LAUNCH_ROLE=manager.
#
# Model/reasoning-effort selection is a manager decision — see
# docs/ai/model-routing.md. This script only enforces that the decision was
# actually made, not what it should be.

set -euo pipefail
ROUTE_GUARD_NAME=codex-route
source "$(dirname "${BASH_SOURCE[0]}")/lib/route-guard.sh"

usage() {
  echo "Usage: $0 -m <model> -r <reasoning-effort> [-s read-only|workspace|full] <prompt|@brief-file>" >&2
  echo "  models seen supported as of docs/ai/codex-cli-invocation.md:" >&2
  echo "    gpt-6.1-sol gpt-6-astra gpt-6-luna gpt-5.6-terra gpt-6-sol gpt-5.6-sol gpt-5.6-luna" >&2
  echo "  reasoning-effort: low | medium | high | xhigh | max | ultra" >&2
  exit 2
}

model=""
effort=""
sandbox="full"

while getopts ":m:r:s:" opt; do
  case "$opt" in
    m) model="$OPTARG" ;;
    r) effort="$OPTARG" ;;
    s) sandbox="$OPTARG" ;;
    *) usage ;;
  esac
done
shift $((OPTIND - 1))

case "$model" in
  gpt-6.1-sol|gpt-6-astra|gpt-6-sol|gpt-6-luna|gpt-5.6-sol|gpt-5.6-terra|gpt-5.6-luna) ;;
  "")
    echo "codex-route: -m <model> is required (no default is ever assumed)" >&2
    usage
    ;;
  *)
    echo "codex-route: unrecognized model '$model' — keep this list synced with docs/ai/codex-cli-invocation.md" >&2
    usage
    ;;
esac

case "$effort" in
  low|medium|high|xhigh|max|ultra) ;;
  "")
    echo "codex-route: -r <reasoning-effort> is required (no default is ever assumed)" >&2
    usage
    ;;
  *)
    echo "codex-route: unrecognized reasoning effort '$effort'" >&2
    usage
    ;;
esac

case "$sandbox" in
  read-only) sandbox_args=(--sandbox read-only -c 'approval_policy="never"') ;;
  workspace) sandbox_args=(--sandbox workspace-write -c 'approval_policy="never"') ;;
  full)      sandbox_args=(--dangerously-bypass-approvals-and-sandbox) ;;
  *) echo "codex-route: unrecognized sandbox '$sandbox'" >&2; usage ;;
esac

if [[ $# -lt 1 || -z "${1:-}" ]]; then
  echo "codex-route: missing prompt or @brief-file argument" >&2
  usage
fi

prompt="$1"
if [[ "$prompt" == @* ]]; then
  brief_path="${prompt:1}"
  if [[ ! -f "$brief_path" ]]; then
    echo "codex-route: brief file not found: $brief_path" >&2
    exit 2
  fi
  prompt="$(cat "$brief_path")"
fi

# Refuse before route_guard so a refused job is never logged as a launch.
if [[ "$effort" == ultra && "${GT3_LAUNCH_ROLE:-worker}" != manager ]]; then
  echo "codex-route: 'ultra' delegates automatically and bypasses host accounting; refused for workers" >&2
  exit 2
fi

route_guard codex "$model" "$sandbox"

exec codex exec "${sandbox_args[@]}" --skip-git-repo-check --disable multi_agent \
  -m "$model" -c "model_reasoning_effort=\"$effort\"" "$prompt" < /dev/null
