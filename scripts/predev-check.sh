#!/usr/bin/env bash
# Ensures local dev prerequisites before `pnpm dev` / `pnpm dev:portless`:
#   1. Docker daemon
#   2. Supabase stack fully healthy (status + REST + Auth — not half-dead)
#   3. Pending DB migrations applied
#   4. Generated artifacts present
#   5. Stale repo processes freed off the worktree's destin ports
#
# Portless HTTPS proxy (:443) is required only by `pnpm dev:portless`
# (checked in scripts/dev-portless.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Workspace-vendored CLI (pnpm install). Prefer it over a random global binary.
export PATH="${ROOT}/node_modules/.bin:${PATH}"

SUPABASE_API="http://127.0.0.1:54321"
# Shared across all engenty worktrees — only one predev may start/heal Supabase
# or apply migrations at a time. Parallel `pnpm dev` is supported; they serialize
# on this lock instead of racing `supabase stop`/`start`.
SUPABASE_LOCK_DIR="${TMPDIR:-/tmp}/engenty-local-supabase.predev.lock"
# How long to wait for REST/Auth to settle (schema cache, concurrent start) before
# treating an unhealthy probe as a reason to heal/restart.
SUPABASE_GRACE_SECS="${ENGENTY_SUPABASE_GRACE_SECS:-45}"
SUPABASE_SOFT_HEAL_SECS="${ENGENTY_SUPABASE_SOFT_HEAL_SECS:-45}"
SUPABASE_READY_WAIT_SECS="${ENGENTY_SUPABASE_READY_WAIT_SECS:-180}"

# Metadata for the supported container runtimes. Each is a macOS app launched
# via `open -a`; all three expose a Docker-compatible API so the rest of the
# stack (supabase, docker CLI) works unchanged once the daemon is up.
# Accept legacy alias `docker` → `docker-desktop` (older package.json values).
normalize_runtime() {
  case "$1" in
    docker) echo "docker-desktop" ;;
    *)      echo "$1" ;;
  esac
}

runtime_label() {
  case "$(normalize_runtime "$1")" in
    docker-desktop) echo "Docker Desktop" ;;
    orbstack)       echo "OrbStack" ;;
    dory)           echo "Dory" ;;
    *)              echo "$1" ;;
  esac
}

runtime_app() {
  case "$(normalize_runtime "$1")" in
    docker-desktop) echo "Docker" ;;
    orbstack)       echo "OrbStack" ;;
    dory)           echo "Dory" ;;
    *)              echo "" ;;
  esac
}

# The Docker CLI context each runtime registers. Pinning it makes the choice
# authoritative for EVERY tool that follows ~/.docker/config.json — not just
# `pnpm dev`, but `pnpm supabase`, `db:*`, snapshots, and bare `docker` too.
runtime_context() {
  case "$(normalize_runtime "$1")" in
    docker-desktop) echo "desktop-linux" ;;
    orbstack)       echo "orbstack" ;;
    dory)           echo "dory" ;;
    *)              echo "" ;;
  esac
}

# Best-effort switch of the global Docker context to the chosen runtime.
select_runtime_context() {
  local ctx
  ctx="$(runtime_context "$1")"
  [[ -z "$ctx" ]] && return 0
  # Only switch if the context exists (the app registers it once it has run).
  if docker context inspect "$ctx" >/dev/null 2>&1; then
    docker context use "$ctx" >/dev/null 2>&1 || true
  fi
}

# The persisted choice lives in gitignored `.engenty/container-runtime`.
read_runtime_choice() {
  node "${ROOT}/scripts/lib/container-runtime.mjs" read 2>/dev/null || true
}

write_runtime_choice() {
  node "${ROOT}/scripts/lib/container-runtime.mjs" write "$1"
}

