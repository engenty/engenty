-- Opt-in time planning. A project can now be run "lean" (a room/folder for
-- notes, files and tasks) without phases, a Gantt or project dates. Existing
-- projects were all created under the full-featured assumption, so the column
-- defaults to true and every current row keeps its Zeitplan.
-- Covered by the existing projects RLS policies (column-level add, no new policy).
alter table module_projects.projects
  add column if not exists timeplan_enabled boolean not null default true;
