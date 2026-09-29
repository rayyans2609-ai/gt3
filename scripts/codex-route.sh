#!/usr/bin/env bash
# Canonical GT3 Codex invocation path — see docs/ai/codex-cli-invocation.md.
#
# Requires explicit model + reasoning effort on every call so a routed job can
# never silently fall back to whatever ~/.codex/config.toml currently defaults
# to (that default has been observed to drift on its own — see the doc above).
#
# Usage:
#   scripts/codex-route.sh -m <model> -r <reasoning-effort> "<prompt>"
#   scripts/codex-route.sh -m <model> -r <reasoning-effort> @path/to/brief.md
#
# Model/reasoning-effort selection is a manager decision — see
# docs/ai/model-routing.md. This script only enforces that the decision was
# actually made, not what it should be.

set -euo pipefail

usage() {
  echo "Usage: $0 [-m model] [-r effort] <prompt|@brief-file>" >&2
  echo "       $0 resume -m <model> -r <effort> <session-id> <prompt|@brief-file>" >&2
  echo "  models seen supported as of docs/ai/codex-cli-invocation.md:" >&2
  echo "    gpt-6-astra gpt-6-sol gpt-6-luna gpt-5.6-sol gpt-5.6-terra gpt-5.6-luna" >&2
  echo "  reasoning-effort: low | medium | high | xhigh | max | ultra" >&2
  exit 2
}

model=""
effort=""
mode="new"
if [[ ${1:-} == resume ]]; then
  mode="resume"
  shift
fi

while getopts ":m:r:" opt; do
  case "$opt" in
    m) model="$OPTARG" ;;
    r) effort="$OPTARG" ;;
    *) usage ;;
  esac
done
shift $((OPTIND - 1))

case "$model" in
  gpt-6-astra|gpt-6-sol|gpt-6-luna|gpt-5.6-sol|gpt-5.6-terra|gpt-5.6-luna) ;;
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

if [[ $# -lt 1 || -z "${1:-}" ]]; then
  echo "codex-route: missing prompt or @brief-file argument" >&2
  usage
fi

session=""
if [[ "$mode" == resume ]]; then
  [[ $# -ge 2 && "$1" =~ ^[0-9a-fA-F-]{36}$ ]] || usage
  session="$1"
  shift
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

codex_args=(exec)
if [[ "$mode" == resume ]]; then codex_args+=(resume); fi
codex_args+=(--dangerously-bypass-approvals-and-sandbox --skip-git-repo-check
  -m "$model" -c "model_reasoning_effort=\"$effort\"")
if [[ "$mode" == resume ]]; then codex_args+=("$session"); fi
codex_args+=("$prompt")

if [[ ${GT3_RUN_DIR+x} ]]; then
  if [[ ${GT3_MANAGER_LAUNCH:-} == 1 ]]; then
    exec "$(dirname "$0")/autonomy/controller.sh" launch-manager -- \
      codex "${codex_args[@]}" < /dev/null
  fi
  exec "$(dirname "$0")/autonomy/controller.sh" run dispatch -- \
    codex "${codex_args[@]}" < /dev/null
fi

exec codex "${codex_args[@]}" < /dev/null
