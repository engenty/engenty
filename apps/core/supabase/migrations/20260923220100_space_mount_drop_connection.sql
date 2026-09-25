-- Connections are owned by a Space now (module_connections.connections.space_id),
-- so an account is no longer "mounted" into Spaces. Plugin mounts stay: they
-- say a plugin is enabled on a Space before any account exists.

DELETE FROM core.space_mount WHERE resource_type = 'connection';

ALTER TABLE core.space_mount
  DROP CONSTRAINT IF EXISTS space_mount_resource_type_check;

ALTER TABLE core.space_mount
  ADD CONSTRAINT space_mount_resource_type_check
  CHECK (resource_type = ANY (ARRAY[
    'module'::text,
    'agent'::text,
    'skill'::text,
    'plugin'::text
  ]));

COMMENT ON COLUMN core.space_mount.resource_type IS
  'module | agent | skill | plugin (connector id enabled on the space)';
