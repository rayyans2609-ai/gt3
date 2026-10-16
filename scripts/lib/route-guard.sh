# Shared launch guard for the GT3 route wrappers (codex/opencode/claude-route.sh).
# Sourced, not executed. Contract: docs/ai/operating-contract.md §5.
#
# route_guard <provider> <model> <mode>
#   provider: codex | opencode | claude
#   mode:     read-only | workspace | full   (wrapper-specific meaning, see each wrapper)
#
# Enforces, before any model is invoked:
#   1. Provider billing env: refuses API-key / alternate-endpoint variables that would
#      silently move a subscription route onto paid API billing or a third party.
#   2. Checkout: any mode that can write must run in a linked worktree on a non-main
#      branch. read-only may run anywhere (no worktree ceremony for inspection).
#   3. Seat: if GT3_RUN is set, local/runs/<run>/run.md must be active under a seat on this
#      host; epoch and configuration are taken from the record (a conflicting GT3_EPOCH or
#      GT3_CONFIG in the environment is refused). GT3_TASK is required. Only the seat holder's
#      host can dispatch for a run.
#   4. Roster: configuration sol-led allows only the seven Sol-led models.
#   5. The wrapper calls route_log just before exec, so only real launches are logged.
# Run and task may be given as GT3_RUN/GT3_TASK or as wrapper flags -R <run> -T <task>. Prefer
# the flags: a command that starts with the wrapper path matches the project execpolicy
# allow rule, while a leading VAR=value assignment does not (and would run sandboxed).
# Exports GT3_ROLE (worker unless GT3_LAUNCH_ROLE=manager) for the child.

route_guard_die() { echo "$ROUTE_GUARD_NAME: $*" >&2; exit 2; }

route_guard() {
  local provider="$1" model="$2" mode="$3"

  case "$provider" in
    claude)
      for v in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL \
               CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY; do
        [[ -n "${!v:-}" ]] && route_guard_die "refusing: $v is set (would bypass subscription billing or route Claude through another provider)"
      done ;;
    codex)
      for v in OPENAI_API_KEY OPENAI_BASE_URL OPENAI_API_BASE; do
        [[ -n "${!v:-}" ]] && route_guard_die "refusing: $v is set (would bypass ChatGPT-login billing or route Codex elsewhere)"
      done ;;
  esac

  if [[ "$mode" != read-only ]]; then
    local git_dir common_dir branch
    git_dir=$(git rev-parse --absolute-git-dir 2>/dev/null) || route_guard_die "mode '$mode' must run inside a GT3 git worktree"
    common_dir=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
    [[ "$git_dir" == "$common_dir" ]] && route_guard_die "refusing mode '$mode' in the main checkout; launch from a dedicated worktree (read-only modes may run anywhere)"
    branch=$(git symbolic-ref --quiet --short HEAD || echo DETACHED)
    [[ "$branch" == main ]] && route_guard_die "refusing mode '$mode' on branch main"
  fi

  if [[ -n "${GT3_RUN:-}" ]]; then
    [[ "$GT3_RUN" =~ ^[A-Za-z0-9._-]+$ ]] || route_guard_die "GT3_RUN must be [A-Za-z0-9._-]"
    [[ -n "${GT3_TASK:-}" ]] || route_guard_die "GT3_RUN is set but GT3_TASK is missing"
    local root rec field_state field_seat field_epoch field_config host
    root=$(cd "$(git rev-parse --git-common-dir 2>/dev/null)/.." 2>/dev/null && pwd -P) || route_guard_die "GT3_RUN needs the GT3 repository"
    rec="$root/local/runs/$GT3_RUN/run.md"
    [[ -f "$rec" ]] || route_guard_die "no run record $rec (claim the run first: scripts/gt3-run.sh claim)"
    field_state=$(sed -n 's/^state: //p' "$rec" | head -1); field_seat=$(sed -n 's/^seat: //p' "$rec" | head -1)
    field_epoch=$(sed -n 's/^epoch: //p' "$rec" | head -1); field_config=$(sed -n 's/^config: //p' "$rec" | head -1)
    if [[ -n "${GT3_HOST:-}" ]]; then host=$GT3_HOST; else
      case "$(uname -m)/$(sysctl -n hw.memsize 2>/dev/null)" in arm64/17179869184) host=m4 ;; x86_64/8589934592) host=intel ;; *) host=other ;; esac; fi
    [[ "$field_state" == active ]] || route_guard_die "run $GT3_RUN is '$field_state', not active: only an active seat dispatches"
    [[ "${field_seat#*@}" == "$host" ]] || route_guard_die "run $GT3_RUN is held by $field_seat, not a seat on this host ($host)"
    [[ -z "${GT3_EPOCH:-}" || "$GT3_EPOCH" == "$field_epoch" ]] || route_guard_die "GT3_EPOCH=$GT3_EPOCH but the record is at epoch $field_epoch (stale manager?)"
    [[ -z "${GT3_CONFIG:-}" || "$GT3_CONFIG" == "$field_config" ]] || route_guard_die "GT3_CONFIG=$GT3_CONFIG but the record says $field_config"
    export GT3_EPOCH="$field_epoch" GT3_CONFIG="$field_config"
  fi

  if [[ "${GT3_CONFIG:-}" == sol-led ]]; then
    case "$model" in
      gpt-6.1-sol|gpt-5.6-terra|gpt-6-luna|opencode/muse-spark-1.3-contributor-free|\
      claude-opus-5-5|claude-sonnet-5-5|claude-haiku-5-5) ;;
      *) route_guard_die "model '$model' is not in the Sol-led roster (model-routing.md §11b)" ;;
    esac
  elif [[ -n "${GT3_CONFIG:-}" && "${GT3_CONFIG}" != opus-led ]]; then
    route_guard_die "unknown GT3_CONFIG '${GT3_CONFIG}' (opus-led | sol-led)"
  fi

  export GT3_ROLE="${GT3_LAUNCH_ROLE:-worker}"
  [[ "$GT3_ROLE" == worker || "$GT3_ROLE" == manager ]] || route_guard_die "GT3_LAUNCH_ROLE must be worker or manager"
}

# route_log <provider> <model> <mode> — call immediately before exec, after every refusal
# check, so only real launches reach local/runs/<run>/launches.log.
route_log() {
  [[ -n "${GT3_RUN:-}" ]] || return 0
  local root log
  root=$(cd "$(git rev-parse --git-common-dir 2>/dev/null)/.." 2>/dev/null && pwd -P) || return 0
  log="$root/local/runs/$GT3_RUN/launches.log"
  mkdir -p "${log%/*}"
  # pid survives the wrapper's exec; start time guards against PID reuse.
  printf '%s pid=%s start=%s run=%s epoch=%s task=%s provider=%s model=%s mode=%s cwd=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$$" "$(ps -o lstart= -p $$ | tr ' ' _)" "$GT3_RUN" "$GT3_EPOCH" \
    "$GT3_TASK" "$1" "$2" "$3" "$(pwd -P)" >> "$log"
}
