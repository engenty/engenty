#!/usr/bin/env bash
# Ensures local dev prerequisites before `pnpm dev` (Docker + Supabase + generated artifacts).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Metadata for the supported container runtimes. Each is a macOS app launched
# via `open -a`; all three expose a Docker-compatible API so the rest of the
# stack (supabase, docker CLI) works unchanged once the daemon is up.
runtime_label() {
  case "$1" in
    docker-desktop) echo "Docker Desktop" ;;
    orbstack)       echo "OrbStack" ;;
    dory)           echo "Dory" ;;
    *)              echo "$1" ;;
  esac
}

runtime_app() {
  case "$1" in
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
  case "$1" in
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

# The persisted choice lives in package.json under engenty.containerRuntime.
read_runtime_choice() {
  node -e "try{process.stdout.write(require('${ROOT}/package.json').engenty?.containerRuntime||'')}catch(e){}" 2>/dev/null
}

write_runtime_choice() {
  node -e "
    const fs=require('fs');
    const p='${ROOT}/package.json';
    const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.engenty=j.engenty||{};
    j.engenty.containerRuntime='$1';
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  " 2>/dev/null
}

prompt_runtime_choice() {
  # Non-interactive shells (CI) can't answer — default to Docker Desktop.
  if [[ ! -t 0 ]] && [[ ! -r /dev/tty ]]; then
    echo "docker-desktop"
    return 0
  fi

  echo "" >&2
  echo "No container runtime configured for local dev." >&2
  echo "Which one do you want to use? (saved to package.json → engenty.containerRuntime)" >&2
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
    echo "docker CLI not found. Install a container runtime (Docker Desktop, OrbStack, or Dory) and ensure docker is on your PATH." >&2
    echo "See: https://docs.docker.com/get-docker/" >&2
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

  # Pin the CLI context so `docker info` here — and every other script that
  # follows ~/.docker/config.json (pnpm supabase, db:*, snapshots) — talks to
  # the chosen daemon rather than whatever happened to be active last.
  select_runtime_context "$runtime"

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$(uname -s)" == "Darwin" ]] && [[ -d "/Applications/${app}.app" ]]; then
    echo "Docker daemon not reachable — starting ${label}..." >&2
    open -a "$app" >/dev/null 2>&1 || true
    for i in $(seq 1 120); do
      # The context may only register after the app's first boot — retry it.
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
    echo "${label} does not appear to be installed at /Applications/${app}.app." >&2
    echo "Install it, or reconfigure by editing engenty.containerRuntime in package.json." >&2
  fi

  echo "" >&2
  echo "${label} did not become ready in time. Start it manually and try again." >&2
  exit 1
}

supabase_ready() {
  supabase status >/dev/null 2>&1
}

ensure_supabase() {
  if ! command -v supabase >/dev/null 2>&1; then
    echo "" >&2
    echo "supabase CLI not found. Install: https://supabase.com/docs/guides/cli" >&2
    exit 1
  fi

  if supabase_ready; then
    return 0
  fi

  echo "" >&2
  echo "Local Supabase not ready — starting stack (containers may take a minute)..." >&2

  # `supabase start` can fail with "already running" while DB containers are still booting.
  if ! supabase start; then
    echo "supabase start reported an issue — waiting for containers to become healthy..." >&2
  fi

  for i in $(seq 1 180); do
    if supabase_ready; then
      if (( i > 1 )); then
        echo "Supabase is ready." >&2
      fi
      return 0
    fi
    if (( i % 15 == 0 )); then
      echo "Waiting for Supabase… (${i}s)" >&2
    fi
    sleep 1
  done

  echo "" >&2
  echo "Supabase did not become ready within 180s." >&2
  echo "Try: pnpm supabase:stop && pnpm supabase:start" >&2
  echo "Or: supabase stop && supabase start --debug" >&2
  exit 1
}

ensure_generated_artifacts() {
  if [[ ! -f "${ROOT}/supabase/config.toml" ]]; then
    echo "" >&2
    echo "Missing generated supabase/config.toml. Run: pnpm engenty setup (or pnpm setup)" >&2
    exit 1
  fi

  if [[ ! -f "${ROOT}/apps/ui/src/plugins/generated-catalog.ts" ]]; then
    echo "" >&2
    echo "Missing generated UI plugin catalog. Run: pnpm engenty setup (or pnpm setup)" >&2
    exit 1
  fi
}

ensure_docker
ensure_supabase
ensure_generated_artifacts
