-- Space plugin enablement (marketplace Phase 1).
--
-- A plugin can be added to a space before anyone authenticates an account.
-- Connection UUID mounts stay "this account is shared with this space".
-- Plugin mounts use resource_type = 'plugin' and resource_key = connector id
-- (e.g. google-gmail, or a tenant-imported integrations.sh id).

ALTER TABLE core.space_mount
  DROP CONSTRAINT IF EXISTS space_mount_resource_type_check;

ALTER TABLE core.space_mount
  ADD CONSTRAINT space_mount_resource_type_check
  CHECK (resource_type = ANY (ARRAY[
    'module'::text,
    'agent'::text,
    'skill'::text,
    'connection'::text,
    'plugin'::text
  ]));

COMMENT ON COLUMN core.space_mount.resource_type IS
  'module | agent | skill | connection (account UUID) | plugin (connector id, no account yet)';
