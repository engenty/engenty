#!/usr/bin/env bash
# Ensures local dev prerequisites before `pnpm dev` (Docker + Supabase + generated artifacts).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "" >&2
  echo "docker CLI not found. Install Docker Desktop or Docker Engine and ensure docker is on your PATH." >&2
  echo "See: https://docs.docker.com/get-docker/" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname -s)" == "Darwin" ]] && [[ -d "/Applications/Docker.app" ]]; then
    echo "Docker daemon not reachable — starting Docker Desktop..." >&2
    open -a Docker >/dev/null 2>&1 || true
    for _ in $(seq 1 60); do
      if docker info >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
  fi
fi

if ! docker info >/dev/null 2>&1; then
  echo "" >&2
  echo "Docker did not become ready in time. Start Docker Desktop and try again." >&2
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "" >&2
  echo "supabase CLI not found. Install: https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

if ! supabase status >/dev/null 2>&1; then
  echo "" >&2
  echo "Local Supabase not running — starting it..." >&2
  if ! supabase start; then
    echo "" >&2
    echo "supabase start failed. Start it manually: pnpm supabase:start" >&2
    exit 1
  fi
fi

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
