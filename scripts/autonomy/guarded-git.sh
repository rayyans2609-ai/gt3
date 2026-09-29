#!/usr/bin/env bash
# Optional defence in depth. Use instead of git for manager-initiated mutations.
set -euo pipefail
if [[ $# -lt 1 ]]; then
  echo 'Usage: guarded-git.sh commit|push|checkout|switch|branch|reset|merge|rebase ...' >&2
  exit 2
fi
case "$1" in
  commit) action=repository-commit ;;
  push) action=repository-push ;;
  checkout|switch|branch|reset|merge|rebase) action=repository-branch ;;
  *) echo "guarded-git: unsupported mutating operation: $1" >&2; exit 2 ;;
esac
exec "$(dirname "$0")/controller.sh" run "$action" -- git "$@"
