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
#   3. Roster: GT3_CONFIG=sol-led allows only the seven Sol-led models.
#   4. Run provenance: if GT3_RUN is set, GT3_EPOCH and GT3_TASK must be set too. The wrapper
#      then calls route_log just before exec, so only real launches are logged.
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

  if [[ "${GT3_CONFIG:-}" == sol-led ]]; then
    case "$model" in
      gpt-6.1-sol|gpt-5.6-terra|gpt-6-luna|opencode/muse-spark-1.3-contributor-free|\
      claude-opus-5-5|claude-sonnet-5-5|claude-haiku-5-5) ;;
      *) route_guard_die "model '$model' is not in the Sol-led roster (model-routing.md §11b)" ;;
    esac
  elif [[ -n "${GT3_CONFIG:-}" && "${GT3_CONFIG}" != opus-led ]]; then
    route_guard_die "unknown GT3_CONFIG '${GT3_CONFIG}' (opus-led | sol-led)"
  fi

  if [[ -n "${GT3_RUN:-}" ]]; then
    [[ -n "${GT3_EPOCH:-}" && -n "${GT3_TASK:-}" ]] || route_guard_die "GT3_RUN is set but GT3_EPOCH/GT3_TASK are missing"
    [[ "$GT3_RUN" =~ ^[A-Za-z0-9._-]+$ ]] || route_guard_die "GT3_RUN must be [A-Za-z0-9._-]"
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
