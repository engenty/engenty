-- Per-Space key/value store: the typed-value shape of core.tenant_settings and
-- core.user_settings, one set per space. First key: `cover` (the home header).
CREATE TABLE IF NOT EXISTS core.space_settings (
    tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
    space_id uuid NOT NULL REFERENCES core.spaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL,
    value_string text,
    value_jsonb jsonb,
    value_numeric numeric,
    value_boolean boolean,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT space_settings_pkey PRIMARY KEY (tenant_id, space_id, name),
    CONSTRAINT space_settings_type_check CHECK (type = ANY (ARRAY['string', 'numeric', 'boolean', 'json'])),
    CONSTRAINT space_settings_value_consistency CHECK (
      (type = 'string' AND value_string IS NOT NULL) OR
      (type = 'numeric' AND value_numeric IS NOT NULL) OR
      (type = 'boolean' AND value_boolean IS NOT NULL) OR
      (type = 'json' AND value_jsonb IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_space_settings_space
  ON core.space_settings USING btree (space_id);

ALTER TABLE core.space_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON core.space_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.space_settings TO engenty_server;
-- Space reads embed their settings; readable wherever the tenant's spaces are.
GRANT SELECT ON core.space_settings TO authenticated;

CREATE POLICY srv_tenant_isolation ON core.space_settings
  AS PERMISSIVE FOR ALL TO engenty_server
  USING (tenant_id = (SELECT core.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT core.current_tenant_id()));

CREATE POLICY space_settings_read_own_tenant ON core.space_settings
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT core.current_tenant_id()));
