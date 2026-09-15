-- invoices: consolidated baseline.
-- Replaces 3 migration(s) (20260616001100..20260625130100),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_invoices; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_invoices;

--
-- Name: invoice_blocks; Type: TABLE; Schema: module_invoices; Owner: -
--

CREATE TABLE module_invoices.invoice_blocks (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    invoice_id text NOT NULL,
    type text NOT NULL,
    content_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_blocks_type_check CHECK ((type = ANY (ARRAY['phase'::text, 'headline'::text, 'subheading'::text, 'text'::text, 'line_item'::text])))
);

ALTER TABLE ONLY module_invoices.invoice_blocks REPLICA IDENTITY FULL;

--
-- Name: invoices; Type: TABLE; Schema: module_invoices; Owner: -
--

CREATE TABLE module_invoices.invoices (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    number text NOT NULL,
    date date NOT NULL,
    due_date date NOT NULL,
    content text,
    sum_netto numeric(12,2) NOT NULL,
    tax numeric(12,2) NOT NULL,
    sum_brutto numeric(12,2) NOT NULL,
    client_id text,
    recipient_snapshot jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    title text,
    reference text,
    status text DEFAULT 'draft'::text NOT NULL,
    issued_at timestamp with time zone,
    corrects_invoice_id text,
    currency text DEFAULT 'EUR'::text NOT NULL,
    introduction text,
    final_notes text,
    recipient_name text,
    recipient_address text,
    recipient_email text,
    recipient_custom_info text,
    show_contact_name boolean DEFAULT true NOT NULL,
    show_contact_email boolean DEFAULT true NOT NULL,
    billing_type text DEFAULT 'fixed_price'::text NOT NULL,
    billing_interval text,
    retainer_amount numeric(12,2),
    spillover_rules text,
    allows_fixed_positions boolean DEFAULT false NOT NULL,
    usage_based boolean DEFAULT false NOT NULL,
    default_tax_rate numeric(5,2) DEFAULT 20 NOT NULL,
    show_tax_per_item boolean DEFAULT false NOT NULL,
    no_tax_reason text,
    phases_enabled boolean DEFAULT false NOT NULL,
    show_phase_index boolean DEFAULT false NOT NULL,
    phase_index_pattern text DEFAULT '1.'::text NOT NULL,
    show_phase_totals boolean DEFAULT false NOT NULL,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    settings_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    template_id text,
    CONSTRAINT invoices_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'yearly'::text]))),
    CONSTRAINT invoices_billing_type_check CHECK ((billing_type = ANY (ARRAY['fixed_price'::text, 'time_and_materials'::text, 'retainer'::text, 'recurring'::text]))),
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'issued'::text, 'sent'::text, 'paid'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY module_invoices.invoices REPLICA IDENTITY FULL;

--
-- Name: settings; Type: TABLE; Schema: module_invoices; Owner: -
--

CREATE TABLE module_invoices.settings (
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    invoice_id_prefix text DEFAULT 're-{year}-'::text NOT NULL,
    invoice_id_offset integer DEFAULT 1000 NOT NULL,
    invoice_id_postfix text DEFAULT ''::text NOT NULL,
    default_intro text DEFAULT ''::text NOT NULL,
    default_final_notes text DEFAULT ''::text NOT NULL,
    due_in_days integer DEFAULT 14 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: invoice_blocks invoice_blocks_pkey; Type: CONSTRAINT; Schema: module_invoices; Owner: -
--

ALTER TABLE ONLY module_invoices.invoice_blocks
    ADD CONSTRAINT invoice_blocks_pkey PRIMARY KEY (id);

--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: module_invoices; Owner: -
--

ALTER TABLE ONLY module_invoices.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);

--
-- Name: invoices invoices_tenant_id_scope_id_number_key; Type: CONSTRAINT; Schema: module_invoices; Owner: -
--

ALTER TABLE ONLY module_invoices.invoices
    ADD CONSTRAINT invoices_tenant_id_scope_id_number_key UNIQUE (tenant_id, scope_id, number);

--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: module_invoices; Owner: -
--

ALTER TABLE ONLY module_invoices.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (tenant_id, scope_id);

--
-- Name: idx_module_invoice_blocks_scope; Type: INDEX; Schema: module_invoices; Owner: -
--

CREATE INDEX idx_module_invoice_blocks_scope ON module_invoices.invoice_blocks USING btree (tenant_id, scope_id, invoice_id, order_index);

--
-- Name: idx_module_invoices_scope; Type: INDEX; Schema: module_invoices; Owner: -
--

CREATE INDEX idx_module_invoices_scope ON module_invoices.invoices USING btree (tenant_id, scope_id, date DESC);

--
-- Name: idx_module_invoices_settings_scope; Type: INDEX; Schema: module_invoices; Owner: -
--

CREATE INDEX idx_module_invoices_settings_scope ON module_invoices.settings USING btree (tenant_id, scope_id);

--
-- Name: idx_module_invoices_status; Type: INDEX; Schema: module_invoices; Owner: -
--

CREATE INDEX idx_module_invoices_status ON module_invoices.invoices USING btree (tenant_id, scope_id, status);

