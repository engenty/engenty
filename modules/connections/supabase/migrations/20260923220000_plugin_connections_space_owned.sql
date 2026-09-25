-- Connections belong to a Space (PLAN-space-owned-connections.md).
--
-- Every agent and member of the owning Space uses an account; nobody outside
-- it does. Replaces owner/sharing/all-spaces/agent-grant reach. Fresh start by
-- decision (no production data): existing connections are dropped and
-- reconnected inside a Space.

DELETE FROM module_connections.pending_oauth_flows;
DELETE FROM module_connections.connections;

DROP TABLE module_connections.connection_agent_grants;

DROP POLICY IF EXISTS connections_read ON module_connections.connections;
DROP POLICY IF EXISTS connection_action_policies_read
  ON module_connections.connection_action_policies;

DROP INDEX IF EXISTS module_connections.uq_module_connections_org;
DROP INDEX IF EXISTS module_connections.uq_module_connections_personal;

ALTER TABLE module_connections.connections
  DROP CONSTRAINT IF EXISTS connections_sharing_check,
  DROP CONSTRAINT IF EXISTS connections_non_owner_max_group_check,
  DROP CONSTRAINT IF EXISTS connections_owner_user_id_fkey,
  DROP COLUMN sharing,
  DROP COLUMN non_owner_max_group,
  DROP COLUMN all_spaces,
  ADD COLUMN space_id uuid NOT NULL
    REFERENCES core.spaces (id) ON DELETE CASCADE;

ALTER TABLE module_connections.connections
  RENAME COLUMN owner_user_id TO connected_by;

ALTER TABLE module_connections.connections
  ADD CONSTRAINT connections_connected_by_fkey
    FOREIGN KEY (connected_by) REFERENCES core.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN module_connections.connections.space_id IS
  'The Space that owns this account. Every agent and member of it uses the account.';
COMMENT ON COLUMN module_connections.connections.connected_by IS
  'Who signed in. Audit only — grants no access and no approval right.';

CREATE UNIQUE INDEX uq_module_connections_space_account
  ON module_connections.connections
  USING btree (tenant_id, space_id, connector_id, external_account)
  NULLS NOT DISTINCT;

CREATE INDEX idx_module_connections_connections_space
  ON module_connections.connections USING btree (tenant_id, space_id);

ALTER TABLE module_connections.pending_oauth_flows
  DROP CONSTRAINT IF EXISTS pending_oauth_flows_sharing_check,
  DROP COLUMN sharing,
  ALTER COLUMN space_id SET NOT NULL;

-- Column grants: the renamed column keeps its SELECT grant; the new one needs
-- its own. Encrypted token columns stay off the authenticated grant.
GRANT SELECT(space_id) ON TABLE module_connections.connections TO authenticated;

-- Members see the accounts of Spaces they can enter.
CREATE POLICY connections_read ON module_connections.connections
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT core.current_tenant_id())
    AND EXISTS (
      SELECT 1
      FROM core.spaces s
      WHERE s.id = connections.space_id
        AND s.tenant_id = connections.tenant_id
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
  );

CREATE POLICY connection_action_policies_read
  ON module_connections.connection_action_policies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM module_connections.connections c
      WHERE c.id = connection_action_policies.connection_id
    )
  );
