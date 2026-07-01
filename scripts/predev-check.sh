#!/usr/bin/env bash
# Ensures local dev prerequisites before `pnpm dev` (Docker + Supabase + generated artifacts).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "" >&2
    echo "docker CLI not found. Install Docker Desktop or Docker Engine and ensure docker is on your PATH." >&2
    echo "See: https://docs.docker.com/get-docker/" >&2
    exit 1
  fi

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$(uname -s)" == "Darwin" ]] && [[ -d "/Applications/Docker.app" ]]; then
    echo "Docker daemon not reachable — starting Docker Desktop..." >&2
    open -a Docker >/dev/null 2>&1 || true
    for i in $(seq 1 120); do
      if docker info >/dev/null 2>&1; then
        echo "Docker is ready." >&2
        return 0
      fi
      if (( i % 15 == 0 )); then
        echo "Waiting for Docker… (${i}s)" >&2
      fi
      sleep 1
    done
  fi

  echo "" >&2
  echo "Docker did not become ready in time. Start Docker Desktop and try again." >&2
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