--
-- Name: idx_module_invoices_template_id; Type: INDEX; Schema: module_invoices; Owner: -
--

CREATE INDEX idx_module_invoices_template_id ON module_invoices.invoices USING btree (template_id);

--
-- Name: invoice_blocks invoice_blocks_invoice_id_fkey; Type: FK CONSTRAINT; Schema: module_invoices; Owner: -
--

ALTER TABLE ONLY module_invoices.invoice_blocks
    ADD CONSTRAINT invoice_blocks_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES module_invoices.invoices(id) ON DELETE CASCADE;

--
-- Name: invoice_blocks invoice_blocks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_invoices; Owner: -
--

ALTER TABLE ONLY module_invoices.invoice_blocks
    ADD CONSTRAINT invoice_blocks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: invoices invoices_corrects_invoice_id_fkey; Type: FK CONSTRAINT; Schema: module_invoices; Owner: -
--

ALTER TABLE ONLY module_invoices.invoices
    ADD CONSTRAINT invoices_corrects_invoice_id_fkey FOREIGN KEY (corrects_invoice_id) REFERENCES module_invoices.invoices(id) ON DELETE SET NULL;

--
-- Name: invoices invoices_template_id_fkey; Type: FK CONSTRAINT; Schema: module_invoices; Owner: -
--

ALTER TABLE ONLY module_invoices.invoices
    ADD CONSTRAINT invoices_template_id_fkey FOREIGN KEY (template_id) REFERENCES module_pdf_templates.templates(id) ON DELETE SET NULL;

--
-- Name: invoices invoices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_invoices; Owner: -
--

ALTER TABLE ONLY module_invoices.invoices
    ADD CONSTRAINT invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: settings settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_invoices; Owner: -
--

ALTER TABLE ONLY module_invoices.settings
    ADD CONSTRAINT settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: invoice_blocks; Type: ROW SECURITY; Schema: module_invoices; Owner: -
--

ALTER TABLE module_invoices.invoice_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_blocks invoice_blocks_delete_own_scope; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY invoice_blocks_delete_own_scope ON module_invoices.invoice_blocks FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: invoice_blocks invoice_blocks_insert_own_scope; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY invoice_blocks_insert_own_scope ON module_invoices.invoice_blocks FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: invoice_blocks invoice_blocks_read_own_scope; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY invoice_blocks_read_own_scope ON module_invoices.invoice_blocks FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: invoice_blocks invoice_blocks_update_own_scope; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY invoice_blocks_update_own_scope ON module_invoices.invoice_blocks FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings invoice_settings_delete_own_scope; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY invoice_settings_delete_own_scope ON module_invoices.settings FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings invoice_settings_insert_own_scope; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY invoice_settings_insert_own_scope ON module_invoices.settings FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings invoice_settings_read_own_scope; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY invoice_settings_read_own_scope ON module_invoices.settings FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings invoice_settings_update_own_scope; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY invoice_settings_update_own_scope ON module_invoices.settings FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: invoices; Type: ROW SECURITY; Schema: module_invoices; Owner: -
--

ALTER TABLE module_invoices.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_delete_own_scope; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY invoices_delete_own_scope ON module_invoices.invoices FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: invoices invoices_insert_own_scope; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY invoices_insert_own_scope ON module_invoices.invoices FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: invoices invoices_read_own_scope; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY invoices_read_own_scope ON module_invoices.invoices FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: invoices invoices_update_own_scope; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY invoices_update_own_scope ON module_invoices.invoices FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings; Type: ROW SECURITY; Schema: module_invoices; Owner: -
--

ALTER TABLE module_invoices.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_blocks srv_tenant_isolation; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_invoices.invoice_blocks TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: invoices srv_tenant_isolation; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_invoices.invoices TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: settings srv_tenant_isolation; Type: POLICY; Schema: module_invoices; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_invoices.settings TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA module_invoices; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_invoices TO service_role;
GRANT USAGE ON SCHEMA module_invoices TO authenticated;
GRANT USAGE ON SCHEMA module_invoices TO engenty_server;

--
-- Name: TABLE invoice_blocks; Type: ACL; Schema: module_invoices; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_invoices.invoice_blocks TO service_role;
GRANT SELECT ON TABLE module_invoices.invoice_blocks TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_invoices.invoice_blocks TO engenty_server;

--
-- Name: TABLE invoices; Type: ACL; Schema: module_invoices; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_invoices.invoices TO service_role;
GRANT SELECT ON TABLE module_invoices.invoices TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_invoices.invoices TO engenty_server;

--
-- Name: TABLE settings; Type: ACL; Schema: module_invoices; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_invoices.settings TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_invoices.settings TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: invoices; Type: TABLE DATA; Schema: module_invoices; Owner: postgres
--


--
-- Data for Name: invoice_blocks; Type: TABLE DATA; Schema: module_invoices; Owner: postgres
--


--
-- Data for Name: settings; Type: TABLE DATA; Schema: module_invoices; Owner: postgres
--


--
--

RESET check_function_bodies;
