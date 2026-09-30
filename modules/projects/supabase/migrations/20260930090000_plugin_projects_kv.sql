-- Per-project key/value store: the same typed-value shape as core.tenant_settings,
-- core.user_settings and module_kb.kb_settings (@engenty/scoped-kv-settings),
-- with the project in `context` ({"project_id": "…"}). First key: `subtitle`.
CREATE TABLE IF NOT EXISTS module_projects.project_kv (
    tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
    scope_id text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    -- Derived from context so the rows go with their project.
    project_id text GENERATED ALWAYS AS (context ->> 'project_id') STORED
      REFERENCES module_projects.projects(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL,
    value_string text,
    value_jsonb jsonb,
    value_numeric numeric,
    value_boolean boolean,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_kv_pkey PRIMARY KEY (tenant_id, scope_id, context, name),
    CONSTRAINT project_kv_project_required CHECK (project_id IS NOT NULL),
    CONSTRAINT project_kv_type_check CHECK (type = ANY (ARRAY['string', 'numeric', 'boolean', 'json'])),
    CONSTRAINT project_kv_value_consistency CHECK (
      (type = 'string' AND value_string IS NOT NULL) OR
      (type = 'numeric' AND value_numeric IS NOT NULL) OR
      (type = 'boolean' AND value_boolean IS NOT NULL) OR
      (type = 'json' AND value_jsonb IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_module_projects_project_kv_project
  ON module_projects.project_kv USING btree (tenant_id, project_id);

ALTER TABLE module_projects.project_kv ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON module_projects.project_kv TO engenty_server;
CREATE POLICY srv_tenant_isolation ON module_projects.project_kv
  AS PERMISSIVE FOR ALL TO engenty_server
  USING (tenant_id = (SELECT core.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT core.current_tenant_id()));
