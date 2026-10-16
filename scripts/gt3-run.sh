#!/usr/bin/env bash
# GT3 run record: seat, epoch, handoff and checkpoint mechanics.
# Contract: docs/ai/operating-contract.md §3–§4. Deterministic; no model, no network
# writes. It never pushes: transfer is a bundle, or a push the owner separately authorizes.
#
#   gt3-run.sh status     <run>                     record + git/worker consistency checks
#   gt3-run.sh claim      <run> <seat> [--branch <b>] [--owner-confirmed]
#   gt3-run.sh release    <run> <seat> [--orphans-listed]
#   gt3-run.sh checkpoint <run> [--bundle <file> [--base <ref>] | --transfer]
#                                                   attach record to the branch tip (git note);
#                                                   --bundle/--transfer mark it handed to another host
#   gt3-run.sh import     <run> <bundle>            fetch a transferred checkpoint, reconcile epochs
#
# seat = <opus|sol>@<intel|m4|other>. The live record is local/runs/<run>/run.md in the main
# checkout (git-ignored). Same-host transitions are serialized by a mkdir lock; cross-host
# exclusivity is NOT enforced by this script — a claim over a record last held on another host
# requires --owner-confirmed, i.e. the owner states the old seat is stopped.
set -euo pipefail

die() { echo "gt3-run: $*" >&2; exit "${2:-2}"; }
ROOT=$(cd "$(git rev-parse --git-common-dir 2>/dev/null)/.." 2>/dev/null && pwd -P) || die "run inside the GT3 repository"
NOTES_REF=refs/notes/gt3-run
cmd=${1:-}; run=${2:-}
[[ -n "$cmd" && -n "$run" ]] || die "usage: gt3-run.sh <status|claim|release|checkpoint|import> <run> ..."
[[ "$run" =~ ^[A-Za-z0-9._-]+$ ]] || die "run id must be [A-Za-z0-9._-]"
DIR="$ROOT/local/runs/$run"; REC="$DIR/run.md"; shift 2

field() { sed -n "s/^$1: //p" "$REC" | head -1; }
set_field() { local tmp="$REC.tmp.$$"; awk -v k="$1" -v v="$2" 'BEGIN{d=0} !d && index($0, k": ")==1 {print k": "v; d=1; next} {print}' "$REC" > "$tmp" && mv "$tmp" "$REC"; }
history() { printf -- '- %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$REC"; }
host_tag() { if [[ -n "${GT3_HOST:-}" ]]; then echo "$GT3_HOST"; return; fi
  case "$(uname -m)/$(sysctl -n hw.memsize)" in arm64/17179869184) echo m4 ;; x86_64/8589934592) echo intel ;; *) echo other ;; esac; }
valid_seat() { [[ "$1" =~ ^(opus|sol)@(intel|m4|other)$ ]] || die "seat must be <opus|sol>@<intel|m4|other>, got '$1'"; }
lock() { mkdir -p "$DIR"; mkdir "$DIR/.transition.lock" 2>/dev/null || die "another transition is in progress on this host ($DIR/.transition.lock)" 4
  trap 'rmdir "$DIR/.transition.lock" 2>/dev/null || true' EXIT; }
branch_sha() { git rev-parse --verify --quiet "refs/heads/$1" || true; }
live_workers() { [[ -f "$DIR/launches.log" ]] || return 0
  sed -n 's/.* pid=\([0-9]*\) start=\([^ ]*\) .*epoch=\([0-9]*\) task=\([^ ]*\) provider=\([a-z]*\) model=\([^ ]*\).*/\1 \2 \3 \4 \5 \6/p' "$DIR/launches.log" |
  while read -r pid start ep task prov model; do
    [[ "$(ps -o lstart= -p "$pid" 2>/dev/null | tr ' ' _)" == "$start" ]] && echo "pid=$pid epoch=$ep task=$task $prov/$model"
  done; true; }

