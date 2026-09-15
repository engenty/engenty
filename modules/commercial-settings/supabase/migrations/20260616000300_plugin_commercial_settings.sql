-- commercial_settings: consolidated baseline.
-- Replaces 2 migration(s) (20260616000300..20260809190000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_commercial_settings; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_commercial_settings;

--
-- Name: settings; Type: TABLE; Schema: module_commercial_settings; Owner: -
--

CREATE TABLE module_commercial_settings.settings (
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    default_locale text,
    number_locale text,
    currency text,
    currency_symbol text,
    tax_rates_json text,
    no_tax_reason text,
    units_json text,
    disciplines_json text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expense_categories_json text,
    tax_deduction_rules_json text
);

ALTER TABLE ONLY module_commercial_settings.settings REPLICA IDENTITY FULL;

--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: module_commercial_settings; Owner: -
--

ALTER TABLE ONLY module_commercial_settings.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (tenant_id, scope_id);

--
-- Name: settings settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_commercial_settings; Owner: -
--

ALTER TABLE ONLY module_commercial_settings.settings
    ADD CONSTRAINT settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: settings commercial_settings_insert_own_scope; Type: POLICY; Schema: module_commercial_settings; Owner: -
--

CREATE POLICY commercial_settings_insert_own_scope ON module_commercial_settings.settings FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings commercial_settings_read_own_scope; Type: POLICY; Schema: module_commercial_settings; Owner: -
--

CREATE POLICY commercial_settings_read_own_scope ON module_commercial_settings.settings FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings commercial_settings_update_own_scope; Type: POLICY; Schema: module_commercial_settings; Owner: -
--

CREATE POLICY commercial_settings_update_own_scope ON module_commercial_settings.settings FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings; Type: ROW SECURITY; Schema: module_commercial_settings; Owner: -
--

ALTER TABLE module_commercial_settings.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: settings srv_tenant_isolation; Type: POLICY; Schema: module_commercial_settings; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_commercial_settings.settings TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA module_commercial_settings; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_commercial_settings TO service_role;
GRANT USAGE ON SCHEMA module_commercial_settings TO authenticated;
GRANT USAGE ON SCHEMA module_commercial_settings TO engenty_server;

--
-- Name: TABLE settings; Type: ACL; Schema: module_commercial_settings; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_commercial_settings.settings TO service_role;
GRANT SELECT ON TABLE module_commercial_settings.settings TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_commercial_settings.settings TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: settings; Type: TABLE DATA; Schema: module_commercial_settings; Owner: postgres
--


--
--

RESET check_function_bodies;