prompt_runtime_choice() {
  # Non-interactive shells (CI) can't answer — default to Docker Desktop.
  if [[ ! -t 0 ]] && [[ ! -r /dev/tty ]]; then
    echo "docker-desktop"
    return 0
  fi

  echo "" >&2
  echo "No container runtime configured for local dev." >&2
  echo "Which one do you want to use? (saved to .engenty/container-runtime, not committed)" >&2
  echo "  1) Docker Desktop" >&2
  echo "  2) OrbStack" >&2
  echo "  3) Dory (Apple container stack — https://augani.github.io/dory)" >&2

  local reply=""
  while true; do
    printf "Enter choice [1-3] (default 1): " >&2
    if ! read -r reply < /dev/tty; then
      reply="1"
    fi
    case "${reply:-1}" in
      1|"") echo "docker-desktop"; return 0 ;;
      2)    echo "orbstack";       return 0 ;;
      3)    echo "dory";           return 0 ;;
      *)    echo "Please enter 1, 2, or 3." >&2 ;;
    esac
  done
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "" >&2
    echo "docker CLI not found. Install a container engine and put docker on your PATH." >&2
    echo "  macOS: Docker Desktop, OrbStack, or Dory — https://docs.docker.com/get-docker/" >&2
    echo "  Linux: Docker Engine (or any Docker-compatible daemon). If it is already running, that is enough." >&2
    exit 1
  fi

  # First-class case: the daemon is already up (Linux Docker Engine, CI,
  # a Mac app the user started themselves). Do not prompt for a named runtime.
  if docker info >/dev/null 2>&1; then
    local runtime
    runtime="$(read_runtime_choice)"
    if [[ -n "$runtime" ]]; then
      select_runtime_context "$runtime"
    fi
    return 0
  fi

  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "" >&2
    echo "The docker CLI is installed, but the daemon is not running." >&2
    echo "Start it (e.g. sudo systemctl start docker) so \`docker info\` succeeds, then retry." >&2
    exit 1
  fi

  local runtime
  runtime="$(read_runtime_choice)"
  if [[ -z "$runtime" ]]; then
    runtime="$(prompt_runtime_choice)"
    write_runtime_choice "$runtime"
    echo "Saved container runtime: $(runtime_label "$runtime")" >&2
  fi

  local label app
  label="$(runtime_label "$runtime")"
  app="$(runtime_app "$runtime")"

  select_runtime_context "$runtime"

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if [[ -n "$app" ]] && [[ -d "/Applications/${app}.app" ]]; then
    echo "Docker daemon not reachable — starting ${label}..." >&2
    open -a "$app" >/dev/null 2>&1 || true
    for i in $(seq 1 120); do
      select_runtime_context "$runtime"
      if docker info >/dev/null 2>&1; then
        echo "${label} is ready." >&2
        return 0
      fi
      if (( i % 15 == 0 )); then
        echo "Waiting for ${label}… (${i}s)" >&2
      fi
      sleep 1
    done
  else
    echo "" >&2
    echo "${label} is not installed at /Applications/${app}.app." >&2
    echo "Install it, start the daemon, or delete .engenty/container-runtime to pick again." >&2
  fi

  echo "" >&2
  echo "${label} did not become ready in time. Start it manually and try again." >&2
  exit 1
}

http_code() {
  local url="$1"
  curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 "$url" 2>/dev/null || echo "000"
}

# `supabase status` succeeds even when PostgREST / Auth are stopped (half-dead
# stack). Probe Kong so we don't greenlight a 503 API that surfaces as
# "name resolution failed" / ensure-current-user 500s in the UI.
supabase_rest_reachable() {
  local code
  code="$(http_code "${SUPABASE_API}/rest/v1/")"
  # PostgREST via Kong returns 200 (with apikey) or 401 (without). 503 / 000 =
  # gateway up but rest container down / unreachable.
  [[ "$code" == "200" || "$code" == "401" ]]
}

supabase_auth_reachable() {
  local code
  code="$(http_code "${SUPABASE_API}/auth/v1/health")"
  [[ "$code" == "200" ]]
}

# Critical containers for local API. Names match project_id = engenty-local.
supabase_critical_containers_up() {
  local name status
  for name in \
    supabase_db_engenty-local \
    supabase_kong_engenty-local \
    supabase_rest_engenty-local \
    supabase_auth_engenty-local
  do
    status="$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || echo missing)"
    if [[ "$status" != "running" ]]; then
      return 1
    fi
  done
  return 0
}

supabase_ready() {
  supabase status >/dev/null 2>&1 \
    && supabase_critical_containers_up \
    && supabase_rest_reachable \
    && supabase_auth_reachable
}

supabase_half_dead() {
  # CLI thinks something is up, but REST/Auth/critical containers are not.
  supabase status >/dev/null 2>&1 && ! supabase_ready
}

# After macOS reboot / Docker Desktop kill, containers remain as Exited.
# `supabase status` fails, so half_dead is false, but `supabase start` then
# reports "already running" and never recovers without an explicit stop.
supabase_exited_stack() {
  local status
  status="$(docker inspect -f '{{.State.Status}}' supabase_db_engenty-local 2>/dev/null || echo missing)"
  [[ "$status" == "exited" || "$status" == "dead" ]]
}

