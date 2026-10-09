#!/bin/bash
# Run only inside the canonical heavy gate. Bind the exact harness address.
set -euo pipefail
TASK_ROOT=${GT3_SERVER_ROOT:-$PWD}
TASK_LOG=${GT3_SERVER_LOG:?set GT3_SERVER_LOG to the run artifact path}
cd "$TASK_ROOT"
if lsof -nP -iTCP:5201 -sTCP:LISTEN; then
  echo 'Port 5201 occupied; no unowned server reuse' >&2
  exit 1
fi
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5201 --strictPort > "$TASK_LOG" 2>&1 &
TASK_VITE=$!
TASK_IDENTITY=$(ps -o lstart=,command= -p "$TASK_VITE")
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
  if curl -fsS http://127.0.0.1:5201/ >/dev/null 2>&1; then TASK_READY=1; break; fi
  sleep 1
done
if [ "$TASK_READY" != 1 ]; then
  echo "Owned Vite failed readiness; inspect $TASK_LOG" >&2
  exit 1
fi
export GT3_URL=http://127.0.0.1:5201
"$@"
