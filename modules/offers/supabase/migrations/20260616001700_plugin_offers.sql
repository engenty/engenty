-- offers: consolidated baseline.
-- Replaces 4 migration(s) (20260616001700..20260626160000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_offers; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_offers;

--
-- Name: offer_blocks; Type: TABLE; Schema: module_offers; Owner: -
--

CREATE TABLE module_offers.offer_blocks (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    offer_id text NOT NULL,
    type text NOT NULL,
    content_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT offer_blocks_type_check CHECK ((type = ANY (ARRAY['phase'::text, 'headline'::text, 'subheading'::text, 'text'::text, 'line_item'::text])))
);

ALTER TABLE ONLY module_offers.offer_blocks REPLICA IDENTITY FULL;

--
-- Name: offers; Type: TABLE; Schema: module_offers; Owner: -
--

CREATE TABLE module_offers.offers (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    client_id text,
    title text NOT NULL,
    offer_number text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    reference text,
    offer_date date,
    valid_until date,
    introduction text,
    final_notes text,
    currency text DEFAULT 'EUR'::text NOT NULL,
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
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    template_id text,
    sent_at timestamp with time zone,
    lead_id text,
    internal_notes text,
    approved_at timestamp with time zone,
    approved_by_name text,
    accepted_at timestamp with time zone,
    project_id text,
    contract_signed_at timestamp with time zone,
    contract_notes text,
    contract_file_path text,
    version_number integer DEFAULT 1 NOT NULL,
    parent_offer_id text,
    billing_plan jsonb,
    CONSTRAINT offers_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'yearly'::text]))),
    CONSTRAINT offers_billing_type_check CHECK ((billing_type = ANY (ARRAY['fixed_price'::text, 'time_and_materials'::text, 'retainer'::text, 'recurring'::text]))),
    CONSTRAINT offers_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'accepted'::text])))
);

ALTER TABLE ONLY module_offers.offers REPLICA IDENTITY FULL;

--
-- Name: settings; Type: TABLE; Schema: module_offers; Owner: -
--

CREATE TABLE module_offers.settings (
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    offer_id_prefix text DEFAULT 'ang-{year}-'::text NOT NULL,
    offer_id_offset integer DEFAULT 1000 NOT NULL,
    offer_id_postfix text DEFAULT ''::text NOT NULL,
    default_intro text DEFAULT ''::text NOT NULL,
    default_final_notes text DEFAULT ''::text NOT NULL,
    valid_until_days integer DEFAULT 30 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: templates; Type: TABLE; Schema: module_offers; Owner: -
--

CREATE TABLE module_offers.templates (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    template_type text DEFAULT 'offer'::text NOT NULL,
    name text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    content_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT templates_template_type_check CHECK ((template_type = 'offer'::text))
);

--
-- Name: offer_blocks offer_blocks_pkey; Type: CONSTRAINT; Schema: module_offers; Owner: -
--

ALTER TABLE ONLY module_offers.offer_blocks
    ADD CONSTRAINT offer_blocks_pkey PRIMARY KEY (id);

--
-- Name: offers offers_pkey; Type: CONSTRAINT; Schema: module_offers; Owner: -
--

ALTER TABLE ONLY module_offers.offers
    ADD CONSTRAINT offers_pkey PRIMARY KEY (id);

--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: module_offers; Owner: -
--

ALTER TABLE ONLY module_offers.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (tenant_id, scope_id);

--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: module_offers; Owner: -
--

ALTER TABLE ONLY module_offers.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);

--
-- Name: idx_module_offer_blocks_scope; Type: INDEX; Schema: module_offers; Owner: -
--

CREATE INDEX idx_module_offer_blocks_scope ON module_offers.offer_blocks USING btree (tenant_id, scope_id, offer_id, order_index);

--
-- Name: idx_module_offers_client; Type: INDEX; Schema: module_offers; Owner: -
--

CREATE INDEX idx_module_offers_client ON module_offers.offers USING btree (client_id) WHERE (client_id IS NOT NULL);

--
-- Name: idx_module_offers_lead_id; Type: INDEX; Schema: module_offers; Owner: -
--

CREATE INDEX idx_module_offers_lead_id ON module_offers.offers USING btree (lead_id);

--
-- Name: idx_module_offers_offer_number_unique; Type: INDEX; Schema: module_offers; Owner: -
--

CREATE UNIQUE INDEX idx_module_offers_offer_number_unique ON module_offers.offers USING btree (tenant_id, scope_id, offer_number) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_offers_parent_offer_id; Type: INDEX; Schema: module_offers; Owner: -
--

CREATE INDEX idx_module_offers_parent_offer_id ON module_offers.offers USING btree (parent_offer_id);

--
-- Name: idx_module_offers_scope; Type: INDEX; Schema: module_offers; Owner: -
--

CREATE INDEX idx_module_offers_scope ON module_offers.offers USING btree (tenant_id, scope_id, updated_at DESC);

--
-- Name: idx_module_offers_settings_scope; Type: INDEX; Schema: module_offers; Owner: -
--

CREATE INDEX idx_module_offers_settings_scope ON module_offers.settings USING btree (tenant_id, scope_id);

--
-- Name: idx_module_offers_template_id; Type: INDEX; Schema: module_offers; Owner: -
--

CREATE INDEX idx_module_offers_template_id ON module_offers.offers USING btree (template_id);

--
-- Name: idx_module_offers_templates_default; Type: INDEX; Schema: module_offers; Owner: -
--

CREATE UNIQUE INDEX idx_module_offers_templates_default ON module_offers.templates USING btree (tenant_id, scope_id, template_type) WHERE ((is_default = true) AND (deleted_at IS NULL));

--
-- Name: idx_module_offers_templates_scope; Type: INDEX; Schema: module_offers; Owner: -
--

