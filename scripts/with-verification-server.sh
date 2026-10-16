#!/bin/bash
# Run only inside the canonical heavy gate. Bind the exact harness address.
# Starts an owned Vite server for this checkout, writes provenance next to the log, exports
# GT3_URL and runs the harness. Runtime evidence without its .provenance.json is not
# acceptable evidence (docs/ai/operating-contract.md §7).
#   GT3_SERVER_LOG (required)  artifact log path; .pid/.identity/.root/.provenance.json beside it
#   GT3_SERVER_ROOT            checkout to serve (default: $PWD)
#   GT3_PORT                   port (default 5201); give each same-Mac worktree its own
set -euo pipefail
TASK_ROOT=${GT3_SERVER_ROOT:-$PWD}
TASK_LOG=${GT3_SERVER_LOG:?set GT3_SERVER_LOG to the run artifact path}
TASK_PORT=${GT3_PORT:-5201}
[[ "$TASK_PORT" =~ ^[0-9]+$ ]] || { echo "GT3_PORT must be numeric" >&2; exit 2; }
HOST_CHECK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/host-check.mjs"
cd "$TASK_ROOT"
if lsof -nP -iTCP:"$TASK_PORT" -sTCP:LISTEN; then
  echo "Port $TASK_PORT occupied; no unowned server reuse (set GT3_PORT)" >&2
  exit 1
fi
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port "$TASK_PORT" --strictPort > "$TASK_LOG" 2>&1 &
TASK_VITE=$!
TASK_IDENTITY=$(ps -o lstart=,command= -p "$TASK_VITE")
printf '%s\n' "$TASK_VITE" > "$TASK_LOG.pid"
printf '%s\n' "$TASK_IDENTITY" > "$TASK_LOG.identity"
pwd -P > "$TASK_LOG.root"
cleanup() {
  TASK_CURRENT=$(ps -o lstart=,command= -p "$TASK_VITE" 2>/dev/null || true)
  if [ -n "$TASK_CURRENT" ] && [ "$TASK_CURRENT" = "$TASK_IDENTITY" ]; then
    kill -TERM "$TASK_VITE" 2>/dev/null || true
    wait "$TASK_VITE" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 143' TERM INT
TASK_READY=0
for ((i=0; i<40; i++)); do
  kill -0 "$TASK_VITE" 2>/dev/null || break
  if curl -fsS "http://127.0.0.1:$TASK_PORT/" >/dev/null 2>&1; then TASK_READY=1; break; fi
  sleep 1
done
if [ "$TASK_READY" != 1 ]; then
  echo "Owned Vite failed readiness; inspect $TASK_LOG" >&2
  exit 1
fi
export GT3_URL=http://127.0.0.1:$TASK_PORT
GT3_PROV_DIRTY=$(git status --porcelain | wc -l | tr -d ' ') \
GT3_PROV_HASH=$( (git diff HEAD; git status --porcelain) | shasum -a 256 | cut -c1-16) \
GT3_PROV_HOST=$(node "$HOST_CHECK" identity 2>/dev/null || echo null) \
GT3_PROV_BRANCH=$(git symbolic-ref --quiet --short HEAD || echo DETACHED) \
GT3_PROV_SHA=$(git rev-parse HEAD) GT3_PROV_PID=$TASK_VITE GT3_PROV_OUT="$TASK_LOG.provenance.json" \
node -e '
const e = process.env, fs = require("fs");
fs.writeFileSync(e.GT3_PROV_OUT, JSON.stringify({
  startedAt: new Date().toISOString(), url: e.GT3_URL, root: process.cwd(), branch: e.GT3_PROV_BRANCH,
  sha: e.GT3_PROV_SHA, dirtyFiles: +e.GT3_PROV_DIRTY, dirtyHash: e.GT3_PROV_HASH, vitePid: +e.GT3_PROV_PID,
  run: e.GT3_RUN || null, epoch: e.GT3_EPOCH || null, task: e.GT3_TASK || null,
  harness: process.argv.slice(1).join(" "), host: JSON.parse(e.GT3_PROV_HOST) }, null, 1) + "\n");
' -- "$@"
"$@"
