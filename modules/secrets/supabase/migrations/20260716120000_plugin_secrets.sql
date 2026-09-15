-- secrets: consolidated baseline.
-- Replaces 2 migration(s) (20260716120000..20260809145000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_secrets; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_secrets;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: module_secrets; Owner: -
--

CREATE FUNCTION module_secrets.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.updated_at = now(); return new; end $$;

--
-- Name: access_log; Type: TABLE; Schema: module_secrets; Owner: -
--

CREATE TABLE module_secrets.access_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    secret_id uuid NOT NULL,
    principal_id text NOT NULL,
    principal_kind text NOT NULL,
    action text NOT NULL,
    goal_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_log_action_check CHECK ((action = ANY (ARRAY['reveal'::text, 'copy'::text, 'decrypt_for_agent'::text]))),
    CONSTRAINT access_log_principal_kind_check CHECK ((principal_kind = ANY (ARRAY['user'::text, 'agent'::text])))
);

--
-- Name: data_keys; Type: TABLE; Schema: module_secrets; Owner: -
--

CREATE TABLE module_secrets.data_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    version integer NOT NULL,
    wrapped_dek text NOT NULL,
    kms_key_ref text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: secret_grants; Type: TABLE; Schema: module_secrets; Owner: -
--

CREATE TABLE module_secrets.secret_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    secret_id uuid NOT NULL,
    user_id uuid,
    agent_id uuid,
    access text DEFAULT 'read'::text NOT NULL,
    granted_by uuid,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT secret_grants_access_check CHECK ((access = 'read'::text)),
    CONSTRAINT secret_grants_check CHECK (((user_id IS NULL) <> (agent_id IS NULL)))
);

--
-- Name: secret_projects; Type: TABLE; Schema: module_secrets; Owner: -
--

CREATE TABLE module_secrets.secret_projects (
    tenant_id uuid NOT NULL,
    secret_id uuid NOT NULL,
    project_id uuid NOT NULL
);

--
-- Name: secrets; Type: TABLE; Schema: module_secrets; Owner: -
--

CREATE TABLE module_secrets.secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    owner_scope text NOT NULL,
    owner_id text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    url text,
    description text,
    payload_enc text NOT NULL,
    dek_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT secrets_kind_check CHECK ((kind = ANY (ARRAY['username_password'::text, 'api_key'::text, 'key_list'::text, 'credit_card'::text, 'note'::text]))),
    CONSTRAINT secrets_owner_scope_check CHECK ((owner_scope = ANY (ARRAY['user'::text, 'project'::text, 'client'::text, 'tenant'::text])))
);

--
-- Name: services; Type: TABLE; Schema: module_secrets; Owner: -
--

CREATE TABLE module_secrets.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    owner_scope text NOT NULL,
    owner_id text NOT NULL,
    name text NOT NULL,
    url text,
    description text,
    cost_amount numeric(14,2),
    cost_currency text,
    cost_period text,
    next_billing_date date,
    billing_email text,
    paid_via text,
    connection_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT services_cost_period_check CHECK ((cost_period = ANY (ARRAY['monthly'::text, 'yearly'::text, 'once'::text]))),
    CONSTRAINT services_owner_scope_check CHECK ((owner_scope = ANY (ARRAY['client'::text, 'tenant'::text]))),
    CONSTRAINT services_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text])))
);

--
-- Name: access_log access_log_pkey; Type: CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.access_log
    ADD CONSTRAINT access_log_pkey PRIMARY KEY (id);

--
-- Name: data_keys data_keys_pkey; Type: CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.data_keys
    ADD CONSTRAINT data_keys_pkey PRIMARY KEY (id);

--
-- Name: data_keys data_keys_tenant_id_version_key; Type: CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.data_keys
    ADD CONSTRAINT data_keys_tenant_id_version_key UNIQUE (tenant_id, version);

--
-- Name: secret_grants secret_grants_pkey; Type: CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.secret_grants
    ADD CONSTRAINT secret_grants_pkey PRIMARY KEY (id);

--
-- Name: secret_grants secret_grants_secret_id_user_id_agent_id_key; Type: CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.secret_grants
    ADD CONSTRAINT secret_grants_secret_id_user_id_agent_id_key UNIQUE NULLS NOT DISTINCT (secret_id, user_id, agent_id);

