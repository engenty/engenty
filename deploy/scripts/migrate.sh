#!/usr/bin/env bash
# Apply aggregated module migrations to a linked Supabase project.
# Run from repo root with Supabase CLI configured (supabase link).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Workspace-vendored CLI (pnpm install). Prefer it over a random global binary.
export PATH="${ROOT}/node_modules/.bin:${PATH}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI is not installed. Run: pnpm install" >&2
  exit 1
fi

echo "==> Aggregate module migrations"
node scripts/aggregate-module-migrations.mjs

echo "==> Push migrations to linked project"
supabase db push

echo "migrate.sh done."
