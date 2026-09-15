-- company_profile: consolidated baseline.
-- Replaces 2 migration(s) (20260616000400..20260617000600),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_company_profile; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_company_profile;

--
-- Name: settings; Type: TABLE; Schema: module_company_profile; Owner: -
--

CREATE TABLE module_company_profile.settings (
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    logo_url text,
    brand_name text,
    name text,
    owner text,
    managing_director text,
    address_street text,
    address_zip text,
    address_city text,
    address_country text,
    phone text,
    email text,
    website text,
    imprint_url text,
    company_registration_number text,
    tax_number text,
    vat_id text,
    bank_name text,
    bank_iban text,
    bank_bic text,
    bank_account_name text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tag_line text,
    company_type text,
    address_street_2 text
);

ALTER TABLE ONLY module_company_profile.settings REPLICA IDENTITY FULL;

--
-- Name: COLUMN settings.tag_line; Type: COMMENT; Schema: module_company_profile; Owner: -
--

COMMENT ON COLUMN module_company_profile.settings.tag_line IS 'Short brand tagline shown with brand name';

--
-- Name: COLUMN settings.company_type; Type: COMMENT; Schema: module_company_profile; Owner: -
--

COMMENT ON COLUMN module_company_profile.settings.company_type IS 'One of: sole_proprietorship, company, association, public';

--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: module_company_profile; Owner: -
--

ALTER TABLE ONLY module_company_profile.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (tenant_id, scope_id);

--
-- Name: settings settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_company_profile; Owner: -
--

ALTER TABLE ONLY module_company_profile.settings
    ADD CONSTRAINT settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: settings company_profile_settings_insert_own_scope; Type: POLICY; Schema: module_company_profile; Owner: -
--

CREATE POLICY company_profile_settings_insert_own_scope ON module_company_profile.settings FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings company_profile_settings_read_own_scope; Type: POLICY; Schema: module_company_profile; Owner: -
--

CREATE POLICY company_profile_settings_read_own_scope ON module_company_profile.settings FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings company_profile_settings_update_own_scope; Type: POLICY; Schema: module_company_profile; Owner: -
--

CREATE POLICY company_profile_settings_update_own_scope ON module_company_profile.settings FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: settings; Type: ROW SECURITY; Schema: module_company_profile; Owner: -
--

ALTER TABLE module_company_profile.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: settings srv_tenant_isolation; Type: POLICY; Schema: module_company_profile; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_company_profile.settings TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA module_company_profile; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_company_profile TO service_role;
GRANT USAGE ON SCHEMA module_company_profile TO authenticated;
GRANT USAGE ON SCHEMA module_company_profile TO engenty_server;

--
-- Name: TABLE settings; Type: ACL; Schema: module_company_profile; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_company_profile.settings TO service_role;
GRANT SELECT ON TABLE module_company_profile.settings TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_company_profile.settings TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: settings; Type: TABLE DATA; Schema: module_company_profile; Owner: postgres
--


--
--

RESET check_function_bodies;
