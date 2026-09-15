-- contacts: consolidated baseline.
-- Replaces 4 migration(s) (20260616000500..20260809141000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_contacts; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_contacts;

--
-- Name: contact_relations; Type: TABLE; Schema: module_contacts; Owner: -
--

CREATE TABLE module_contacts.contact_relations (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    from_contact_id text NOT NULL,
    to_contact_id text NOT NULL,
    relation_type text NOT NULL,
    label text,
    "position" text,
    department text,
    role text,
    is_primary boolean DEFAULT false NOT NULL,
    valid_from date,
    valid_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_relations_relation_type_check CHECK ((relation_type = ANY (ARRAY['works_at'::text, 'member_of'::text, 'client_of'::text])))
);

ALTER TABLE ONLY module_contacts.contact_relations REPLICA IDENTITY FULL;

--
-- Name: contact_roles; Type: TABLE; Schema: module_contacts; Owner: -
--

CREATE TABLE module_contacts.contact_roles (
    contact_id text NOT NULL,
    role text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    CONSTRAINT contact_roles_role_check CHECK ((((char_length(role) >= 1) AND (char_length(role) <= 64)) AND (role ~ '^[a-z0-9][a-z0-9_-]*$'::text)))
);

--
-- Name: contact_settings; Type: TABLE; Schema: module_contacts; Owner: -
--

CREATE TABLE module_contacts.contact_settings (
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    id_prefix text DEFAULT 'C-{year}-'::text NOT NULL,
    id_offset integer DEFAULT 1000 NOT NULL,
    id_postfix text DEFAULT ''::text NOT NULL,
    salutations_json text DEFAULT '[]'::text NOT NULL,
    languages_json text DEFAULT '["Deutsch","English"]'::text NOT NULL,
    default_language text DEFAULT 'Deutsch'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: contacts; Type: TABLE; Schema: module_contacts; Owner: -
--

CREATE TABLE module_contacts.contacts (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    type text NOT NULL,
    display_name text NOT NULL,
    legal_name text,
    contact_name text DEFAULT ''::text,
    email text,
    billing_email text,
    phone text,
    vat_id text,
    tax_id text,
    registration_number text,
    court_of_registration text,
    legal_form text,
    address_street text,
    address_info text,
    address_zip text,
    address_city text,
    address_country text,
    website_contact text,
    website_impress text,
    logo_url text,
    reference_id text,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    import_id text,
    last_imported_at timestamp with time zone,
    name_prefix text,
    first_name text,
    middle_name text,
    last_name text,
    name_suffix text,
    phonetic_name text,
    birth_name text,
    display_name_override text,
    CONSTRAINT contacts_type_check CHECK ((type = ANY (ARRAY['organisation'::text, 'person'::text])))
);

ALTER TABLE ONLY module_contacts.contacts REPLICA IDENTITY FULL;

--
-- Name: contact_relations contact_relations_from_contact_id_to_contact_id_relation_ty_key; Type: CONSTRAINT; Schema: module_contacts; Owner: -
--

ALTER TABLE ONLY module_contacts.contact_relations
    ADD CONSTRAINT contact_relations_from_contact_id_to_contact_id_relation_ty_key UNIQUE (from_contact_id, to_contact_id, relation_type);

--
-- Name: contact_relations contact_relations_pkey; Type: CONSTRAINT; Schema: module_contacts; Owner: -
--

ALTER TABLE ONLY module_contacts.contact_relations
    ADD CONSTRAINT contact_relations_pkey PRIMARY KEY (id);

--
-- Name: contact_roles contact_roles_pkey; Type: CONSTRAINT; Schema: module_contacts; Owner: -
--

ALTER TABLE ONLY module_contacts.contact_roles
    ADD CONSTRAINT contact_roles_pkey PRIMARY KEY (contact_id, role);

--
-- Name: contact_settings contact_settings_pkey; Type: CONSTRAINT; Schema: module_contacts; Owner: -
--

ALTER TABLE ONLY module_contacts.contact_settings
    ADD CONSTRAINT contact_settings_pkey PRIMARY KEY (tenant_id, scope_id);

--
-- Name: contacts contacts_id_tenant_scope_key; Type: CONSTRAINT; Schema: module_contacts; Owner: -
--

ALTER TABLE ONLY module_contacts.contacts
    ADD CONSTRAINT contacts_id_tenant_scope_key UNIQUE (id, tenant_id, scope_id);

--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: module_contacts; Owner: -
--

ALTER TABLE ONLY module_contacts.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);

--
-- Name: idx_module_contacts_contact_relations_from; Type: INDEX; Schema: module_contacts; Owner: -
--

CREATE INDEX idx_module_contacts_contact_relations_from ON module_contacts.contact_relations USING btree (from_contact_id);

--
-- Name: idx_module_contacts_contact_relations_scope; Type: INDEX; Schema: module_contacts; Owner: -
--

CREATE INDEX idx_module_contacts_contact_relations_scope ON module_contacts.contact_relations USING btree (tenant_id, scope_id);

--
-- Name: idx_module_contacts_contact_relations_to; Type: INDEX; Schema: module_contacts; Owner: -
--

CREATE INDEX idx_module_contacts_contact_relations_to ON module_contacts.contact_relations USING btree (to_contact_id);

--
-- Name: idx_module_contacts_contact_roles_role; Type: INDEX; Schema: module_contacts; Owner: -
--

CREATE INDEX idx_module_contacts_contact_roles_role ON module_contacts.contact_roles USING btree (role);

--
-- Name: idx_module_contacts_contact_roles_role_contact; Type: INDEX; Schema: module_contacts; Owner: -
--

CREATE INDEX idx_module_contacts_contact_roles_role_contact ON module_contacts.contact_roles USING btree (role, contact_id);

--
-- Name: idx_module_contacts_contact_roles_tenant_role; Type: INDEX; Schema: module_contacts; Owner: -
--

CREATE INDEX idx_module_contacts_contact_roles_tenant_role ON module_contacts.contact_roles USING btree (tenant_id, scope_id, role);

--
-- Name: idx_module_contacts_contacts_display_name; Type: INDEX; Schema: module_contacts; Owner: -
--

CREATE INDEX idx_module_contacts_contacts_display_name ON module_contacts.contacts USING btree (display_name);

--
-- Name: idx_module_contacts_contacts_import_id; Type: INDEX; Schema: module_contacts; Owner: -
--

CREATE INDEX idx_module_contacts_contacts_import_id ON module_contacts.contacts USING btree (tenant_id, scope_id, import_id) WHERE ((import_id IS NOT NULL) AND (deleted_at IS NULL));

--
-- Name: idx_module_contacts_contacts_scope; Type: INDEX; Schema: module_contacts; Owner: -
--

CREATE INDEX idx_module_contacts_contacts_scope ON module_contacts.contacts USING btree (tenant_id, scope_id, updated_at DESC);

--
-- Name: idx_module_contacts_contacts_search_fts; Type: INDEX; Schema: module_contacts; Owner: -
--

CREATE INDEX idx_module_contacts_contacts_search_fts ON module_contacts.contacts USING gin (((((((setweight(to_tsvector('simple'::regconfig, COALESCE(display_name, ''::text)), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, ((((((((((((((((COALESCE(legal_name, ''::text) || ' '::text) || COALESCE(contact_name, ''::text)) || ' '::text) || COALESCE(name_prefix, ''::text)) || ' '::text) || COALESCE(first_name, ''::text)) || ' '::text) || COALESCE(middle_name, ''::text)) || ' '::text) || COALESCE(last_name, ''::text)) || ' '::text) || COALESCE(name_suffix, ''::text)) || ' '::text) || COALESCE(phonetic_name, ''::text)) || ' '::text) || COALESCE(birth_name, ''::text))), 'A'::"char")) || setweight(to_tsvector('simple'::regconfig, ((((((COALESCE(email, ''::text) || ' '::text) || COALESCE(billing_email, ''::text)) || ' '::text) || COALESCE(website_contact, ''::text)) || ' '::text) || COALESCE(website_impress, ''::text))), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, ((((COALESCE(address_city, ''::text) || ' '::text) || COALESCE(address_country, ''::text)) || ' '::text) || COALESCE(legal_form, ''::text))), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, ((((((COALESCE(reference_id, ''::text) || ' '::text) || COALESCE(vat_id, ''::text)) || ' '::text) || COALESCE(tax_id, ''::text)) || ' '::text) || COALESCE(registration_number, ''::text))), 'C'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(notes, ''::text)), 'D'::"char")))) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_contacts_contacts_search_trgm; Type: INDEX; Schema: module_contacts; Owner: -
--

