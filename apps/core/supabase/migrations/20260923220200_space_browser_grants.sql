-- The browser is a Space's again (PLAN-space-owned-connections.md): one per
-- Space, shared logins, one window per agent. Its consents belong to the
-- Space too — set by the Space's owners, read by every run in it. Fresh
-- start: the per-person consents go with the per-person browsers.
DROP TABLE IF EXISTS core.user_browser_grants;

CREATE TABLE core.space_browser_grants (
  tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES core.spaces(id) ON DELETE CASCADE,
  unattended boolean NOT NULL DEFAULT false,
  autostart boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, space_id)
);

COMMENT ON TABLE core.space_browser_grants IS 'Per Space consent for its browser: unattended = agents may drive it while nobody is watching.';
COMMENT ON COLUMN core.space_browser_grants.autostart IS 'Agents may start the Space''s browser without asking first.';

ALTER TABLE core.space_browser_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY srv_tenant_isolation ON core.space_browser_grants TO engenty_server
  USING (tenant_id = (SELECT core.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT core.current_tenant_id()));

GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE core.space_browser_grants TO service_role;
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE core.space_browser_grants TO engenty_server;
