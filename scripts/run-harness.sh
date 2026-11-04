#!/usr/bin/env bash
# Guarded executor for GT3 verification harnesses (docs/ai/operating-contract.md §7).
#
# Why this exists: a browser harness needs an unsandboxed host process (Chrome cannot start
# inside Codex's workspace-write Seatbelt sandbox) and an owned Vite server. Launching a whole
# worker with its sandbox disabled (`codex-route.sh -s full`) is refused by Claude Code's
# auto-mode classifier ("Create Unsafe Agents"). Instead the worker stays confined and this ONE
# narrow command is allowed to run outside its sandbox (.codex/rules/gt3.rules, .claude route
# modes). It is deliberately small and fails closed.
#
# Usage:
#   scripts/run-harness.sh [-R <run> -T <task>] [-p <port>] <scripts/verify-NAME.mjs> [harness args...]
#
# Refuses unless:
#   * the harness path is exactly scripts/verify-<name>.mjs, tracked by git and unmodified vs HEAD
#     (only reviewed, committed harness code runs unsandboxed; commit a worker's new harness first);
#   * the checkout is a linked worktree on a non-main branch (same guard as the route wrappers);
#   * GT3_RUN, if given, is an active run held by a seat on this host (route-guard.sh);
#   * `host-check.mjs preflight browser` passes (exit 75 = wait, reported, not bypassed).
# Then runs the harness under scripts/with-verification-server.sh (owned Vite + provenance) and
# prints a SHORT summary, so a caller's context is not flooded. Full output and the provenance
# file are kept under local/evidence/<run>/<task>/.
set -euo pipefail
ROUTE_GUARD_NAME=run-harness
source "$(dirname "${BASH_SOURCE[0]}")/lib/route-guard.sh"

port=""
while getopts ":R:T:p:" opt; do
  case "$opt" in
    R) export GT3_RUN="$OPTARG" ;;
    T) export GT3_TASK="$OPTARG" ;;
    p) port="$OPTARG" ;;
    *) echo "Usage: $0 [-R run -T task] [-p port] scripts/verify-NAME.mjs [args...]" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
harness="${1:-}"; [[ -n "$harness" ]] || route_guard_die "missing harness (scripts/verify-NAME.mjs)"
shift
[[ "$harness" =~ ^scripts/verify-[A-Za-z0-9._-]+\.mjs$ ]] || route_guard_die "refusing '$harness': only scripts/verify-<name>.mjs may run here"

root=$(git rev-parse --show-toplevel 2>/dev/null) || route_guard_die "run inside a GT3 worktree"
cd "$root"
git ls-files --error-unmatch "$harness" >/dev/null 2>&1 || route_guard_die "refusing '$harness': not tracked by git (the manager commits a worker's new harness first)"
git diff --quiet HEAD -- "$harness" || route_guard_die "refusing '$harness': modified since HEAD (only committed, reviewed harness code runs unsandboxed)"

route_guard harness - full   # linked worktree, non-main branch, seat check when GT3_RUN is set

if [[ -z "$port" ]]; then
  for p in $(seq 5300 5399); do lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || { port=$p; break; }; done
fi
[[ "$port" =~ ^[0-9]+$ ]] || route_guard_die "no free port (pass -p)"

preflight_args=(preflight browser); [[ -n "${GT3_RUN:-}" ]] && preflight_args+=(-R "$GT3_RUN")
if ! pre=$(node scripts/host-check.mjs "${preflight_args[@]}" 2>&1); then
  echo "run-harness: BLOCKED host busy (preflight browser refused); retry later, do not run another heavy job"
  echo "$pre" | grep -A3 '"reasons"' | head -6
  exit 75
fi

name=$(basename "$harness" .mjs)
dir="local/evidence/${GT3_RUN:-adhoc}/${GT3_TASK:-harness}"
mkdir -p "$dir"
out="$dir/$name.out"; log="$PWD/$dir/$name.vite.log"
# A harness takes minutes. Print a heartbeat so a caller whose tool call yields early (Codex yields
# after ~30 s) can see it is still running and must keep waiting, not end its turn: ending the
# turn kills this process and the run is lost.
echo "run-harness: started $name (typically 1-10 min); keep waiting for the final 'exit=' line"
( n=0; while sleep 20; do n=$((n+20)); echo "run-harness: still running $name (${n}s)"; done ) &
beat=$!
trap 'kill "$beat" 2>/dev/null || true' EXIT
set +e
GT3_SERVER_LOG="$log" GT3_PORT="$port" \
  scripts/with-verification-server.sh node "$harness" "$@" > "$out" 2>&1
code=$?
set -e
kill "$beat" 2>/dev/null || true
wait "$beat" 2>/dev/null || true

echo "run-harness: $harness exit=$code"
pass=$(grep -E '"pass": *(true|false)' "$out" | tail -1 | tr -d ' ' || true)
[[ -n "$pass" ]] && echo "run-harness: reported $pass"
echo "run-harness: evidence $dir (output: $name.out, provenance: $name.vite.log.provenance.json)"
if [[ $code -ne 0 ]]; then echo "--- last 20 lines"; tail -20 "$out"; fi
exit $code