case "$cmd" in
status)
  [[ -f "$REC" ]] || die "no record $REC" 1
  sed -n '1,/^---$/p' "$REC" | sed '$d'
  b=$(field branch); want=$(field sha); epoch=$(field epoch); warn=0
  have=$(branch_sha "$b")
  echo "--- checks (host: $(host_tag))"
  if [[ -z "$have" ]]; then echo "WARN branch '$b' does not exist on this host"; warn=1
  elif [[ "$have" != "$want" ]]; then echo "NOTE branch tip $have differs from recorded sha $want (new commits since checkpoint, or stale record)"; else echo "OK   branch tip matches recorded sha"; fi
  if [[ -n "$have" ]] && git rev-parse --verify --quiet "refs/remotes/origin/$b" >/dev/null; then
    echo "INFO origin/$b ahead/behind (last fetch): $(git rev-list --left-right --count "refs/remotes/origin/$b...refs/heads/$b" | tr '\t' '/')"; fi
  wt=$(git worktree list --porcelain | awk -v b="refs/heads/$b" '/^worktree /{w=$2} $0=="branch "b{print w}')
  [[ -n "$wt" ]] && echo "INFO worktree $wt dirty files: $(git -C "$wt" status --porcelain | wc -l | tr -d ' ')"
  if [[ -n "$have" && -n "$want" ]] && git cat-file -e "$want" 2>/dev/null; then
    foreign=$(git log --format='%h %(trailers:key=GT3-Run,valueonly,separator=%x2C)' "$want..$b" 2>/dev/null | awk -v e="e$epoch" 'NF>1 && $2 !~ "/"e"/" {print}')
    [[ -n "$foreign" ]] && { echo "WARN commits since checkpoint from another epoch (revalidate before adopting):"; echo "$foreign"; warn=1; }
  fi
  lw=$(live_workers); [[ -n "$lw" ]] && { echo "INFO live workers launched under this run:"; echo "$lw"; }
  exit $warn ;;

claim)
  seat=${1:-}; shift || true; valid_seat "$seat"; branch=""; confirmed=0
  while [[ $# -gt 0 ]]; do case "$1" in --branch) branch=$2; shift 2 ;; --owner-confirmed) confirmed=1; shift ;; *) die "unknown option $1" ;; esac; done
  [[ "${seat#*@}" == "$(host_tag)" ]] || die "seat host '${seat#*@}' is not this host ($(host_tag)); claim from the host that will manage"
  lock
  if [[ ! -f "$REC" ]]; then
    [[ -n "$branch" ]] || die "new run: --branch <objective branch> is required"
    sha=$(branch_sha "$branch"); [[ -n "$sha" ]] || die "branch '$branch' not found"
    cat > "$REC" <<EOF
run: $run
config: $([[ ${seat%@*} == sol ]] && echo sol-led || echo opus-led)
seat: $seat
epoch: 1
state: active
branch: $branch
sha: $sha
updated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
---
## Objective and scope (owner-verbatim, with date)

## Tasks
| id | owner (model@effort) | worktree / branch | epoch | status | evidence |
|---|---|---|---|---|---|

## Evidence (claim → artifact · valid? · available@host)

## Blocked routes / quota

## Human decisions (NEEDS HUMAN VERIFICATION)

## Proposals (recorded, not implemented)

## Next step

## Handoff history
EOF
    history "e1 claimed by $seat at $sha"
    echo "claimed $run epoch 1 as $seat"; exit 0
  fi
  state=$(field state); holder=$(field seat); epoch=$(field epoch)
  if [[ "$state" == transferred && $confirmed -ne 1 ]]; then
    die "refused: this record was exported to another host at epoch $epoch. Reclaiming here needs --owner-confirmed (owner states the other host never claimed, or it was transferred back)" 4
  fi
  if [[ "$state" == active ]]; then
    die "refused: $run is active under $holder (epoch $epoch). The holder must release first; if it is unreachable, the owner decides (operating-contract.md §4.4)" 4
  fi
  if [[ "${holder#*@}" != "$(host_tag)" && $confirmed -ne 1 ]]; then
    die "refused: last seat $holder was on another host. Cross-host claims need --owner-confirmed (owner states the old seat is stopped and the checkpoint was imported)" 4
  fi
  b=$(field branch); sha=$(branch_sha "$b"); want=$(field sha)
  [[ -n "$sha" ]] || die "branch '$b' not present on this host; import the checkpoint first" 4
  [[ "$sha" == "$want" ]] || die "refused: branch tip $sha != released checkpoint $want. Reconcile (§8) before claiming" 4
  new=$((epoch + 1))
  set_field seat "$seat"; set_field epoch "$new"; set_field state active
  set_field config "$([[ ${seat%@*} == sol ]] && echo sol-led || echo opus-led)"
  set_field updated "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  history "e$new claimed by $seat at $sha (from $holder e$epoch)$([[ $confirmed -eq 1 ]] && echo ', owner-confirmed cross-host')"
  echo "claimed $run epoch $new as $seat" ;;

release)
  seat=${1:-}; shift || true; valid_seat "$seat"; orphans=0
  [[ "${1:-}" == --orphans-listed ]] && orphans=1
  [[ -f "$REC" ]] || die "no record $REC" 1
  lock
  [[ "$(field state)" == active && "$(field seat)" == "$seat" ]] || die "refused: record is $(field state) under $(field seat), not active under $seat" 4
  lw=$(live_workers)
  if [[ -n "$lw" && $orphans -ne 1 ]]; then echo "$lw" >&2; die "refused: workers still running. Finish/stop them, or list them under Tasks as transferred and pass --orphans-listed" 4; fi
  b=$(field branch); sha=$(branch_sha "$b")
  set_field sha "$sha"; set_field state released; set_field updated "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  history "e$(field epoch) released by $seat at $sha$([[ $orphans -eq 1 ]] && echo ' (running workers listed as transferred)')"
  echo "released $run epoch $(field epoch) at $sha" ;;

checkpoint)
  [[ -f "$REC" ]] || die "no record $REC" 1
  b=$(field branch); sha=$(branch_sha "$b"); [[ -n "$sha" ]] || die "branch '$b' not found"
  [[ "$sha" == "$(field sha)" ]] || die "record sha $(field sha) != branch tip $sha; release (or update the record) first" 4
  out="" base="" transfer=0
  while [[ $# -gt 0 ]]; do case "$1" in
    --bundle) out=${2:?--bundle needs a file path}; transfer=1; shift 2 ;;
    --base) base=${2:?--base needs a ref}; shift 2 ;;
    --transfer) transfer=1; shift ;;
    *) die "unknown option $1" ;; esac; done
  if [[ $transfer -eq 1 ]]; then
    [[ "$(field state)" == released ]] || die "release the run before handing it to another host" 4
    lock; set_field state transferred; history "e$(field epoch) exported for another host at $sha"
  fi
  git notes --ref="$NOTES_REF" add -f -F "$REC" "$sha"
  echo "checkpoint note on $b@$sha (state $(field state))"
  if [[ -n "$out" ]]; then
    # Incremental by default: everything after origin/main (the receiver must already have it).
    if [[ -z "$base" ]] && git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null \
        && git merge-base --is-ancestor refs/remotes/origin/main "$sha"; then base=refs/remotes/origin/main; fi
    git bundle create -q "$out" ${base:+"^$base"} "refs/heads/$b" "$NOTES_REF"
    git bundle verify -q "$out" >/dev/null 2>&1 || git bundle verify "$out" >/dev/null
    echo "bundle $out ($(du -h "$out" | cut -f1)); base ${base:-none (full history)}; carries $b and the run note."
    echo "Transfer it out-of-band (AirDrop / USB). No push was made."
  fi ;;

