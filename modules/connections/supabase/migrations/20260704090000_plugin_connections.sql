-- connections: consolidated baseline.
-- Replaces 6 migration(s) (20260704090000..20260813130000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_connections; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_connections;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: module_connections; Owner: -
--

CREATE FUNCTION module_connections.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;

--
-- Name: approval_requests; Type: TABLE; Schema: module_connections; Owner: -
--

CREATE TABLE module_connections.approval_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    connection_id uuid NOT NULL,
    action_id text NOT NULL,
    operation_id text NOT NULL,
    requested_by text NOT NULL,
    task_id text,
    input_summary jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'expired'::text])))
);

--
-- Name: connection_action_policies; Type: TABLE; Schema: module_connections; Owner: -
--

CREATE TABLE module_connections.connection_action_policies (
    connection_id uuid NOT NULL,
    selector text NOT NULL,
    policy text NOT NULL,
    CONSTRAINT connection_action_policies_policy_check CHECK ((policy = ANY (ARRAY['allow'::text, 'ask'::text, 'deny'::text])))
);

--
-- Name: connection_agent_grants; Type: TABLE; Schema: module_connections; Owner: -
--

CREATE TABLE module_connections.connection_agent_grants (
    connection_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    granted_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: connections; Type: TABLE; Schema: module_connections; Owner: -
--

CREATE TABLE module_connections.connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    connector_id text NOT NULL,
    owner_user_id uuid,
    sharing text DEFAULT 'personal'::text NOT NULL,
    autonomous_mode text DEFAULT 'off'::text NOT NULL,
    non_owner_max_group text,
    display_name text,
    external_account text,
    auth_kind text DEFAULT 'oauth2'::text NOT NULL,
    access_token_enc text,
    refresh_token_enc text,
    token_expires_at timestamp with time zone,
    granted_scopes text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connections_auth_kind_check CHECK ((auth_kind = ANY (ARRAY['oauth2'::text, 'api_key'::text, 'browser'::text]))),
    CONSTRAINT connections_autonomous_mode_check CHECK ((autonomous_mode = ANY (ARRAY['off'::text, 'read_only'::text, 'full'::text]))),
    CONSTRAINT connections_non_owner_max_group_check CHECK ((non_owner_max_group = ANY (ARRAY['read'::text, 'write'::text, 'destructive'::text]))),
    CONSTRAINT connections_sharing_check CHECK ((sharing = ANY (ARRAY['personal'::text, 'org'::text]))),
    CONSTRAINT connections_status_check CHECK ((status = ANY (ARRAY['active'::text, 'error'::text, 'revoked'::text])))
);

--
-- Name: pending_oauth_flows; Type: TABLE; Schema: module_connections; Owner: -
--

CREATE TABLE module_connections.pending_oauth_flows (
    nonce text NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    connector_id text NOT NULL,
    sharing text DEFAULT 'personal'::text NOT NULL,
    requested_scopes text[] DEFAULT '{}'::text[] NOT NULL,
    redirect_to text,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    space_id uuid,
    CONSTRAINT pending_oauth_flows_sharing_check CHECK ((sharing = ANY (ARRAY['personal'::text, 'org'::text])))
);

--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: module_connections; Owner: -
--

ALTER TABLE ONLY module_connections.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);

--
-- Name: connection_action_policies connection_action_policies_pkey; Type: CONSTRAINT; Schema: module_connections; Owner: -
--

ALTER TABLE ONLY module_connections.connection_action_policies
    ADD CONSTRAINT connection_action_policies_pkey PRIMARY KEY (connection_id, selector);

--
-- Name: connection_agent_grants connection_agent_grants_pkey; Type: CONSTRAINT; Schema: module_connections; Owner: -
--

ALTER TABLE ONLY module_connections.connection_agent_grants
    ADD CONSTRAINT connection_agent_grants_pkey PRIMARY KEY (connection_id, agent_id);

--
-- Name: connections connections_pkey; Type: CONSTRAINT; Schema: module_connections; Owner: -
--

ALTER TABLE ONLY module_connections.connections
    ADD CONSTRAINT connections_pkey PRIMARY KEY (id);

--
-- Name: pending_oauth_flows pending_oauth_flows_pkey; Type: CONSTRAINT; Schema: module_connections; Owner: -
--

ALTER TABLE ONLY module_connections.pending_oauth_flows
    ADD CONSTRAINT pending_oauth_flows_pkey PRIMARY KEY (nonce);

