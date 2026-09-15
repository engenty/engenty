-- pdf_templates: consolidated baseline.
-- Replaces 2 migration(s) (20260616001300..20260705100000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_pdf_templates; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_pdf_templates;

--
-- Name: template_documents; Type: TABLE; Schema: module_pdf_templates; Owner: -
--

CREATE TABLE module_pdf_templates.template_documents (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    template_id text NOT NULL,
    document_key text DEFAULT 'default'::text NOT NULL,
    engine text DEFAULT 'xml_liquid_v1'::text NOT NULL,
    document_template text,
    stylesheet_template text,
    input_schema_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: templates; Type: TABLE; Schema: module_pdf_templates; Owner: -
--

CREATE TABLE module_pdf_templates.templates (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    module_key text NOT NULL,
    name text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    settings_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

--
-- Name: template_documents template_documents_pkey; Type: CONSTRAINT; Schema: module_pdf_templates; Owner: -
--

ALTER TABLE ONLY module_pdf_templates.template_documents
    ADD CONSTRAINT template_documents_pkey PRIMARY KEY (id);

--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: module_pdf_templates; Owner: -
--

ALTER TABLE ONLY module_pdf_templates.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);

--
-- Name: idx_module_pdf_template_documents_unique; Type: INDEX; Schema: module_pdf_templates; Owner: -
--

CREATE UNIQUE INDEX idx_module_pdf_template_documents_unique ON module_pdf_templates.template_documents USING btree (template_id, document_key);

--
-- Name: idx_module_pdf_templates_default; Type: INDEX; Schema: module_pdf_templates; Owner: -
--

CREATE UNIQUE INDEX idx_module_pdf_templates_default ON module_pdf_templates.templates USING btree (tenant_id, scope_id, module_key) WHERE ((is_default = true) AND (deleted_at IS NULL));

--
-- Name: idx_module_pdf_templates_scope; Type: INDEX; Schema: module_pdf_templates; Owner: -
--

CREATE INDEX idx_module_pdf_templates_scope ON module_pdf_templates.templates USING btree (tenant_id, scope_id, module_key, name);

--
-- Name: template_documents template_documents_template_id_fkey; Type: FK CONSTRAINT; Schema: module_pdf_templates; Owner: -
--

ALTER TABLE ONLY module_pdf_templates.template_documents
    ADD CONSTRAINT template_documents_template_id_fkey FOREIGN KEY (template_id) REFERENCES module_pdf_templates.templates(id) ON DELETE CASCADE;

--
-- Name: template_documents template_documents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_pdf_templates; Owner: -
--

ALTER TABLE ONLY module_pdf_templates.template_documents
    ADD CONSTRAINT template_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: templates templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_pdf_templates; Owner: -
--

ALTER TABLE ONLY module_pdf_templates.templates
    ADD CONSTRAINT templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: template_documents pdf_template_documents_delete_own_scope; Type: POLICY; Schema: module_pdf_templates; Owner: -
--

CREATE POLICY pdf_template_documents_delete_own_scope ON module_pdf_templates.template_documents FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: template_documents pdf_template_documents_insert_own_scope; Type: POLICY; Schema: module_pdf_templates; Owner: -
--

CREATE POLICY pdf_template_documents_insert_own_scope ON module_pdf_templates.template_documents FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: template_documents pdf_template_documents_read_own_scope; Type: POLICY; Schema: module_pdf_templates; Owner: -
--

CREATE POLICY pdf_template_documents_read_own_scope ON module_pdf_templates.template_documents FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: template_documents pdf_template_documents_update_own_scope; Type: POLICY; Schema: module_pdf_templates; Owner: -
--

CREATE POLICY pdf_template_documents_update_own_scope ON module_pdf_templates.template_documents FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: templates pdf_templates_delete_own_scope; Type: POLICY; Schema: module_pdf_templates; Owner: -
--

CREATE POLICY pdf_templates_delete_own_scope ON module_pdf_templates.templates FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: templates pdf_templates_insert_own_scope; Type: POLICY; Schema: module_pdf_templates; Owner: -
--

CREATE POLICY pdf_templates_insert_own_scope ON module_pdf_templates.templates FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: templates pdf_templates_read_own_scope; Type: POLICY; Schema: module_pdf_templates; Owner: -
--

CREATE POLICY pdf_templates_read_own_scope ON module_pdf_templates.templates FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: templates pdf_templates_update_own_scope; Type: POLICY; Schema: module_pdf_templates; Owner: -
--

CREATE POLICY pdf_templates_update_own_scope ON module_pdf_templates.templates FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: template_documents srv_tenant_isolation; Type: POLICY; Schema: module_pdf_templates; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_pdf_templates.template_documents TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: templates srv_tenant_isolation; Type: POLICY; Schema: module_pdf_templates; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_pdf_templates.templates TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: template_documents; Type: ROW SECURITY; Schema: module_pdf_templates; Owner: -
--

ALTER TABLE module_pdf_templates.template_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: templates; Type: ROW SECURITY; Schema: module_pdf_templates; Owner: -
--

ALTER TABLE module_pdf_templates.templates ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA module_pdf_templates; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_pdf_templates TO service_role;
GRANT USAGE ON SCHEMA module_pdf_templates TO engenty_server;

--
-- Name: TABLE template_documents; Type: ACL; Schema: module_pdf_templates; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_pdf_templates.template_documents TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_pdf_templates.template_documents TO engenty_server;

--
-- Name: TABLE templates; Type: ACL; Schema: module_pdf_templates; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_pdf_templates.templates TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_pdf_templates.templates TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: templates; Type: TABLE DATA; Schema: module_pdf_templates; Owner: postgres
--


--
-- Data for Name: template_documents; Type: TABLE DATA; Schema: module_pdf_templates; Owner: postgres
--


--
--

RESET check_function_bodies;
