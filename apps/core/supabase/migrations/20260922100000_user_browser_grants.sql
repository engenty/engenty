-- A person's browser is one — theirs in every space and outside any — and so
-- is their consent for agents to drive it. The per-space grant rows go with
-- the per-space browsers they described: no carry-over, a person consents
-- once more, tenant-wide.
DROP TABLE IF EXISTS core.space_browser_grants;

CREATE TABLE core.user_browser_grants (
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  unattended boolean NOT NULL DEFAULT false,
  autostart boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (user_id, tenant_id) REFERENCES core.users(id, tenant_id) ON DELETE CASCADE
);

COMMENT ON TABLE core.user_browser_grants IS 'Per person consent for their own browser, tenant-wide: unattended = agents may drive it while the person is away.';
COMMENT ON COLUMN core.user_browser_grants.autostart IS 'Agents may start (create) the person''s browser without asking first.';

ALTER TABLE core.user_browser_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY srv_tenant_isolation ON core.user_browser_grants TO engenty_server
  USING (tenant_id = (SELECT core.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT core.current_tenant_id()));

GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE core.user_browser_grants TO service_role;
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE core.user_browser_grants TO engenty_server;