--
-- Name: idx_module_connections_agent_grants_agent; Type: INDEX; Schema: module_connections; Owner: -
--

CREATE INDEX idx_module_connections_agent_grants_agent ON module_connections.connection_agent_grants USING btree (agent_id);

--
-- Name: idx_module_connections_approvals_tenant_status; Type: INDEX; Schema: module_connections; Owner: -
--

CREATE INDEX idx_module_connections_approvals_tenant_status ON module_connections.approval_requests USING btree (tenant_id, status, created_at DESC);

--
-- Name: idx_module_connections_connections_tenant; Type: INDEX; Schema: module_connections; Owner: -
--

CREATE INDEX idx_module_connections_connections_tenant ON module_connections.connections USING btree (tenant_id, connector_id);

--
-- Name: idx_module_connections_pending_expires; Type: INDEX; Schema: module_connections; Owner: -
--

CREATE INDEX idx_module_connections_pending_expires ON module_connections.pending_oauth_flows USING btree (expires_at);

--
-- Name: uq_module_connections_org; Type: INDEX; Schema: module_connections; Owner: -
--

CREATE UNIQUE INDEX uq_module_connections_org ON module_connections.connections USING btree (tenant_id, connector_id, external_account) NULLS NOT DISTINCT WHERE (sharing = 'org'::text);

--
-- Name: uq_module_connections_personal; Type: INDEX; Schema: module_connections; Owner: -
--

CREATE UNIQUE INDEX uq_module_connections_personal ON module_connections.connections USING btree (tenant_id, connector_id, owner_user_id, external_account) NULLS NOT DISTINCT WHERE (sharing = 'personal'::text);

--
-- Name: connections trg_connections_updated_at; Type: TRIGGER; Schema: module_connections; Owner: -
--

CREATE TRIGGER trg_connections_updated_at BEFORE UPDATE ON module_connections.connections FOR EACH ROW EXECUTE FUNCTION module_connections.set_updated_at();

--
-- Name: approval_requests approval_requests_connection_id_fkey; Type: FK CONSTRAINT; Schema: module_connections; Owner: -
--

ALTER TABLE ONLY module_connections.approval_requests
    ADD CONSTRAINT approval_requests_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES module_connections.connections(id) ON DELETE CASCADE;

--
-- Name: approval_requests approval_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_connections; Owner: -
--

ALTER TABLE ONLY module_connections.approval_requests
    ADD CONSTRAINT approval_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: connection_action_policies connection_action_policies_connection_id_fkey; Type: FK CONSTRAINT; Schema: module_connections; Owner: -
--

ALTER TABLE ONLY module_connections.connection_action_policies
    ADD CONSTRAINT connection_action_policies_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES module_connections.connections(id) ON DELETE CASCADE;

--
-- Name: connection_agent_grants connection_agent_grants_connection_id_fkey; Type: FK CONSTRAINT; Schema: module_connections; Owner: -
--

ALTER TABLE ONLY module_connections.connection_agent_grants
    ADD CONSTRAINT connection_agent_grants_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES module_connections.connections(id) ON DELETE CASCADE;

--
-- Name: connections connections_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: module_connections; Owner: -
--

ALTER TABLE ONLY module_connections.connections
    ADD CONSTRAINT connections_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES core.users(id) ON DELETE CASCADE;

--
-- Name: connections connections_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_connections; Owner: -
--

ALTER TABLE ONLY module_connections.connections
    ADD CONSTRAINT connections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: pending_oauth_flows pending_oauth_flows_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_connections; Owner: -
--

ALTER TABLE ONLY module_connections.pending_oauth_flows
    ADD CONSTRAINT pending_oauth_flows_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: approval_requests; Type: ROW SECURITY; Schema: module_connections; Owner: -
--

ALTER TABLE module_connections.approval_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_requests approval_requests_read; Type: POLICY; Schema: module_connections; Owner: -
--

CREATE POLICY approval_requests_read ON module_connections.approval_requests FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: connection_action_policies; Type: ROW SECURITY; Schema: module_connections; Owner: -
--

ALTER TABLE module_connections.connection_action_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: connection_action_policies connection_action_policies_read; Type: POLICY; Schema: module_connections; Owner: -
--

CREATE POLICY connection_action_policies_read ON module_connections.connection_action_policies FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM module_connections.connections c
  WHERE ((c.id = connection_action_policies.connection_id) AND (c.tenant_id = core.current_tenant_id()) AND ((c.sharing = 'org'::text) OR (c.owner_user_id = core.current_user_id()))))));