CREATE INDEX idx_module_contacts_contacts_search_trgm ON module_contacts.contacts USING gin (lower(((((((((((((((((((((((((((((((((((((((((((((((((COALESCE(display_name, ''::text) || ' '::text) || COALESCE(legal_name, ''::text)) || ' '::text) || COALESCE(contact_name, ''::text)) || ' '::text) || COALESCE(name_prefix, ''::text)) || ' '::text) || COALESCE(first_name, ''::text)) || ' '::text) || COALESCE(middle_name, ''::text)) || ' '::text) || COALESCE(last_name, ''::text)) || ' '::text) || COALESCE(name_suffix, ''::text)) || ' '::text) || COALESCE(phonetic_name, ''::text)) || ' '::text) || COALESCE(birth_name, ''::text)) || ' '::text) || COALESCE(email, ''::text)) || ' '::text) || COALESCE(billing_email, ''::text)) || ' '::text) || COALESCE(phone, ''::text)) || ' '::text) || COALESCE(reference_id, ''::text)) || ' '::text) || COALESCE(vat_id, ''::text)) || ' '::text) || COALESCE(tax_id, ''::text)) || ' '::text) || COALESCE(registration_number, ''::text)) || ' '::text) || COALESCE(legal_form, ''::text)) || ' '::text) || COALESCE(address_street, ''::text)) || ' '::text) || COALESCE(address_zip, ''::text)) || ' '::text) || COALESCE(address_city, ''::text)) || ' '::text) || COALESCE(address_country, ''::text)) || ' '::text) || COALESCE(website_contact, ''::text)) || ' '::text) || COALESCE(website_impress, ''::text)) || ' '::text) || COALESCE(notes, ''::text))) public.gin_trgm_ops) WHERE (deleted_at IS NULL);

