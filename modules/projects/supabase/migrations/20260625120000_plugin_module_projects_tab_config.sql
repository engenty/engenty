-- Per-project detail tab configuration. Stores the ordered list of enabled
-- detail tabs (e.g. ["planning","notes","files"]) so the user's show/hide +
-- reorder choices in the "Tabs konfigurieren" dialog persist across reloads,
-- shared for everyone viewing the project. NULL = use the module default.
-- Covered by the existing projects RLS policies (column-level add, no new policy).
alter table module_projects.projects
  add column if not exists enabled_tabs jsonb;
