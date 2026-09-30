-- New projects start lean: time planning (phases, dates, Gantt) is opt-in.
-- Existing projects keep their current setting.
ALTER TABLE module_projects.projects
  ALTER COLUMN timeplan_enabled SET DEFAULT false;
