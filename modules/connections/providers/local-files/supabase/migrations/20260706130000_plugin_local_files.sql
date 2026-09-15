-- local_files: consolidated baseline.
-- Replaces 1 migration(s) (20260706130000..20260706130000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_local_files; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_local_files;

--
-- Name: bridge_requests; Type: TABLE; Schema: module_local_files; Owner: -
--

CREATE TABLE module_local_files.bridge_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    connection_id uuid NOT NULL,
    installation_id uuid NOT NULL,
    action text NOT NULL,
    input jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    response jsonb,
    error text,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT bridge_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'error'::text, 'expired'::text])))
);

--
-- Name: directories; Type: TABLE; Schema: module_local_files; Owner: -
--

CREATE TABLE module_local_files.directories (
    connection_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    installation_id uuid NOT NULL,
    directory_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: installations; Type: TABLE; Schema: module_local_files; Owner: -
--

CREATE TABLE module_local_files.installations (
    installation_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    device_label text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: bridge_requests bridge_requests_pkey; Type: CONSTRAINT; Schema: module_local_files; Owner: -
--

ALTER TABLE ONLY module_local_files.bridge_requests
    ADD CONSTRAINT bridge_requests_pkey PRIMARY KEY (id);

--
-- Name: directories directories_pkey; Type: CONSTRAINT; Schema: module_local_files; Owner: -
--

ALTER TABLE ONLY module_local_files.directories
    ADD CONSTRAINT directories_pkey PRIMARY KEY (connection_id);

--
-- Name: installations installations_pkey; Type: CONSTRAINT; Schema: module_local_files; Owner: -
--

ALTER TABLE ONLY module_local_files.installations
    ADD CONSTRAINT installations_pkey PRIMARY KEY (installation_id);

--
-- Name: idx_module_local_files_directories_installation; Type: INDEX; Schema: module_local_files; Owner: -
--

CREATE INDEX idx_module_local_files_directories_installation ON module_local_files.directories USING btree (installation_id);

--
-- Name: idx_module_local_files_requests_claim; Type: INDEX; Schema: module_local_files; Owner: -
--

CREATE INDEX idx_module_local_files_requests_claim ON module_local_files.bridge_requests USING btree (installation_id, status, created_at);

--
-- Name: bridge_requests bridge_requests_connection_id_fkey; Type: FK CONSTRAINT; Schema: module_local_files; Owner: -
--

ALTER TABLE ONLY module_local_files.bridge_requests
    ADD CONSTRAINT bridge_requests_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES module_connections.connections(id) ON DELETE CASCADE;

--
-- Name: bridge_requests bridge_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_local_files; Owner: -
--

ALTER TABLE ONLY module_local_files.bridge_requests
    ADD CONSTRAINT bridge_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: directories directories_connection_id_fkey; Type: FK CONSTRAINT; Schema: module_local_files; Owner: -
--

ALTER TABLE ONLY module_local_files.directories
    ADD CONSTRAINT directories_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES module_connections.connections(id) ON DELETE CASCADE;

--
-- Name: directories directories_installation_id_fkey; Type: FK CONSTRAINT; Schema: module_local_files; Owner: -
--

ALTER TABLE ONLY module_local_files.directories
    ADD CONSTRAINT directories_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES module_local_files.installations(installation_id) ON DELETE CASCADE;

--
-- Name: directories directories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_local_files; Owner: -
--

ALTER TABLE ONLY module_local_files.directories
    ADD CONSTRAINT directories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: installations installations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_local_files; Owner: -
--

ALTER TABLE ONLY module_local_files.installations
    ADD CONSTRAINT installations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: bridge_requests; Type: ROW SECURITY; Schema: module_local_files; Owner: -
--

ALTER TABLE module_local_files.bridge_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: directories; Type: ROW SECURITY; Schema: module_local_files; Owner: -
--

ALTER TABLE module_local_files.directories ENABLE ROW LEVEL SECURITY;

--
-- Name: installations; Type: ROW SECURITY; Schema: module_local_files; Owner: -
--

ALTER TABLE module_local_files.installations ENABLE ROW LEVEL SECURITY;

--
-- Name: bridge_requests srv_tenant_isolation; Type: POLICY; Schema: module_local_files; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_local_files.bridge_requests TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: directories srv_tenant_isolation; Type: POLICY; Schema: module_local_files; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_local_files.directories TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: installations srv_tenant_isolation; Type: POLICY; Schema: module_local_files; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_local_files.installations TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA module_local_files; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_local_files TO service_role;
GRANT USAGE ON SCHEMA module_local_files TO engenty_server;

--
-- Name: TABLE bridge_requests; Type: ACL; Schema: module_local_files; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_local_files.bridge_requests TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_local_files.bridge_requests TO engenty_server;

--
-- Name: TABLE directories; Type: ACL; Schema: module_local_files; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_local_files.directories TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_local_files.directories TO engenty_server;

--
-- Name: TABLE installations; Type: ACL; Schema: module_local_files; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_local_files.installations TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_local_files.installations TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: bridge_requests; Type: TABLE DATA; Schema: module_local_files; Owner: postgres
--


--
-- Data for Name: installations; Type: TABLE DATA; Schema: module_local_files; Owner: postgres
--


--
-- Data for Name: directories; Type: TABLE DATA; Schema: module_local_files; Owner: postgres
--


--
--

RESET check_function_bodies;