--
-- Name: secret_projects secret_projects_pkey; Type: CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.secret_projects
    ADD CONSTRAINT secret_projects_pkey PRIMARY KEY (secret_id, project_id);

--
-- Name: secrets secrets_pkey; Type: CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.secrets
    ADD CONSTRAINT secrets_pkey PRIMARY KEY (id);

--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);

--
-- Name: idx_secret_grants_lookup; Type: INDEX; Schema: module_secrets; Owner: -
--

CREATE INDEX idx_secret_grants_lookup ON module_secrets.secret_grants USING btree (tenant_id, secret_id);

--
-- Name: idx_secrets_access_log; Type: INDEX; Schema: module_secrets; Owner: -
--

CREATE INDEX idx_secrets_access_log ON module_secrets.access_log USING btree (tenant_id, secret_id, created_at DESC);

--
-- Name: idx_secrets_owner; Type: INDEX; Schema: module_secrets; Owner: -
--

CREATE INDEX idx_secrets_owner ON module_secrets.secrets USING btree (tenant_id, owner_scope, owner_id) WHERE (deleted_at IS NULL);

--
-- Name: idx_secrets_scope; Type: INDEX; Schema: module_secrets; Owner: -
--

CREATE INDEX idx_secrets_scope ON module_secrets.secrets USING btree (tenant_id, scope_id, updated_at DESC);

--
-- Name: secrets trg_secrets_updated_at; Type: TRIGGER; Schema: module_secrets; Owner: -
--

CREATE TRIGGER trg_secrets_updated_at BEFORE UPDATE ON module_secrets.secrets FOR EACH ROW EXECUTE FUNCTION module_secrets.set_updated_at();

--
-- Name: services trg_services_updated_at; Type: TRIGGER; Schema: module_secrets; Owner: -
--

CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON module_secrets.services FOR EACH ROW EXECUTE FUNCTION module_secrets.set_updated_at();

--
-- Name: access_log access_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.access_log
    ADD CONSTRAINT access_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: data_keys data_keys_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.data_keys
    ADD CONSTRAINT data_keys_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: secret_grants secret_grants_granted_by_fkey; Type: FK CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.secret_grants
    ADD CONSTRAINT secret_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: secret_grants secret_grants_secret_id_fkey; Type: FK CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.secret_grants
    ADD CONSTRAINT secret_grants_secret_id_fkey FOREIGN KEY (secret_id) REFERENCES module_secrets.secrets(id) ON DELETE CASCADE;

--
-- Name: secret_grants secret_grants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.secret_grants
    ADD CONSTRAINT secret_grants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: secret_projects secret_projects_secret_id_fkey; Type: FK CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.secret_projects
    ADD CONSTRAINT secret_projects_secret_id_fkey FOREIGN KEY (secret_id) REFERENCES module_secrets.secrets(id) ON DELETE CASCADE;

--
-- Name: secret_projects secret_projects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.secret_projects
    ADD CONSTRAINT secret_projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: secrets secrets_created_by_fkey; Type: FK CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.secrets
    ADD CONSTRAINT secrets_created_by_fkey FOREIGN KEY (created_by) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: secrets secrets_dek_id_fkey; Type: FK CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.secrets
    ADD CONSTRAINT secrets_dek_id_fkey FOREIGN KEY (dek_id) REFERENCES module_secrets.data_keys(id);

--
-- Name: secrets secrets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.secrets
    ADD CONSTRAINT secrets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: services services_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_secrets; Owner: -
--

ALTER TABLE ONLY module_secrets.services
    ADD CONSTRAINT services_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: access_log; Type: ROW SECURITY; Schema: module_secrets; Owner: -
--

ALTER TABLE module_secrets.access_log ENABLE ROW LEVEL SECURITY;

--
-- Name: access_log access_log_read; Type: POLICY; Schema: module_secrets; Owner: -
--

CREATE POLICY access_log_read ON module_secrets.access_log FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: data_keys; Type: ROW SECURITY; Schema: module_secrets; Owner: -
--

ALTER TABLE module_secrets.data_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: secret_grants; Type: ROW SECURITY; Schema: module_secrets; Owner: -
--

