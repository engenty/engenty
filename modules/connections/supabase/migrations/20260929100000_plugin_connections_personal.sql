-- Personal connections (PLAN-personal-connections.md).
--
-- An account belongs to a Space or to a person, never both. A Space's
-- accounts serve its members and engenties; a person's own accounts serve
-- that person and their Copilot in whatever Space it runs — never a Space's
-- engenties, and nothing is synced from them.
--
-- Access by Space membership no longer reads `core.spaces.owner_user_id`:
-- personal Spaces are gone, a private Space is one with a single member.

ALTER TABLE module_connections.connections
  ALTER COLUMN space_id DROP NOT NULL,
  ADD COLUMN owner_user_id uuid
    REFERENCES core.users (id) ON DELETE CASCADE,
  ADD CONSTRAINT connections_one_owner_check
    CHECK (num_nonnulls(space_id, owner_user_id) = 1);

COMMENT ON COLUMN module_connections.connections.space_id IS
  'The Space that owns this account, or null for a personal account. Every agent and member of the Space uses it.';
COMMENT ON COLUMN module_connections.connections.owner_user_id IS
  'The person who owns this account, or null for a Space account. Only that person and their Copilot use it.';

-- The Space index treated a null space_id as a value (NULLS NOT DISTINCT), so
-- every person's personal account of one connector would collide on it.
DROP INDEX module_connections.uq_module_connections_space_account;

CREATE UNIQUE INDEX uq_module_connections_space_account
  ON module_connections.connections
  USING btree (tenant_id, space_id, connector_id, external_account)
  NULLS NOT DISTINCT
  WHERE space_id IS NOT NULL;

CREATE UNIQUE INDEX uq_module_connections_personal_account
  ON module_connections.connections
  USING btree (tenant_id, owner_user_id, connector_id, external_account)
  NULLS NOT DISTINCT
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX idx_module_connections_connections_owner
  ON module_connections.connections USING btree (tenant_id, owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- A flow with no Space connects an account for the person who started it.
ALTER TABLE module_connections.pending_oauth_flows
  ALTER COLUMN space_id DROP NOT NULL;

GRANT SELECT(owner_user_id) ON TABLE module_connections.connections TO authenticated;

DROP POLICY connections_read ON module_connections.connections;

-- Members see the accounts of Spaces they belong to; a person sees their own.
CREATE POLICY connections_read ON module_connections.connections
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT core.current_tenant_id())
    AND (
      owner_user_id = (SELECT core.current_user_id())
      OR EXISTS (
        SELECT 1
        FROM core.spaces s
        JOIN core.space_member mem
          ON mem.tenant_id = s.tenant_id
         AND mem.space_id = s.id
        WHERE s.id = connections.space_id
          AND s.tenant_id = connections.tenant_id
          AND s.deleted_at IS NULL
          AND mem.user_id = (SELECT core.current_user_id())
      )
    )
  );
