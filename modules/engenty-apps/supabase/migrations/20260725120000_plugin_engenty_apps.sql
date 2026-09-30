-- engenty_apps: consolidated baseline.
-- Replaces 3 migration(s) (20260725120000..20260909150000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_apps; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_apps;

--
-- Name: app_capability; Type: TABLE; Schema: module_apps; Owner: -
--

CREATE TABLE module_apps.app_capability (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    app_id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    allowed_operations text[] DEFAULT '{}'::text[] NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: app_config; Type: TABLE; Schema: module_apps; Owner: -
--

CREATE TABLE module_apps.app_config (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    app_id uuid NOT NULL,
    user_id uuid,
    key text NOT NULL,
    value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_config_key_check CHECK (((length(key) >= 1) AND (length(key) <= 200)))
);

--
-- Name: app_data; Type: TABLE; Schema: module_apps; Owner: -
--

CREATE TABLE module_apps.app_data (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    app_id uuid NOT NULL,
    session_id text NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_data_key_check CHECK (((length(key) >= 1) AND (length(key) <= 200)))
);

--
-- Name: app_versions; Type: TABLE; Schema: module_apps; Owner: -
--

CREATE TABLE module_apps.app_versions (
    id uuid NOT NULL,
    app_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    version integer NOT NULL,
    manifest jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'proposed'::text NOT NULL,
    build_log text,
    release text,
    deployed_at timestamp with time zone,
    created_by_kind text DEFAULT 'agent'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    frontend_html text,
    sha text NOT NULL,
    CONSTRAINT app_versions_created_by_kind_check CHECK ((created_by_kind = ANY (ARRAY['agent'::text, 'user'::text]))),
    CONSTRAINT app_versions_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'active'::text, 'archived'::text, 'failed'::text]))),
    CONSTRAINT app_versions_version_check CHECK ((version > 0))
);

--
-- Name: apps; Type: TABLE; Schema: module_apps; Owner: -
--

CREATE TABLE module_apps.apps (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    active_version_id uuid,
    created_by_kind text DEFAULT 'user'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    space_id uuid,
    CONSTRAINT apps_created_by_kind_check CHECK ((created_by_kind = ANY (ARRAY['agent'::text, 'user'::text]))),
    CONSTRAINT apps_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'::text)),
    CONSTRAINT apps_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])))
);

--
-- Name: app_capability app_capability_pkey; Type: CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_capability
    ADD CONSTRAINT app_capability_pkey PRIMARY KEY (id);

--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (id);

--
-- Name: app_data app_data_pkey; Type: CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_data
    ADD CONSTRAINT app_data_pkey PRIMARY KEY (id);

--
-- Name: app_data app_data_tenant_id_app_id_session_id_key_key; Type: CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_data
    ADD CONSTRAINT app_data_tenant_id_app_id_session_id_key_key UNIQUE (tenant_id, app_id, session_id, key);

--
-- Name: app_versions app_versions_app_id_version_key; Type: CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_versions
    ADD CONSTRAINT app_versions_app_id_version_key UNIQUE (app_id, version);

--
-- Name: app_versions app_versions_pkey; Type: CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_versions
    ADD CONSTRAINT app_versions_pkey PRIMARY KEY (id);

--
-- Name: apps apps_pkey; Type: CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.apps
    ADD CONSTRAINT apps_pkey PRIMARY KEY (id);

--
-- Name: idx_module_apps_apps_slug; Type: INDEX; Schema: module_apps; Owner: -
--

CREATE UNIQUE INDEX idx_module_apps_apps_slug ON module_apps.apps USING btree (tenant_id, slug);

--
-- Name: idx_module_apps_apps_space; Type: INDEX; Schema: module_apps; Owner: -
--

CREATE INDEX idx_module_apps_apps_space ON module_apps.apps USING btree (tenant_id, space_id);

--
-- Name: idx_module_apps_apps_status; Type: INDEX; Schema: module_apps; Owner: -
--

CREATE INDEX idx_module_apps_apps_status ON module_apps.apps USING btree (tenant_id, scope_id, status);

--
-- Name: idx_module_apps_capability_expiry; Type: INDEX; Schema: module_apps; Owner: -
--

CREATE INDEX idx_module_apps_capability_expiry ON module_apps.app_capability USING btree (expires_at) WHERE (revoked_at IS NULL);

--
-- Name: idx_module_apps_capability_hash; Type: INDEX; Schema: module_apps; Owner: -
--

CREATE UNIQUE INDEX idx_module_apps_capability_hash ON module_apps.app_capability USING btree (token_hash);

--
-- Name: idx_module_apps_data_session; Type: INDEX; Schema: module_apps; Owner: -
--

CREATE INDEX idx_module_apps_data_session ON module_apps.app_data USING btree (tenant_id, app_id, session_id);

--
-- Name: idx_module_apps_versions_app; Type: INDEX; Schema: module_apps; Owner: -
--

CREATE INDEX idx_module_apps_versions_app ON module_apps.app_versions USING btree (tenant_id, app_id, version DESC);

--
-- Name: uq_module_apps_config_default; Type: INDEX; Schema: module_apps; Owner: -
--

CREATE UNIQUE INDEX uq_module_apps_config_default ON module_apps.app_config USING btree (tenant_id, app_id, key) WHERE (user_id IS NULL);

--
-- Name: uq_module_apps_config_user; Type: INDEX; Schema: module_apps; Owner: -
--

CREATE UNIQUE INDEX uq_module_apps_config_user ON module_apps.app_config USING btree (tenant_id, app_id, user_id, key) WHERE (user_id IS NOT NULL);

