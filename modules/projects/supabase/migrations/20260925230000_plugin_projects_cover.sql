-- A project's cover: colour, gradient or image (see @engenty/covers).
ALTER TABLE module_projects.projects
  ADD COLUMN IF NOT EXISTS cover jsonb;