CREATE INDEX idx_module_offers_templates_scope ON module_offers.templates USING btree (tenant_id, scope_id, template_type, name);

--
-- Name: offer_blocks offer_blocks_offer_id_fkey; Type: FK CONSTRAINT; Schema: module_offers; Owner: -
--

ALTER TABLE ONLY module_offers.offer_blocks
    ADD CONSTRAINT offer_blocks_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES module_offers.offers(id) ON DELETE CASCADE;

--
-- Name: offer_blocks offer_blocks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_offers; Owner: -
--

ALTER TABLE ONLY module_offers.offer_blocks
    ADD CONSTRAINT offer_blocks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: offers offers_client_id_fkey; Type: FK CONSTRAINT; Schema: module_offers; Owner: -
--

ALTER TABLE ONLY module_offers.offers
    ADD CONSTRAINT offers_client_id_fkey FOREIGN KEY (client_id) REFERENCES module_contacts.contacts(id) ON DELETE SET NULL;

--
-- Name: offers offers_created_by_fkey; Type: FK CONSTRAINT; Schema: module_offers; Owner: -
--

ALTER TABLE ONLY module_offers.offers
    ADD CONSTRAINT offers_created_by_fkey FOREIGN KEY (created_by) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: offers offers_template_id_fkey; Type: FK CONSTRAINT; Schema: module_offers; Owner: -
--

ALTER TABLE ONLY module_offers.offers
    ADD CONSTRAINT offers_template_id_fkey FOREIGN KEY (template_id) REFERENCES module_pdf_templates.templates(id) ON DELETE SET NULL;

--
-- Name: offers offers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_offers; Owner: -
--

ALTER TABLE ONLY module_offers.offers
    ADD CONSTRAINT offers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: settings settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_offers; Owner: -
--

ALTER TABLE ONLY module_offers.settings
    ADD CONSTRAINT settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: templates templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_offers; Owner: -
--

ALTER TABLE ONLY module_offers.templates
    ADD CONSTRAINT templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: offer_blocks; Type: ROW SECURITY; Schema: module_offers; Owner: -
--

ALTER TABLE module_offers.offer_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: offer_blocks offer_blocks_delete_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY offer_blocks_delete_own_scope ON module_offers.offer_blocks FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: offer_blocks offer_blocks_insert_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY offer_blocks_insert_own_scope ON module_offers.offer_blocks FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: offer_blocks offer_blocks_read_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY offer_blocks_read_own_scope ON module_offers.offer_blocks FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: offer_blocks offer_blocks_update_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY offer_blocks_update_own_scope ON module_offers.offer_blocks FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: offers; Type: ROW SECURITY; Schema: module_offers; Owner: -
--

ALTER TABLE module_offers.offers ENABLE ROW LEVEL SECURITY;

--
-- Name: offers offers_delete_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY offers_delete_own_scope ON module_offers.offers FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: offers offers_insert_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY offers_insert_own_scope ON module_offers.offers FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: offers offers_read_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY offers_read_own_scope ON module_offers.offers FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: offers offers_update_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY offers_update_own_scope ON module_offers.offers FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings; Type: ROW SECURITY; Schema: module_offers; Owner: -
--

ALTER TABLE module_offers.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: settings settings_delete_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY settings_delete_own_scope ON module_offers.settings FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings settings_insert_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY settings_insert_own_scope ON module_offers.settings FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings settings_read_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY settings_read_own_scope ON module_offers.settings FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings settings_update_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY settings_update_own_scope ON module_offers.settings FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: offer_blocks srv_tenant_isolation; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_offers.offer_blocks TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: offers srv_tenant_isolation; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_offers.offers TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: settings srv_tenant_isolation; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_offers.settings TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: templates srv_tenant_isolation; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_offers.templates TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: templates; Type: ROW SECURITY; Schema: module_offers; Owner: -
--

ALTER TABLE module_offers.templates ENABLE ROW LEVEL SECURITY;

--
-- Name: templates templates_delete_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY templates_delete_own_scope ON module_offers.templates FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: templates templates_insert_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY templates_insert_own_scope ON module_offers.templates FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: templates templates_read_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY templates_read_own_scope ON module_offers.templates FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: templates templates_update_own_scope; Type: POLICY; Schema: module_offers; Owner: -
--

CREATE POLICY templates_update_own_scope ON module_offers.templates FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: SCHEMA module_offers; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_offers TO service_role;
GRANT USAGE ON SCHEMA module_offers TO authenticated;
GRANT USAGE ON SCHEMA module_offers TO engenty_server;

--
-- Name: TABLE offer_blocks; Type: ACL; Schema: module_offers; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_offers.offer_blocks TO service_role;
GRANT SELECT ON TABLE module_offers.offer_blocks TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_offers.offer_blocks TO engenty_server;

--
-- Name: TABLE offers; Type: ACL; Schema: module_offers; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_offers.offers TO service_role;
GRANT SELECT ON TABLE module_offers.offers TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_offers.offers TO engenty_server;

--
-- Name: TABLE settings; Type: ACL; Schema: module_offers; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_offers.settings TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_offers.settings TO engenty_server;

--
-- Name: TABLE templates; Type: ACL; Schema: module_offers; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_offers.templates TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_offers.templates TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: offers; Type: TABLE DATA; Schema: module_offers; Owner: postgres
--


--
-- Data for Name: offer_blocks; Type: TABLE DATA; Schema: module_offers; Owner: postgres
--


--
-- Data for Name: settings; Type: TABLE DATA; Schema: module_offers; Owner: postgres
--


--
-- Data for Name: templates; Type: TABLE DATA; Schema: module_offers; Owner: postgres
--


--
--

RESET check_function_bodies;