# Cross-worktree lock (mkdir is atomic). Stale locks from dead PIDs are cleared.
supabase_lock_acquire() {
  local waited=0 pid
  while true; do
    if mkdir "$SUPABASE_LOCK_DIR" 2>/dev/null; then
      echo "$$" >"${SUPABASE_LOCK_DIR}/pid"
      # shellcheck disable=SC2064
      trap 'rm -rf "$SUPABASE_LOCK_DIR"' EXIT
      return 0
    fi
    pid="$(cat "${SUPABASE_LOCK_DIR}/pid" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      echo "Clearing stale Supabase predev lock (pid ${pid} gone)…" >&2
      rm -rf "$SUPABASE_LOCK_DIR"
      continue
    fi
    if (( waited == 0 )); then
      echo "Another worktree is ensuring shared Supabase (lock held${pid:+ by pid $pid}) — waiting…" >&2
    elif (( waited % 15 == 0 )); then
      echo "Still waiting for Supabase lock… (${waited}s)" >&2
    fi
    sleep 1
    waited=$((waited + 1))
    # Safety: don't hang forever if lock holder is wedged without dying.
    if (( waited >= 300 )); then
      echo "" >&2
      echo "Timed out waiting for Supabase predev lock (${SUPABASE_LOCK_DIR})." >&2
      echo "If no other pnpm dev is running: rm -rf \"$SUPABASE_LOCK_DIR\"" >&2
      exit 1
    fi
  done
}

supabase_lock_release() {
  rm -rf "$SUPABASE_LOCK_DIR"
  trap - EXIT
}

wait_supabase_ready() {
  local max_secs="${1:-$SUPABASE_READY_WAIT_SECS}"
  local label="${2:-Waiting for Supabase}"
  local i
  for i in $(seq 1 "$max_secs"); do
    if supabase_ready; then
      return 0
    fi
    if (( i % 15 == 0 )); then
      echo "${label}… (${i}s) REST=$(http_code "${SUPABASE_API}/rest/v1/") Auth=$(http_code "${SUPABASE_API}/auth/v1/health")" >&2
    fi
    sleep 1
  done
  return 1
}

# Prefer restarting PostgREST over a full stack stop (avoids DB-from-backup and
# killing other worktrees' healthy Auth/DB mid-dev).
soft_heal_supabase_rest() {
  if ! supabase_critical_containers_up; then
    return 1
  fi
  echo "Soft-healing PostgREST (docker restart supabase_rest_engenty-local)…" >&2
  if ! docker restart supabase_rest_engenty-local >/dev/null 2>&1; then
    return 1
  fi
  wait_supabase_ready "$SUPABASE_SOFT_HEAL_SECS" "Waiting after REST restart"
}

