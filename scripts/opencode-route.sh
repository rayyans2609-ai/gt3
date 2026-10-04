#!/usr/bin/env bash
# Canonical GT3 OpenCode invocation path — see docs/ai/opencode-invocation.md.
#
# Requires an explicit model on every call so a routed job can never fall back
# to whatever OpenCode's own config currently defaults to, and refuses any
# Token Harbor model that is not an explicit `:free` route (Token Harbor lists
# paid siblings next to the free ones).
#
# Usage:
#   scripts/opencode-route.sh -m <provider/model> "<prompt>"
#   scripts/opencode-route.sh -m <provider/model> @path/to/brief.md
#
# Run it from a manager-created dedicated worktree, never the main checkout:
# --auto approves the worker's file edits and commands in the launch directory.
#
# Model selection is a manager decision — see docs/ai/model-routing.md. This
# script only enforces that the decision was made and that it stays free on
# Token Harbor. It never reads, sets or exports provider credentials; OpenCode
# uses its own credential store.

set -euo pipefail

usage() {
  echo "Usage: $0 -m <provider/model> <prompt|@brief-file>" >&2
  echo "  proven routes as of docs/ai/opencode-invocation.md:" >&2
  echo "    opencode/muse-spark-1.3-contributor-free opencode/space-bunny-free" >&2
  echo "    tokenharbor/deepseek-v4.1-flash:free" >&2
  exit 2
}

model=""

while getopts ":m:" opt; do
  case "$opt" in
    m) model="$OPTARG" ;;
    *) usage ;;
  esac
done
shift $((OPTIND - 1))

if [[ -z "$model" ]]; then
  echo "opencode-route: -m <provider/model> is required (no default is ever assumed)" >&2
  usage
fi

if [[ "$model" != */* ]]; then
  echo "opencode-route: model must be a full provider/model ID, got '$model'" >&2
  usage
fi

# OpenCode accepts provider/model#variant; check the route without the variant.
route="${model%%#*}"
if [[ "$route" == tokenharbor/* && "$route" != *:free ]]; then
  echo "opencode-route: refusing paid Token Harbor route '$model' — only explicit ':free' IDs are authorized" >&2
  exit 2
fi

if [[ $# -lt 1 || -z "${1:-}" ]]; then
  echo "opencode-route: missing prompt or @brief-file argument" >&2
  usage
fi

prompt="$1"
if [[ "$prompt" == @* ]]; then
  brief_path="${prompt:1}"
  if [[ ! -f "$brief_path" ]]; then
    echo "opencode-route: brief file not found: $brief_path" >&2
    exit 2
  fi
  prompt="$(cat "$brief_path")"
fi

exec opencode run --standalone --auto -m "$model" "$prompt" < /dev/null
