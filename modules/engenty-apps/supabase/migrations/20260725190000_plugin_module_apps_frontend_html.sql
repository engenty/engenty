-- Built frontend documents for multi-file Apps.
--
-- `files` stays the agent's editable source tree; this column holds what the
-- host-side esbuild pass produced from it. Keeping the two apart means a
-- rebuild never mutates the sources an agent is iterating on, and the source
-- tree never grows a 200 KB generated blob the agent has to read past.
--
-- Null for single-file Apps, whose `entry.frontend` already names a ready-made
-- document inside `files`. The /frontend route prefers this column and falls
-- back to `files[entry]`, so every App that predates this column keeps working
-- with no backfill. See PLAN-engenty-apps-frontend-build.md D4.

alter table module_apps.app_versions
  add column if not exists frontend_html text;