--
-- Name: app_capability app_capability_app_id_fkey; Type: FK CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_capability
    ADD CONSTRAINT app_capability_app_id_fkey FOREIGN KEY (app_id) REFERENCES module_apps.apps(id) ON DELETE CASCADE;

--
-- Name: app_capability app_capability_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_capability
    ADD CONSTRAINT app_capability_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: app_config app_config_app_id_fkey; Type: FK CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_config
    ADD CONSTRAINT app_config_app_id_fkey FOREIGN KEY (app_id) REFERENCES module_apps.apps(id) ON DELETE CASCADE;

--
-- Name: app_config app_config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_config
    ADD CONSTRAINT app_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: app_data app_data_app_id_fkey; Type: FK CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_data
    ADD CONSTRAINT app_data_app_id_fkey FOREIGN KEY (app_id) REFERENCES module_apps.apps(id) ON DELETE CASCADE;

--
-- Name: app_data app_data_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_data
    ADD CONSTRAINT app_data_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: app_versions app_versions_app_id_fkey; Type: FK CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_versions
    ADD CONSTRAINT app_versions_app_id_fkey FOREIGN KEY (app_id) REFERENCES module_apps.apps(id) ON DELETE CASCADE;

--
-- Name: app_versions app_versions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.app_versions
    ADD CONSTRAINT app_versions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: apps apps_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.apps
    ADD CONSTRAINT apps_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: apps module_apps_apps_active_version_fk; Type: FK CONSTRAINT; Schema: module_apps; Owner: -
--

ALTER TABLE ONLY module_apps.apps
    ADD CONSTRAINT module_apps_apps_active_version_fk FOREIGN KEY (active_version_id) REFERENCES module_apps.app_versions(id) ON DELETE SET NULL;

--
-- Name: app_capability; Type: ROW SECURITY; Schema: module_apps; Owner: -
--

ALTER TABLE module_apps.app_capability ENABLE ROW LEVEL SECURITY;

--
-- Name: app_config; Type: ROW SECURITY; Schema: module_apps; Owner: -
--

ALTER TABLE module_apps.app_config ENABLE ROW LEVEL SECURITY;

--
-- Name: app_config app_config_read_own_scope; Type: POLICY; Schema: module_apps; Owner: -
--

CREATE POLICY app_config_read_own_scope ON module_apps.app_config FOR SELECT TO authenticated USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id) AND ((user_id IS NULL) OR (user_id = core.current_user_id()))));

--
-- Name: app_data; Type: ROW SECURITY; Schema: module_apps; Owner: -
--

ALTER TABLE module_apps.app_data ENABLE ROW LEVEL SECURITY;

--
-- Name: app_data app_data_read_own_scope; Type: POLICY; Schema: module_apps; Owner: -
--

CREATE POLICY app_data_read_own_scope ON module_apps.app_data FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: app_versions; Type: ROW SECURITY; Schema: module_apps; Owner: -
--

ALTER TABLE module_apps.app_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: app_versions app_versions_read_own_scope; Type: POLICY; Schema: module_apps; Owner: -
--

CREATE POLICY app_versions_read_own_scope ON module_apps.app_versions FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: apps; Type: ROW SECURITY; Schema: module_apps; Owner: -
--

ALTER TABLE module_apps.apps ENABLE ROW LEVEL SECURITY;

--
-- Name: apps apps_read_own_scope; Type: POLICY; Schema: module_apps; Owner: -
--

CREATE POLICY apps_read_own_scope ON module_apps.apps FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: app_capability srv_tenant_isolation; Type: POLICY; Schema: module_apps; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_apps.app_capability TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: app_config srv_tenant_isolation; Type: POLICY; Schema: module_apps; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_apps.app_config TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: app_data srv_tenant_isolation; Type: POLICY; Schema: module_apps; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_apps.app_data TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: app_versions srv_tenant_isolation; Type: POLICY; Schema: module_apps; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_apps.app_versions TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: apps srv_tenant_isolation; Type: POLICY; Schema: module_apps; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_apps.apps TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA module_apps; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_apps TO service_role;
GRANT USAGE ON SCHEMA module_apps TO authenticated;
GRANT USAGE ON SCHEMA module_apps TO engenty_server;

--
-- Name: TABLE app_capability; Type: ACL; Schema: module_apps; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_apps.app_capability TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_apps.app_capability TO engenty_server;

--
-- Name: TABLE app_config; Type: ACL; Schema: module_apps; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_apps.app_config TO service_role;
GRANT SELECT ON TABLE module_apps.app_config TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_apps.app_config TO engenty_server;

--
-- Name: TABLE app_data; Type: ACL; Schema: module_apps; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_apps.app_data TO service_role;
GRANT SELECT ON TABLE module_apps.app_data TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_apps.app_data TO engenty_server;

--
-- Name: TABLE app_versions; Type: ACL; Schema: module_apps; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_apps.app_versions TO service_role;
GRANT SELECT ON TABLE module_apps.app_versions TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_apps.app_versions TO engenty_server;

--
-- Name: TABLE apps; Type: ACL; Schema: module_apps; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_apps.apps TO service_role;
GRANT SELECT ON TABLE module_apps.apps TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_apps.apps TO engenty_server;

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: module_apps; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA module_apps GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO service_role;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: apps; Type: TABLE DATA; Schema: module_apps; Owner: postgres
--


--
-- Data for Name: app_capability; Type: TABLE DATA; Schema: module_apps; Owner: postgres
--


--
-- Data for Name: app_config; Type: TABLE DATA; Schema: module_apps; Owner: postgres
--


--
-- Data for Name: app_data; Type: TABLE DATA; Schema: module_apps; Owner: postgres
--


--
-- Data for Name: app_versions; Type: TABLE DATA; Schema: module_apps; Owner: postgres
--


--
--

RESET check_function_bodies;