--
-- Name: idx_module_contacts_contacts_type; Type: INDEX; Schema: module_contacts; Owner: -
--

CREATE INDEX idx_module_contacts_contacts_type ON module_contacts.contacts USING btree (type) WHERE (deleted_at IS NULL);

--
-- Name: contact_relations contact_relations_from_contact_id_fkey; Type: FK CONSTRAINT; Schema: module_contacts; Owner: -
--

ALTER TABLE ONLY module_contacts.contact_relations
    ADD CONSTRAINT contact_relations_from_contact_id_fkey FOREIGN KEY (from_contact_id) REFERENCES module_contacts.contacts(id) ON DELETE CASCADE;

--
-- Name: contact_relations contact_relations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_contacts; Owner: -
--

ALTER TABLE ONLY module_contacts.contact_relations
    ADD CONSTRAINT contact_relations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: contact_relations contact_relations_to_contact_id_fkey; Type: FK CONSTRAINT; Schema: module_contacts; Owner: -
--

ALTER TABLE ONLY module_contacts.contact_relations
    ADD CONSTRAINT contact_relations_to_contact_id_fkey FOREIGN KEY (to_contact_id) REFERENCES module_contacts.contacts(id) ON DELETE CASCADE;

--
-- Name: contact_roles contact_roles_contact_tenant_fkey; Type: FK CONSTRAINT; Schema: module_contacts; Owner: -
--

