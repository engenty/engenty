-- Project notes as pages: each project holds an ordered list of rich-text
-- pages (the KB page editor's TipTap JSON, plus its markdown for agents and
-- search). They replace the single `projects.briefing` HTML field.
CREATE TABLE IF NOT EXISTS module_projects.project_notes (
    id text PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
    scope_id text NOT NULL,
    project_id text NOT NULL REFERENCES module_projects.projects(id) ON DELETE CASCADE,
    title text DEFAULT ''::text NOT NULL,
    content_json jsonb,
    content_markdown text,
    order_index integer DEFAULT 0 NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_module_projects_project_notes_project
  ON module_projects.project_notes USING btree (tenant_id, project_id, order_index);

ALTER TABLE module_projects.project_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON module_projects.project_notes TO engenty_server;
CREATE POLICY srv_tenant_isolation ON module_projects.project_notes
  AS PERMISSIVE FOR ALL TO engenty_server
  USING (tenant_id = (SELECT core.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT core.current_tenant_id()));

ALTER TABLE module_projects.projects DROP COLUMN IF EXISTS briefing;
