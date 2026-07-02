#!/usr/bin/env bash
# Apply aggregated module migrations to a linked Supabase project.
# Run from repo root with Supabase CLI configured (supabase link).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is required. See https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

echo "==> Aggregate module migrations"
node scripts/aggregate-module-migrations.mjs

echo "==> Push migrations to linked project"
supabase db push

echo "migrate.sh done."
