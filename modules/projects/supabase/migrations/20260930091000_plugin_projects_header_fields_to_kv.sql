-- cover, enabled_tabs and timeplan_enabled now live in module_projects.project_kv
-- (see 20260930090000_plugin_projects_kv.sql). No data carried over.
ALTER TABLE module_projects.projects
  DROP COLUMN IF EXISTS cover,
  DROP COLUMN IF EXISTS enabled_tabs,
  DROP COLUMN IF EXISTS timeplan_enabled;
