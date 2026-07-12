#!/usr/bin/env sh
# Entrypoint for the engenty-migrate init container. Applies pending Supabase
# migrations to the deployment's database, then exits. The app services wait on
# this completing successfully (compose `depends_on: service_completed_successfully`).
#
# Requires SUPABASE_DB_URL — a direct Postgres connection string, e.g.
#   postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres   (Supabase Cloud)
#   postgresql://postgres:<pw>@supabase-db:5432/postgres            (self-hosted)
# The service-role key / REST URL the app uses CANNOT run migrations (no DDL over
# PostgREST) — a Postgres connection is mandatory.
#
# Opt-in + non-breaking: if SUPABASE_DB_URL is unset the step is SKIPPED (exit 0)
# so installs that still migrate by hand keep deploying. Set the var to turn on
# automatic migrations.
set -eu

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "[engenty-migrate] SUPABASE_DB_URL not set — skipping automatic migrations."
  echo "[engenty-migrate] Set it to enable auto-migrate, or apply manually with deploy/scripts/migrate.sh."
  exit 0
fi

echo "[engenty-migrate] Applying pending migrations via supabase db push…"
# --include-all: apply pending migrations even if a newer one is already on the
# remote (out-of-order histories across installs). Already-applied versions are
# skipped by the schema_migrations tracking table, so this is idempotent.
supabase db push --db-url "$SUPABASE_DB_URL" --include-all --yes

echo "[engenty-migrate] Migrations up to date."
