-- Replace tenant personal/org sharing with space / all-spaces / agent enablement.
--
-- Keep `sharing` on the row (unused for access). Stop enforcing it in RLS.
-- `all_spaces` is the former org-without-a-mount: one flag, not a mount per space.

ALTER TABLE module_connections.connections
  ADD COLUMN IF NOT EXISTS all_spaces boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN module_connections.connections.all_spaces IS
  'When true, this account is available in every space of the tenant (and on global agent runs). Not a per-space mount.';

GRANT SELECT(all_spaces) ON TABLE module_connections.connections TO authenticated;

-- org + no space mount → all-spaces (that is what org meant).
-- Keep existing space mounts. Do not grant personal accounts to copilot.
UPDATE module_connections.connections c
SET all_spaces = true
WHERE c.sharing = 'org'
  AND NOT EXISTS (
    SELECT 1
    FROM core.space_mount m
    WHERE m.tenant_id = c.tenant_id
      AND m.resource_type = 'connection'
      AND m.resource_key = c.id::text
  );

-- Authenticated members see: accounts they own, all-spaces accounts, and
-- accounts mounted on a space they can enter. Encrypted token columns stay
-- off the authenticated grant.
DROP POLICY IF EXISTS connections_read ON module_connections.connections;
CREATE POLICY connections_read ON module_connections.connections
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT core.current_tenant_id())
    AND (
      owner_user_id = (SELECT core.current_user_id())
      OR all_spaces = true
      OR EXISTS (
        SELECT 1
        FROM core.space_mount m
        JOIN core.spaces s
          ON s.id = m.space_id
         AND s.tenant_id = m.tenant_id
        WHERE m.tenant_id = connections.tenant_id
          AND m.resource_type = 'connection'
          AND m.resource_key = connections.id::text
          AND s.deleted_at IS NULL
          AND (
            s.owner_user_id = (SELECT core.current_user_id())
            OR EXISTS (
              SELECT 1
              FROM core.space_member mem
              WHERE mem.tenant_id = s.tenant_id
                AND mem.space_id = s.id
                AND mem.user_id = (SELECT core.current_user_id())
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS connection_action_policies_read
  ON module_connections.connection_action_policies;
CREATE POLICY connection_action_policies_read
  ON module_connections.connection_action_policies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM module_connections.connections c
      WHERE c.id = connection_action_policies.connection_id
        AND c.tenant_id = (SELECT core.current_tenant_id())
        AND (
          c.owner_user_id = (SELECT core.current_user_id())
          OR c.all_spaces = true
          OR EXISTS (
            SELECT 1
            FROM core.space_mount m
            JOIN core.spaces s
              ON s.id = m.space_id
             AND s.tenant_id = m.tenant_id
            WHERE m.tenant_id = c.tenant_id
              AND m.resource_type = 'connection'
              AND m.resource_key = c.id::text
              AND s.deleted_at IS NULL
              AND (
                s.owner_user_id = (SELECT core.current_user_id())
                OR EXISTS (
                  SELECT 1
                  FROM core.space_member mem
                  WHERE mem.tenant_id = s.tenant_id
                    AND mem.space_id = s.id
                    AND mem.user_id = (SELECT core.current_user_id())
                )
              )
          )
        )
    )
  );