ensure_supabase() {
  if ! command -v supabase >/dev/null 2>&1; then
    echo "" >&2
    echo "Supabase CLI not found in this workspace. Run: pnpm install" >&2
    exit 1
  fi

  if supabase_ready; then
    echo "✓ Supabase healthy (REST + Auth on ${SUPABASE_API})" >&2
    return 0
  fi

  # After reboot / Docker Desktop kill, containers stay Exited. Grace waiting
  # cannot help — skip straight to stop+start so we don't look like we only
  # brought Docker up and forgot the database.
  if supabase_exited_stack; then
    echo "" >&2
    echo "Local Supabase containers are stopped (common after reboot)." >&2
    echo "Starting shared database stack (engenty-local)…" >&2
    supabase stop >/dev/null 2>&1 || true
    if ! supabase start; then
      echo "supabase start stuck with down containers — stop + start retry…" >&2
      supabase stop >/dev/null 2>&1 || true
      supabase start || true
    fi
    if wait_supabase_ready "$SUPABASE_READY_WAIT_SECS" "Waiting for Supabase"; then
      echo "✓ Supabase is ready (REST + Auth)." >&2
      return 0
    fi
    echo "" >&2
    echo "Supabase did not become ready within ${SUPABASE_READY_WAIT_SECS}s." >&2
    echo "Try: pnpm supabase:stop && pnpm supabase:start" >&2
    echo "Or: pnpm supabase:stop && pnpm supabase:start -- --debug" >&2
    exit 1
  fi

  # Grace period: concurrent worktree start or PostgREST schema reload often
  # looks "half-dead" (REST 500) for a short window. Wait before healing.
  echo "" >&2
  echo "Local Supabase not ready yet (REST=$(http_code "${SUPABASE_API}/rest/v1/") Auth=$(http_code "${SUPABASE_API}/auth/v1/health"))." >&2
  echo "Waiting up to ${SUPABASE_GRACE_SECS}s for shared stack to settle (parallel worktrees)…" >&2
  if wait_supabase_ready "$SUPABASE_GRACE_SECS" "Waiting for shared Supabase"; then
    echo "✓ Supabase healthy (REST + Auth on ${SUPABASE_API})" >&2
    return 0
  fi

  # Soft heal when containers are up but REST is flaky — do NOT stop the stack
  # (that races other worktrees and reloads Postgres from backup).
  if soft_heal_supabase_rest; then
    echo "✓ Supabase healthy after REST soft-heal." >&2
    return 0
  fi

  if supabase_half_dead; then
    echo "" >&2
    echo "Local Supabase still unhealthy after grace + soft-heal." >&2
    echo "  REST:  $(http_code "${SUPABASE_API}/rest/v1/")" >&2
    echo "  Auth:  $(http_code "${SUPABASE_API}/auth/v1/health")" >&2
    echo "Restarting shared stack (other worktrees will wait on the lock)…" >&2
    supabase stop >/dev/null 2>&1 || true
  else
    echo "" >&2
    echo "Local Supabase not ready — starting shared stack (containers may take a minute)..." >&2
  fi

  # `supabase start` can fail with "already running" while DB containers are still
  # booting — or when exited containers linger after a reboot. Retry once with stop.
  if ! supabase start; then
    if supabase_exited_stack || ! supabase_critical_containers_up; then
      echo "supabase start stuck with down containers — stop + start retry…" >&2
      supabase stop >/dev/null 2>&1 || true
      supabase start || true
    else
      echo "supabase start reported an issue — waiting for containers to become healthy..." >&2
    fi
  fi

  if wait_supabase_ready "$SUPABASE_READY_WAIT_SECS" "Waiting for Supabase"; then
    echo "✓ Supabase is ready (REST + Auth)." >&2
    return 0
  fi

  echo "" >&2
  echo "Supabase did not become ready within ${SUPABASE_READY_WAIT_SECS}s." >&2
  echo "Try: pnpm supabase:stop && pnpm supabase:start" >&2
  echo "Or: pnpm supabase:stop && pnpm supabase:start -- --debug" >&2
  exit 1
}

ensure_migrations() {
  echo "Applying pending DB migrations (if any)…" >&2
  if ! pnpm engenty db migrate; then
    echo "" >&2
    echo "DB migrate failed. Fix migration errors, then retry." >&2
    echo "  pnpm db:migrate" >&2
    exit 1
  fi
  echo "✓ Migrations up to date." >&2
}

ensure_generated_artifacts() {
  if [[ ! -f "${ROOT}/supabase/config.toml" ]]; then
    echo "" >&2
    echo "Missing generated supabase/config.toml. Run: pnpm engenty setup (or pnpm setup)" >&2
    exit 1
  fi

  if [[ ! -f "${ROOT}/apps/ui/src/plugins/generated-catalog.ts" ]]; then
    echo "" >&2
    echo "Missing generated UI plugin catalog." >&2
    echo "  Run: pnpm run setup" >&2
    echo "  (not bare \`pnpm setup\` — that is pnpm's own CLI installer)" >&2
    echo "  Or:  pnpm --filter @engenty/ui generate:plugins" >&2
    exit 1
  fi
  echo "✓ Generated artifacts present." >&2
}

ensure_dev_ports_free() {
  # Free destin ports still held by a stale `pnpm dev`/`pnpm dev:portless` from
  # this repo (e.g. a Vite left behind after an unclean Ctrl-C). Resolves
  # worktree-aware ports; unrelated apps on those ports abort with a clear
  # message instead of a vague "Port 5173 is already in use".
  node "$ROOT/scripts/dev-port-check.mjs" --cwd="$ROOT"
  echo "✓ Dev ports clear." >&2
}

echo "==> Dev preflight" >&2
ensure_docker
# Serialize shared-stack mutations across parallel worktree `pnpm dev` runs.
supabase_lock_acquire
ensure_supabase
ensure_migrations
supabase_lock_release
ensure_generated_artifacts
ensure_dev_ports_free
echo "==> Preflight OK" >&2