--
-- Name: connection_agent_grants; Type: ROW SECURITY; Schema: module_connections; Owner: -
--

ALTER TABLE module_connections.connection_agent_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: connections; Type: ROW SECURITY; Schema: module_connections; Owner: -
--

ALTER TABLE module_connections.connections ENABLE ROW LEVEL SECURITY;

--
-- Name: connections connections_read; Type: POLICY; Schema: module_connections; Owner: -
--

CREATE POLICY connections_read ON module_connections.connections FOR SELECT TO authenticated USING (((tenant_id = core.current_tenant_id()) AND ((sharing = 'org'::text) OR (owner_user_id = core.current_user_id()))));

--
-- Name: pending_oauth_flows; Type: ROW SECURITY; Schema: module_connections; Owner: -
--

ALTER TABLE module_connections.pending_oauth_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_requests srv_tenant_isolation; Type: POLICY; Schema: module_connections; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_connections.approval_requests TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: connection_action_policies srv_tenant_isolation; Type: POLICY; Schema: module_connections; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_connections.connection_action_policies TO engenty_server USING ((EXISTS ( SELECT 1
   FROM module_connections.connections c
  WHERE ((c.id = connection_action_policies.connection_id) AND (c.tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM module_connections.connections c
  WHERE ((c.id = connection_action_policies.connection_id) AND (c.tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))))));

--
-- Name: connection_agent_grants srv_tenant_isolation; Type: POLICY; Schema: module_connections; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_connections.connection_agent_grants TO engenty_server USING ((EXISTS ( SELECT 1
   FROM module_connections.connections c
  WHERE ((c.id = connection_agent_grants.connection_id) AND (c.tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM module_connections.connections c
  WHERE ((c.id = connection_agent_grants.connection_id) AND (c.tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))))));

--
-- Name: connections srv_tenant_isolation; Type: POLICY; Schema: module_connections; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_connections.connections TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: pending_oauth_flows srv_tenant_isolation; Type: POLICY; Schema: module_connections; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_connections.pending_oauth_flows TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA module_connections; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_connections TO service_role;
GRANT USAGE ON SCHEMA module_connections TO authenticated;
GRANT USAGE ON SCHEMA module_connections TO engenty_server;

--
-- Name: TABLE approval_requests; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_connections.approval_requests TO service_role;
GRANT SELECT ON TABLE module_connections.approval_requests TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_connections.approval_requests TO engenty_server;

--
-- Name: TABLE connection_action_policies; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_connections.connection_action_policies TO service_role;
GRANT SELECT ON TABLE module_connections.connection_action_policies TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_connections.connection_action_policies TO engenty_server;

--
-- Name: TABLE connection_agent_grants; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_connections.connection_agent_grants TO engenty_server;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_connections.connection_agent_grants TO service_role;

--
-- Name: TABLE connections; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_connections.connections TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_connections.connections TO engenty_server;

--
-- Name: COLUMN connections.id; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(id) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.tenant_id; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(tenant_id) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.connector_id; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(connector_id) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.owner_user_id; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(owner_user_id) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.sharing; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(sharing) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.autonomous_mode; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(autonomous_mode) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.non_owner_max_group; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(non_owner_max_group) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.display_name; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(display_name) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.external_account; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(external_account) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.auth_kind; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(auth_kind) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.token_expires_at; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(token_expires_at) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.granted_scopes; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(granted_scopes) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.status; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(status) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.error_message; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(error_message) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.created_at; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(created_at) ON TABLE module_connections.connections TO authenticated;

--
-- Name: COLUMN connections.updated_at; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT(updated_at) ON TABLE module_connections.connections TO authenticated;

--
-- Name: TABLE pending_oauth_flows; Type: ACL; Schema: module_connections; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_connections.pending_oauth_flows TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_connections.pending_oauth_flows TO engenty_server;

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: module_connections; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA module_connections GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO service_role;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: connections; Type: TABLE DATA; Schema: module_connections; Owner: postgres
--


--
-- Data for Name: approval_requests; Type: TABLE DATA; Schema: module_connections; Owner: postgres
--


--
-- Data for Name: connection_action_policies; Type: TABLE DATA; Schema: module_connections; Owner: postgres
--


--
-- Data for Name: connection_agent_grants; Type: TABLE DATA; Schema: module_connections; Owner: postgres
--


--
-- Data for Name: pending_oauth_flows; Type: TABLE DATA; Schema: module_connections; Owner: postgres
--


--
--

RESET check_function_bodies;
