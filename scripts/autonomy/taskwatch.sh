#!/bin/bash
# Active task watchdog: deterministic sampling + Luna interpretation on change/anomaly.
# Usage: taskwatch.sh <name> <worker-log> <brief-pattern> <watched-worktree> <brief-file>
# Writes tmp/<name>-status.md (always current). Exits (one manager notification) only when
# the worker finished/died or Luna says intervention is needed.
T=${TASKWATCH_DIR:-${CLAUDE_JOB_DIR:-/tmp}/tmp}
NAME=$1; LOG=$2; PAT=$3; WT=$4; BRIEF=$5
STATUS=$T/$NAME-status.md
ROUTE=${TASKWATCH_ROUTE:-$(cd "$(dirname "$0")/.." && pwd)/codex-route.sh}
SAMPLE=300            # deterministic sample interval (s)
LUNA_MIN=1200         # min seconds between routine Luna interpretations
STALE=1200            # log unchanged this long = anomaly
last_luna=0; last_sig=""; luna_note="(none yet)"
while true; do
  now=$(date +%s)
  alive=no; pgrep -f "$PAT" >/dev/null && alive=yes
  lmod=$(stat -f %m "$LOG" 2>/dev/null || echo 0); lsize=$(stat -f %z "$LOG" 2>/dev/null || echo 0)
  age=$((now - lmod))
  stages=$(grep -o '\*\*[^*]\{4,90\}\*\*' "$LOG" 2>/dev/null | tail -4 | tr '\n' ' ')
  tail_txt=$(tail -c 600 "$LOG" 2>/dev/null | tr -d '\033' | tr '\n' ' ' | cut -c1-400)
  quota=$(tail -c 3000 "$LOG" 2>/dev/null | grep -o -i "hit your usage limit[^.]*\|try again at [0-9:APM ]*" | tail -1)
  errs=$(tail -c 3000 "$LOG" 2>/dev/null | grep -c -i "error\|traceback\|FAIL")
  files=$(cd "$WT" 2>/dev/null && { git status --short | wc -l | tr -d ' '; })
  newest=$(cd "$WT" 2>/dev/null && find scripts -type f -newer "$BRIEF" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -3 | tr '\n' ' ')
  commits=$(cd "$WT" 2>/dev/null && git log --oneline -3 | tr '\n' ';')
  host=$(tail -1 $T/hostmon.log 2>/dev/null)
  sig="$alive|$lsize|$files|$newest|$quota"
  anomaly=""
  [ "$alive" = no ] && anomaly="worker process gone"
  [ "$age" -gt "$STALE" ] && [ "$alive" = yes ] && anomaly="log unchanged ${age}s"
  [ -n "$quota" ] && anomaly="quota: $quota"
  # Luna only on anomaly, or on changed evidence no more often than LUNA_MIN.
  if [ -n "$anomaly" ] || { [ "$sig" != "$last_sig" ] && [ $((now - last_luna)) -ge $LUNA_MIN ]; }; then
    prompt="You are a watchdog interpreter. From this evidence about a running coding worker, reply with ONE line of JSON only: {\"stage\":\"<which brief scope item>\",\"activity\":\"coding|testing|simulating|blocked|waiting|finished\",\"healthy\":true|false,\"intervention_needed\":true|false,\"note\":\"<=20 words\"}. Brief scope items: 1 watcher, 2 quota.json, 3 worker registry/events, 4 explicit resume, 5 sol-takeover.md, 6 continuity.md template, 7 A-K simulation. Evidence: alive=$alive; log_age_s=$age; recent_stage_headings=$stages; log_tail=$tail_txt; changed_files=$files; newest_files=$newest; recent_commits=$commits; error_hits=$errs; quota_text=$quota; host=$host; anomaly=$anomaly"
    luna_note=$("$ROUTE" -m gpt-6-luna -r low "$prompt" 2>/dev/null | grep -o '{"stage".*}' | tail -1)
    [ -z "$luna_note" ] && luna_note="(luna unavailable — deterministic status only)"
    last_luna=$now; last_sig=$sig
  fi
  {
    echo "# $NAME status — $(date '+%H:%M:%S')"
    echo "- alive: $alive | log age: ${age}s | log bytes: $lsize | error hits (recent): $errs"
    echo "- recent stages: $stages"
    echo "- changed files in worktree: $files | newest: $newest"
    echo "- recent commits: $commits"
    echo "- host: $host"
    echo "- quota/tool block: ${quota:-none}"
    echo "- anomaly: ${anomaly:-none}"
    echo "- luna interpretation: $luna_note"
  } > "$STATUS.tmp" && mv "$STATUS.tmp" "$STATUS"
  if [ "$alive" = no ]; then echo "$NAME: worker finished/exited — see $STATUS"; exit 0; fi
  if echo "$luna_note" | grep -q '"intervention_needed":true'; then echo "$NAME: intervention needed — $luna_note"; exit 0; fi
  sleep $SAMPLE
done