import)
  bundle=${1:?usage: gt3-run.sh import <run> <bundle>}
  git bundle verify "$bundle" >/dev/null 2>&1 || die "bundle failed verification (missing base commits? fetch origin/main first)" 4
  b=$(git bundle list-heads "$bundle" | sed -n 's|.* refs/heads/||p' | head -1); [[ -n "$b" ]] || die "bundle has no branch"
  git fetch -q "$bundle" "refs/heads/$b:refs/remotes/gt3-transfer/$b" "+$NOTES_REF:$NOTES_REF-incoming"
  tip=$(git rev-parse "refs/remotes/gt3-transfer/$b")
  incoming=$(git notes --ref="$NOTES_REF-incoming" show "$tip" 2>/dev/null) || die "no run note on the transferred tip $tip" 4
  in_epoch=$(sed -n 's/^epoch: //p' <<<"$incoming" | head -1); in_state=$(sed -n 's/^state: //p' <<<"$incoming" | head -1)
  echo "transferred $b@$tip  epoch $in_epoch  state $in_state  (now at refs/remotes/gt3-transfer/$b)"
  [[ "$in_state" == transferred || "$in_state" == released ]] || echo "WARN incoming record is '$in_state': the sending seat may still be active"
  mkdir -p "$DIR"; lock
  if [[ -f "$REC" ]]; then
    loc_epoch=$(field epoch)
    if (( loc_epoch > in_epoch )); then die "refused: local record epoch $loc_epoch is newer than incoming $in_epoch; the transfer is stale" 4; fi
    if (( loc_epoch == in_epoch )) && [[ "$(field state)" == active ]]; then
      die "refused: this host still holds epoch $loc_epoch as active ($(field seat)); two seats claim one epoch — owner must decide" 4; fi
    cp "$REC" "$DIR/run.md.superseded-e$loc_epoch"
  fi
  printf '%s\n' "$incoming" > "$REC"
  local_tip=$(branch_sha "$b")
  if [[ -z "$local_tip" ]]; then git branch "$b" "$tip"; echo "created local branch $b at $tip"
  elif [[ "$local_tip" == "$tip" ]]; then echo "local $b already at $tip"
  elif git merge-base --is-ancestor "$local_tip" "$tip"; then echo "local $b is behind; fast-forward it (no reset needed): git -C <its worktree> merge --ff-only gt3-transfer/$b"
  else echo "WARN local $b has diverged from the transfer; do not reset. Follow operating-contract.md §8.3"; fi
  echo "record imported; next: gt3-run.sh status $run, then claim with --owner-confirmed" ;;

*) die "unknown command '$cmd'" ;;
esac
