-- browser_bridge: consolidated baseline.
-- Replaces 1 migration(s) (20260712100000..20260712100000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_browser_bridge; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_browser_bridge;

--
-- Name: bridge_requests; Type: TABLE; Schema: module_browser_bridge; Owner: -
--

CREATE TABLE module_browser_bridge.bridge_requests (
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
    CONSTRAINT bridge_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'claimed'::text, 'completed'::text, 'error'::text, 'expired'::text])))
);

--
-- Name: bridge_sessions; Type: TABLE; Schema: module_browser_bridge; Owner: -
--

CREATE TABLE module_browser_bridge.bridge_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    installation_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    thread_id text,
    window_state jsonb,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    CONSTRAINT bridge_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])))
);

--
-- Name: installations; Type: TABLE; Schema: module_browser_bridge; Owner: -
--

CREATE TABLE module_browser_bridge.installations (
    installation_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    connection_id uuid,
    device_label text NOT NULL,
    allowed_origins jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: bridge_requests bridge_requests_pkey; Type: CONSTRAINT; Schema: module_browser_bridge; Owner: -
--

ALTER TABLE ONLY module_browser_bridge.bridge_requests
    ADD CONSTRAINT bridge_requests_pkey PRIMARY KEY (id);

--
-- Name: bridge_sessions bridge_sessions_pkey; Type: CONSTRAINT; Schema: module_browser_bridge; Owner: -
--

ALTER TABLE ONLY module_browser_bridge.bridge_sessions
    ADD CONSTRAINT bridge_sessions_pkey PRIMARY KEY (id);

--
-- Name: installations installations_pkey; Type: CONSTRAINT; Schema: module_browser_bridge; Owner: -
--

ALTER TABLE ONLY module_browser_bridge.installations
    ADD CONSTRAINT installations_pkey PRIMARY KEY (installation_id);

--
-- Name: bridge_sessions_one_active_per_installation; Type: INDEX; Schema: module_browser_bridge; Owner: -
--

CREATE UNIQUE INDEX bridge_sessions_one_active_per_installation ON module_browser_bridge.bridge_sessions USING btree (installation_id) WHERE (status = 'active'::text);

--
-- Name: idx_module_browser_bridge_installations_connection; Type: INDEX; Schema: module_browser_bridge; Owner: -
--

CREATE UNIQUE INDEX idx_module_browser_bridge_installations_connection ON module_browser_bridge.installations USING btree (connection_id) WHERE (connection_id IS NOT NULL);

--
-- Name: idx_module_browser_bridge_requests_claim; Type: INDEX; Schema: module_browser_bridge; Owner: -
--

CREATE INDEX idx_module_browser_bridge_requests_claim ON module_browser_bridge.bridge_requests USING btree (installation_id, status, created_at);

--
-- Name: bridge_requests bridge_requests_connection_id_fkey; Type: FK CONSTRAINT; Schema: module_browser_bridge; Owner: -
--

ALTER TABLE ONLY module_browser_bridge.bridge_requests
    ADD CONSTRAINT bridge_requests_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES module_connections.connections(id) ON DELETE CASCADE;

--
-- Name: bridge_requests bridge_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_browser_bridge; Owner: -
--

ALTER TABLE ONLY module_browser_bridge.bridge_requests
    ADD CONSTRAINT bridge_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: bridge_sessions bridge_sessions_installation_id_fkey; Type: FK CONSTRAINT; Schema: module_browser_bridge; Owner: -
--

ALTER TABLE ONLY module_browser_bridge.bridge_sessions
    ADD CONSTRAINT bridge_sessions_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES module_browser_bridge.installations(installation_id) ON DELETE CASCADE;

--
-- Name: bridge_sessions bridge_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_browser_bridge; Owner: -
--

ALTER TABLE ONLY module_browser_bridge.bridge_sessions
    ADD CONSTRAINT bridge_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: installations installations_connection_id_fkey; Type: FK CONSTRAINT; Schema: module_browser_bridge; Owner: -
--

ALTER TABLE ONLY module_browser_bridge.installations
    ADD CONSTRAINT installations_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES module_connections.connections(id) ON DELETE CASCADE;

--
-- Name: installations installations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_browser_bridge; Owner: -
--

ALTER TABLE ONLY module_browser_bridge.installations
    ADD CONSTRAINT installations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: bridge_requests; Type: ROW SECURITY; Schema: module_browser_bridge; Owner: -
--

ALTER TABLE module_browser_bridge.bridge_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: bridge_sessions; Type: ROW SECURITY; Schema: module_browser_bridge; Owner: -
--

ALTER TABLE module_browser_bridge.bridge_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: installations; Type: ROW SECURITY; Schema: module_browser_bridge; Owner: -
--

ALTER TABLE module_browser_bridge.installations ENABLE ROW LEVEL SECURITY;

--
-- Name: bridge_requests srv_tenant_isolation; Type: POLICY; Schema: module_browser_bridge; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_browser_bridge.bridge_requests TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: bridge_sessions srv_tenant_isolation; Type: POLICY; Schema: module_browser_bridge; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_browser_bridge.bridge_sessions TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: installations srv_tenant_isolation; Type: POLICY; Schema: module_browser_bridge; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_browser_bridge.installations TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA module_browser_bridge; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_browser_bridge TO service_role;
GRANT USAGE ON SCHEMA module_browser_bridge TO engenty_server;

--
-- Name: TABLE bridge_requests; Type: ACL; Schema: module_browser_bridge; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_browser_bridge.bridge_requests TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_browser_bridge.bridge_requests TO engenty_server;

--
-- Name: TABLE bridge_sessions; Type: ACL; Schema: module_browser_bridge; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_browser_bridge.bridge_sessions TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_browser_bridge.bridge_sessions TO engenty_server;

--
-- Name: TABLE installations; Type: ACL; Schema: module_browser_bridge; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_browser_bridge.installations TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_browser_bridge.installations TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: bridge_requests; Type: TABLE DATA; Schema: module_browser_bridge; Owner: postgres
--


--
-- Data for Name: installations; Type: TABLE DATA; Schema: module_browser_bridge; Owner: postgres
--


--
-- Data for Name: bridge_sessions; Type: TABLE DATA; Schema: module_browser_bridge; Owner: postgres
--


--
--

RESET check_function_bodies;