ALTER TABLE module_secrets.secret_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: secret_grants secret_grants_read; Type: POLICY; Schema: module_secrets; Owner: -
--

CREATE POLICY secret_grants_read ON module_secrets.secret_grants FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: secret_projects; Type: ROW SECURITY; Schema: module_secrets; Owner: -
--

ALTER TABLE module_secrets.secret_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: secret_projects secret_projects_read; Type: POLICY; Schema: module_secrets; Owner: -
--

CREATE POLICY secret_projects_read ON module_secrets.secret_projects FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: secrets; Type: ROW SECURITY; Schema: module_secrets; Owner: -
--

ALTER TABLE module_secrets.secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: secrets secrets_read; Type: POLICY; Schema: module_secrets; Owner: -
--

CREATE POLICY secrets_read ON module_secrets.secrets FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: services; Type: ROW SECURITY; Schema: module_secrets; Owner: -
--

ALTER TABLE module_secrets.services ENABLE ROW LEVEL SECURITY;

--
-- Name: services services_read; Type: POLICY; Schema: module_secrets; Owner: -
--

CREATE POLICY services_read ON module_secrets.services FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: access_log srv_tenant_isolation; Type: POLICY; Schema: module_secrets; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_secrets.access_log TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: data_keys srv_tenant_isolation; Type: POLICY; Schema: module_secrets; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_secrets.data_keys TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: secret_grants srv_tenant_isolation; Type: POLICY; Schema: module_secrets; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_secrets.secret_grants TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: secret_projects srv_tenant_isolation; Type: POLICY; Schema: module_secrets; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_secrets.secret_projects TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: secrets srv_tenant_isolation; Type: POLICY; Schema: module_secrets; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_secrets.secrets TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: services srv_tenant_isolation; Type: POLICY; Schema: module_secrets; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_secrets.services TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA module_secrets; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_secrets TO service_role;
GRANT USAGE ON SCHEMA module_secrets TO authenticated;
GRANT USAGE ON SCHEMA module_secrets TO engenty_server;

--
-- Name: TABLE access_log; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_secrets.access_log TO service_role;
GRANT SELECT ON TABLE module_secrets.access_log TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_secrets.access_log TO engenty_server;

--
-- Name: TABLE data_keys; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_secrets.data_keys TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_secrets.data_keys TO engenty_server;

--
-- Name: TABLE secret_grants; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_secrets.secret_grants TO service_role;
GRANT SELECT ON TABLE module_secrets.secret_grants TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_secrets.secret_grants TO engenty_server;

--
-- Name: TABLE secret_projects; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_secrets.secret_projects TO service_role;
GRANT SELECT ON TABLE module_secrets.secret_projects TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_secrets.secret_projects TO engenty_server;

--
-- Name: TABLE secrets; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_secrets.secrets TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_secrets.secrets TO engenty_server;

--
-- Name: COLUMN secrets.id; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(id) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.tenant_id; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(tenant_id) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.scope_id; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(scope_id) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.owner_scope; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(owner_scope) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.owner_id; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(owner_id) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.name; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(name) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.kind; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(kind) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.url; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(url) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.description; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(description) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.dek_id; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(dek_id) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.created_by; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(created_by) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.created_at; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(created_at) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.updated_at; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(updated_at) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: COLUMN secrets.deleted_at; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT(deleted_at) ON TABLE module_secrets.secrets TO authenticated;

--
-- Name: TABLE services; Type: ACL; Schema: module_secrets; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_secrets.services TO service_role;
GRANT SELECT ON TABLE module_secrets.services TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_secrets.services TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: access_log; Type: TABLE DATA; Schema: module_secrets; Owner: postgres
--


--
-- Data for Name: data_keys; Type: TABLE DATA; Schema: module_secrets; Owner: postgres
--


--
-- Data for Name: secrets; Type: TABLE DATA; Schema: module_secrets; Owner: postgres
--


--
-- Data for Name: secret_grants; Type: TABLE DATA; Schema: module_secrets; Owner: postgres
--


--
-- Data for Name: secret_projects; Type: TABLE DATA; Schema: module_secrets; Owner: postgres
--


--
-- Data for Name: services; Type: TABLE DATA; Schema: module_secrets; Owner: postgres
--


--
--

RESET check_function_bodies;