ALTER TABLE ONLY module_contacts.contact_roles
    ADD CONSTRAINT contact_roles_contact_tenant_fkey FOREIGN KEY (contact_id, tenant_id, scope_id) REFERENCES module_contacts.contacts(id, tenant_id, scope_id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: contact_settings contact_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_contacts; Owner: -
--

ALTER TABLE ONLY module_contacts.contact_settings
    ADD CONSTRAINT contact_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: contacts contacts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_contacts; Owner: -
--

ALTER TABLE ONLY module_contacts.contacts
    ADD CONSTRAINT contacts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: contact_relations; Type: ROW SECURITY; Schema: module_contacts; Owner: -
--

ALTER TABLE module_contacts.contact_relations ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_relations contact_relations_delete_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contact_relations_delete_own_scope ON module_contacts.contact_relations FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contact_relations contact_relations_insert_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contact_relations_insert_own_scope ON module_contacts.contact_relations FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contact_relations contact_relations_read_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contact_relations_read_own_scope ON module_contacts.contact_relations FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contact_relations contact_relations_update_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contact_relations_update_own_scope ON module_contacts.contact_relations FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contact_roles; Type: ROW SECURITY; Schema: module_contacts; Owner: -
--

ALTER TABLE module_contacts.contact_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_roles contact_roles_delete_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contact_roles_delete_own_scope ON module_contacts.contact_roles FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contact_roles contact_roles_insert_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contact_roles_insert_own_scope ON module_contacts.contact_roles FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contact_roles contact_roles_read_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contact_roles_read_own_scope ON module_contacts.contact_roles FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contact_settings; Type: ROW SECURITY; Schema: module_contacts; Owner: -
--

ALTER TABLE module_contacts.contact_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_settings contact_settings_insert_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contact_settings_insert_own_scope ON module_contacts.contact_settings FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contact_settings contact_settings_read_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contact_settings_read_own_scope ON module_contacts.contact_settings FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contact_settings contact_settings_update_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contact_settings_update_own_scope ON module_contacts.contact_settings FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contacts; Type: ROW SECURITY; Schema: module_contacts; Owner: -
--

ALTER TABLE module_contacts.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts_delete_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contacts_delete_own_scope ON module_contacts.contacts FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contacts contacts_insert_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contacts_insert_own_scope ON module_contacts.contacts FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contacts contacts_read_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contacts_read_own_scope ON module_contacts.contacts FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contacts contacts_update_own_scope; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY contacts_update_own_scope ON module_contacts.contacts FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: contact_relations srv_tenant_isolation; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_contacts.contact_relations TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: contact_roles srv_tenant_isolation; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_contacts.contact_roles TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: contact_settings srv_tenant_isolation; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_contacts.contact_settings TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: contacts srv_tenant_isolation; Type: POLICY; Schema: module_contacts; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_contacts.contacts TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA module_contacts; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_contacts TO service_role;
GRANT USAGE ON SCHEMA module_contacts TO authenticated;
GRANT USAGE ON SCHEMA module_contacts TO engenty_server;

--
-- Name: TABLE contact_relations; Type: ACL; Schema: module_contacts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_contacts.contact_relations TO service_role;
GRANT SELECT ON TABLE module_contacts.contact_relations TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_contacts.contact_relations TO engenty_server;

--
-- Name: TABLE contact_roles; Type: ACL; Schema: module_contacts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_contacts.contact_roles TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_contacts.contact_roles TO engenty_server;

--
-- Name: TABLE contact_settings; Type: ACL; Schema: module_contacts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_contacts.contact_settings TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_contacts.contact_settings TO engenty_server;

--
-- Name: TABLE contacts; Type: ACL; Schema: module_contacts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_contacts.contacts TO service_role;
GRANT SELECT ON TABLE module_contacts.contacts TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_contacts.contacts TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: contacts; Type: TABLE DATA; Schema: module_contacts; Owner: postgres
--


--
-- Data for Name: contact_relations; Type: TABLE DATA; Schema: module_contacts; Owner: postgres
--


--
-- Data for Name: contact_roles; Type: TABLE DATA; Schema: module_contacts; Owner: postgres
--


--
-- Data for Name: contact_settings; Type: TABLE DATA; Schema: module_contacts; Owner: postgres
--


--
--

RESET check_function_bodies;
