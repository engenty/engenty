-- team: consolidated baseline.
-- Replaces 2 migration(s) (20260616001500..20260617000700),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
-- module_team holds this module's tables and team-hr's; the schema and its
-- grants belong to the module that creates it first.
create schema if not exists module_team;
grant usage on schema module_team to service_role;
grant usage on schema module_team to authenticated;
grant usage on schema module_team to engenty_server;

SET check_function_bodies = false;

--
-- Name: group_members; Type: TABLE; Schema: module_team; Owner: -
--

CREATE TABLE module_team.group_members (
    tenant_id uuid NOT NULL,
    group_id text NOT NULL,
    org_node_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: groups; Type: TABLE; Schema: module_team; Owner: -
--

CREATE TABLE module_team.groups (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    type_term_id uuid NOT NULL,
    lead_org_node_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: member_field_definitions; Type: TABLE; Schema: module_team; Owner: -
--

CREATE TABLE module_team.member_field_definitions (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    visibility text NOT NULL,
    field_type text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    field_key text NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    multiple boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT member_field_definitions_field_type_check CHECK ((field_type = ANY (ARRAY['text_input'::text, 'text_formatted'::text, 'text_tiptap'::text, 'number'::text, 'date'::text, 'date_range'::text, 'url'::text, 'image'::text, 'file'::text, 'select'::text]))),
    CONSTRAINT member_field_definitions_visibility_check CHECK ((visibility = ANY (ARRAY['shared'::text, 'private'::text, 'employment'::text])))
);

--
-- Name: org_nodes; Type: TABLE; Schema: module_team; Owner: -
--

CREATE TABLE module_team.org_nodes (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    node_kind text NOT NULL,
    profile_id text,
    agent_id text,
    display_name text NOT NULL,
    display_title text,
    icon text,
    status text,
    reports_to_id text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_nodes_human_agent_xor CHECK ((((node_kind = 'human'::text) AND (profile_id IS NOT NULL) AND (agent_id IS NULL)) OR ((node_kind = 'agent'::text) AND (agent_id IS NOT NULL) AND (profile_id IS NULL)))),
    CONSTRAINT org_nodes_node_kind_check CHECK ((node_kind = ANY (ARRAY['human'::text, 'agent'::text])))
);

--
-- Name: profile_taxonomy_assignments; Type: TABLE; Schema: module_team; Owner: -
--

CREATE TABLE module_team.profile_taxonomy_assignments (
    tenant_id uuid NOT NULL,
    profile_id text NOT NULL,
    taxonomy_slug text NOT NULL,
    term_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: profiles; Type: TABLE; Schema: module_team; Owner: -
--

CREATE TABLE module_team.profiles (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    user_id uuid,
    member_type text DEFAULT 'internal'::text NOT NULL,
    full_name text NOT NULL,
    name_prefix text,
    first_name text,
    middle_name text,
    last_name text,
    name_suffix text,
    phonetic_name text,
    birth_name text,
    full_name_override text,
    initials text,
    phone text,
    email text,
    "position" text,
    department text,
    location text,
    profile_image_storage_key text,
    import_id text,
    last_imported_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_member_type_check CHECK ((member_type = ANY (ARRAY['internal'::text, 'external'::text, 'contractor'::text])))
);

ALTER TABLE ONLY module_team.profiles REPLICA IDENTITY FULL;

--
-- Name: TABLE profiles; Type: COMMENT; Schema: module_team; Owner: -
--

COMMENT ON TABLE module_team.profiles IS 'Directory profile for internal, external, and contractor members.';

--
-- Name: COLUMN profiles.profile_image_storage_key; Type: COMMENT; Schema: module_team; Owner: -
--

COMMENT ON COLUMN module_team.profiles.profile_image_storage_key IS 'Vault key for public profile picture: tenants/<tenant>/team/members/<profile_id>/profile/...';

--
-- Name: taxonomies; Type: TABLE; Schema: module_team; Owner: -
--

CREATE TABLE module_team.taxonomies (
    tenant_id uuid NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    builtin text,
    target text NOT NULL,
    supports_order boolean DEFAULT false NOT NULL,
    supports_hierarchy boolean DEFAULT false NOT NULL,
    cardinality text DEFAULT 'single'::text NOT NULL,
    filterable boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    deletable boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT taxonomies_builtin_check CHECK (((builtin IS NULL) OR (builtin = ANY (ARRAY['role'::text, 'location'::text, 'group-type'::text])))),
    CONSTRAINT taxonomies_cardinality_check CHECK ((cardinality = ANY (ARRAY['single'::text, 'multiple'::text]))),
    CONSTRAINT taxonomies_target_check CHECK ((target = ANY (ARRAY['profile'::text, 'group'::text])))
);

--
-- Name: taxonomy_terms; Type: TABLE; Schema: module_team; Owner: -
--

CREATE TABLE module_team.taxonomy_terms (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    taxonomy_slug text NOT NULL,
    term_slug text NOT NULL,
    label text NOT NULL,
    parent_term_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (group_id, org_node_id);

--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);

--
-- Name: member_field_definitions member_field_definitions_pkey; Type: CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.member_field_definitions
    ADD CONSTRAINT member_field_definitions_pkey PRIMARY KEY (id);

--
-- Name: member_field_definitions member_field_definitions_tenant_id_field_key_key; Type: CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.member_field_definitions
    ADD CONSTRAINT member_field_definitions_tenant_id_field_key_key UNIQUE (tenant_id, field_key);

--
-- Name: org_nodes org_nodes_pkey; Type: CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.org_nodes
    ADD CONSTRAINT org_nodes_pkey PRIMARY KEY (id);

--
-- Name: profile_taxonomy_assignments profile_taxonomy_assignments_pkey; Type: CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.profile_taxonomy_assignments
    ADD CONSTRAINT profile_taxonomy_assignments_pkey PRIMARY KEY (profile_id, taxonomy_slug, term_id);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

--
-- Name: taxonomies taxonomies_pkey; Type: CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.taxonomies
    ADD CONSTRAINT taxonomies_pkey PRIMARY KEY (tenant_id, slug);

--
-- Name: taxonomy_terms taxonomy_terms_pkey; Type: CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.taxonomy_terms
    ADD CONSTRAINT taxonomy_terms_pkey PRIMARY KEY (id);

--
-- Name: idx_member_field_definitions_tenant_visibility_sort; Type: INDEX; Schema: module_team; Owner: -
--

CREATE INDEX idx_member_field_definitions_tenant_visibility_sort ON module_team.member_field_definitions USING btree (tenant_id, visibility, sort_order);

--
-- Name: idx_module_team_profiles_email_lower; Type: INDEX; Schema: module_team; Owner: -
--

CREATE INDEX idx_module_team_profiles_email_lower ON module_team.profiles USING btree (tenant_id, scope_id, lower(email)) WHERE (email IS NOT NULL);

--
-- Name: idx_module_team_profiles_import_id; Type: INDEX; Schema: module_team; Owner: -
--

CREATE INDEX idx_module_team_profiles_import_id ON module_team.profiles USING btree (tenant_id, scope_id, import_id) WHERE (import_id IS NOT NULL);

--
-- Name: idx_module_team_profiles_scope; Type: INDEX; Schema: module_team; Owner: -
--

CREATE INDEX idx_module_team_profiles_scope ON module_team.profiles USING btree (tenant_id, scope_id, updated_at DESC);

--
-- Name: idx_module_team_profiles_user; Type: INDEX; Schema: module_team; Owner: -
--

CREATE INDEX idx_module_team_profiles_user ON module_team.profiles USING btree (user_id) WHERE (user_id IS NOT NULL);

--
-- Name: idx_org_nodes_profile; Type: INDEX; Schema: module_team; Owner: -
--

CREATE UNIQUE INDEX idx_org_nodes_profile ON module_team.org_nodes USING btree (tenant_id, profile_id) WHERE (profile_id IS NOT NULL);

--
-- Name: idx_org_nodes_tenant_reports_to; Type: INDEX; Schema: module_team; Owner: -
--

CREATE INDEX idx_org_nodes_tenant_reports_to ON module_team.org_nodes USING btree (tenant_id, reports_to_id);

--
-- Name: idx_taxonomy_terms_parent; Type: INDEX; Schema: module_team; Owner: -
--

CREATE INDEX idx_taxonomy_terms_parent ON module_team.taxonomy_terms USING btree (tenant_id, taxonomy_slug, parent_term_id);

--
-- Name: idx_taxonomy_terms_slug; Type: INDEX; Schema: module_team; Owner: -
--

CREATE UNIQUE INDEX idx_taxonomy_terms_slug ON module_team.taxonomy_terms USING btree (tenant_id, taxonomy_slug, term_slug);

--
-- Name: idx_taxonomy_terms_taxonomy; Type: INDEX; Schema: module_team; Owner: -
--

CREATE INDEX idx_taxonomy_terms_taxonomy ON module_team.taxonomy_terms USING btree (tenant_id, taxonomy_slug);

--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES module_team.groups(id) ON DELETE CASCADE;

--
-- Name: group_members group_members_org_node_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.group_members
    ADD CONSTRAINT group_members_org_node_id_fkey FOREIGN KEY (org_node_id) REFERENCES module_team.org_nodes(id) ON DELETE CASCADE;

--
-- Name: groups groups_lead_org_node_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.groups
    ADD CONSTRAINT groups_lead_org_node_id_fkey FOREIGN KEY (lead_org_node_id) REFERENCES module_team.org_nodes(id) ON DELETE SET NULL;

--
-- Name: groups groups_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.groups
    ADD CONSTRAINT groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: groups groups_type_term_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.groups
    ADD CONSTRAINT groups_type_term_id_fkey FOREIGN KEY (type_term_id) REFERENCES module_team.taxonomy_terms(id) ON DELETE RESTRICT;

--
-- Name: member_field_definitions member_field_definitions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.member_field_definitions
    ADD CONSTRAINT member_field_definitions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: org_nodes org_nodes_profile_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.org_nodes
    ADD CONSTRAINT org_nodes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES module_team.profiles(id) ON DELETE CASCADE;

--
-- Name: org_nodes org_nodes_reports_to_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.org_nodes
    ADD CONSTRAINT org_nodes_reports_to_id_fkey FOREIGN KEY (reports_to_id) REFERENCES module_team.org_nodes(id) ON DELETE SET NULL;

--
-- Name: org_nodes org_nodes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.org_nodes
    ADD CONSTRAINT org_nodes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: profile_taxonomy_assignments profile_taxonomy_assignments_profile_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.profile_taxonomy_assignments
    ADD CONSTRAINT profile_taxonomy_assignments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES module_team.profiles(id) ON DELETE CASCADE;

--
-- Name: profile_taxonomy_assignments profile_taxonomy_assignments_term_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.profile_taxonomy_assignments
    ADD CONSTRAINT profile_taxonomy_assignments_term_id_fkey FOREIGN KEY (term_id) REFERENCES module_team.taxonomy_terms(id) ON DELETE CASCADE;

--
-- Name: profiles profiles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.profiles
    ADD CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: taxonomies taxonomies_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.taxonomies
    ADD CONSTRAINT taxonomies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: taxonomy_terms taxonomy_terms_parent_term_id_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.taxonomy_terms
    ADD CONSTRAINT taxonomy_terms_parent_term_id_fkey FOREIGN KEY (parent_term_id) REFERENCES module_team.taxonomy_terms(id) ON DELETE RESTRICT;

--
-- Name: taxonomy_terms taxonomy_terms_tenant_id_taxonomy_slug_fkey; Type: FK CONSTRAINT; Schema: module_team; Owner: -
--

ALTER TABLE ONLY module_team.taxonomy_terms
    ADD CONSTRAINT taxonomy_terms_tenant_id_taxonomy_slug_fkey FOREIGN KEY (tenant_id, taxonomy_slug) REFERENCES module_team.taxonomies(tenant_id, slug) ON DELETE CASCADE;

--
-- Name: group_members; Type: ROW SECURITY; Schema: module_team; Owner: -
--

ALTER TABLE module_team.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members group_members_tenant; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY group_members_tenant ON module_team.group_members USING ((tenant_id = core.current_tenant_id()));

--
-- Name: groups; Type: ROW SECURITY; Schema: module_team; Owner: -
--

ALTER TABLE module_team.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: groups groups_tenant; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY groups_tenant ON module_team.groups USING ((tenant_id = core.current_tenant_id()));

--
-- Name: member_field_definitions; Type: ROW SECURITY; Schema: module_team; Owner: -
--

ALTER TABLE module_team.member_field_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: member_field_definitions member_field_definitions_tenant; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY member_field_definitions_tenant ON module_team.member_field_definitions USING ((tenant_id = core.current_tenant_id()));

--
-- Name: org_nodes; Type: ROW SECURITY; Schema: module_team; Owner: -
--

ALTER TABLE module_team.org_nodes ENABLE ROW LEVEL SECURITY;

--
-- Name: org_nodes org_nodes_tenant; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY org_nodes_tenant ON module_team.org_nodes USING ((tenant_id = core.current_tenant_id()));

--
-- Name: profile_taxonomy_assignments; Type: ROW SECURITY; Schema: module_team; Owner: -
--

ALTER TABLE module_team.profile_taxonomy_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_taxonomy_assignments profile_taxonomy_assignments_tenant; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY profile_taxonomy_assignments_tenant ON module_team.profile_taxonomy_assignments USING ((tenant_id = core.current_tenant_id()));

--
-- Name: profiles; Type: ROW SECURITY; Schema: module_team; Owner: -
--

ALTER TABLE module_team.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete_own_scope; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY profiles_delete_own_scope ON module_team.profiles FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: profiles profiles_insert_own_scope; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY profiles_insert_own_scope ON module_team.profiles FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: profiles profiles_read_own_scope; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY profiles_read_own_scope ON module_team.profiles FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: profiles profiles_update_own_scope; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY profiles_update_own_scope ON module_team.profiles FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: group_members srv_tenant_isolation; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team.group_members TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: groups srv_tenant_isolation; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team.groups TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: member_field_definitions srv_tenant_isolation; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team.member_field_definitions TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: org_nodes srv_tenant_isolation; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team.org_nodes TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: profile_taxonomy_assignments srv_tenant_isolation; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team.profile_taxonomy_assignments TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: profiles srv_tenant_isolation; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team.profiles TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: taxonomies srv_tenant_isolation; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team.taxonomies TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: taxonomy_terms srv_tenant_isolation; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team.taxonomy_terms TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: taxonomies; Type: ROW SECURITY; Schema: module_team; Owner: -
--

ALTER TABLE module_team.taxonomies ENABLE ROW LEVEL SECURITY;

--
-- Name: taxonomies taxonomies_tenant; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY taxonomies_tenant ON module_team.taxonomies USING ((tenant_id = core.current_tenant_id()));

--
-- Name: taxonomy_terms; Type: ROW SECURITY; Schema: module_team; Owner: -
--

ALTER TABLE module_team.taxonomy_terms ENABLE ROW LEVEL SECURITY;

--
-- Name: taxonomy_terms taxonomy_terms_tenant; Type: POLICY; Schema: module_team; Owner: -
--

CREATE POLICY taxonomy_terms_tenant ON module_team.taxonomy_terms USING ((tenant_id = core.current_tenant_id()));

--
-- Name: TABLE group_members; Type: ACL; Schema: module_team; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.group_members TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.group_members TO engenty_server;

--
-- Name: TABLE groups; Type: ACL; Schema: module_team; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.groups TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.groups TO engenty_server;

--
-- Name: TABLE member_field_definitions; Type: ACL; Schema: module_team; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.member_field_definitions TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.member_field_definitions TO engenty_server;

--
-- Name: TABLE org_nodes; Type: ACL; Schema: module_team; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.org_nodes TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.org_nodes TO engenty_server;

--
-- Name: TABLE profile_taxonomy_assignments; Type: ACL; Schema: module_team; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.profile_taxonomy_assignments TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.profile_taxonomy_assignments TO engenty_server;

--
-- Name: TABLE profiles; Type: ACL; Schema: module_team; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.profiles TO service_role;
GRANT SELECT ON TABLE module_team.profiles TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.profiles TO engenty_server;

--
-- Name: TABLE taxonomies; Type: ACL; Schema: module_team; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.taxonomies TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.taxonomies TO engenty_server;

--
-- Name: TABLE taxonomy_terms; Type: ACL; Schema: module_team; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.taxonomy_terms TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team.taxonomy_terms TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: profiles; Type: TABLE DATA; Schema: module_team; Owner: postgres
--


--
-- Data for Name: org_nodes; Type: TABLE DATA; Schema: module_team; Owner: postgres
--


--
-- Data for Name: taxonomies; Type: TABLE DATA; Schema: module_team; Owner: postgres
--


--
-- Data for Name: taxonomy_terms; Type: TABLE DATA; Schema: module_team; Owner: postgres
--


--
-- Data for Name: groups; Type: TABLE DATA; Schema: module_team; Owner: postgres
--


--
-- Data for Name: group_members; Type: TABLE DATA; Schema: module_team; Owner: postgres
--


--
-- Data for Name: member_field_definitions; Type: TABLE DATA; Schema: module_team; Owner: postgres
--


--
-- Data for Name: profile_taxonomy_assignments; Type: TABLE DATA; Schema: module_team; Owner: postgres
--


--
--

RESET check_function_bodies;
