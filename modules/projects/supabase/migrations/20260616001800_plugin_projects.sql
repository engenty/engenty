-- projects: consolidated baseline.
-- Replaces 11 migration(s) (20260616001800..20260907140200),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_projects; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_projects;

--
-- Name: is_portal_enabled(text); Type: FUNCTION; Schema: module_projects; Owner: -
--

CREATE FUNCTION module_projects.is_portal_enabled(p_project_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'module_projects', 'core'
    AS $$
  select exists (
    select 1 from module_projects.projects
    where id = p_project_id and portal_enabled = true
  )
$$;

--
-- Name: is_project_member(text); Type: FUNCTION; Schema: module_projects; Owner: -
--

CREATE FUNCTION module_projects.is_project_member(p_project_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from module_projects.project_team pt
    join module_projects.projects pr on pr.id = pt.project_id
    where pt.project_id = p_project_id
      and pt.user_id = (select auth.uid())::text
      and pr.tenant_id = core.current_tenant_id()
  )
$$;

--
-- Name: is_project_visible(text); Type: FUNCTION; Schema: module_projects; Owner: -
--

CREATE FUNCTION module_projects.is_project_visible(p_project_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from module_projects.projects pr
    where pr.id = p_project_id
      and (
        pr.visibility = 'tenant'
        or module_projects.is_project_member(p_project_id)
      )
  )
$$;

--
-- Name: project_inbox_candidates; Type: TABLE; Schema: module_projects; Owner: -
--

CREATE TABLE module_projects.project_inbox_candidates (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    inbox_message_id text NOT NULL,
    suggested_project_id text,
    suggested_owner_id text,
    suggested_task_title text NOT NULL,
    suggested_action text,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_task_id uuid,
    qualified_at timestamp with time zone,
    applied_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: COLUMN project_inbox_candidates.created_task_id; Type: COMMENT; Schema: module_projects; Owner: -
--

COMMENT ON COLUMN module_projects.project_inbox_candidates.created_task_id IS 'Canonical task id from module_tasks.tasks (no FK; prelaunch cutover)';

--
-- Name: project_phases; Type: TABLE; Schema: module_projects; Owner: -
--

CREATE TABLE module_projects.project_phases (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    project_id text NOT NULL,
    title text NOT NULL,
    start_date date,
    end_date date,
    is_main boolean DEFAULT false NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY module_projects.project_phases REPLICA IDENTITY FULL;

--
-- Name: project_settings; Type: TABLE; Schema: module_projects; Owner: -
--

CREATE TABLE module_projects.project_settings (
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    default_task_statuses_json text DEFAULT '["todo","in_progress","done","request"]'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    briefing_overdue_days integer DEFAULT 7 NOT NULL
);

--
-- Name: COLUMN project_settings.briefing_overdue_days; Type: COMMENT; Schema: module_projects; Owner: -
--

COMMENT ON COLUMN module_projects.project_settings.briefing_overdue_days IS 'Days without task update before showing in Forgotten/stale briefing section';

--
-- Name: project_team; Type: TABLE; Schema: module_projects; Owner: -
--

CREATE TABLE module_projects.project_team (
    project_id text NOT NULL,
    user_id text NOT NULL,
    role text DEFAULT 'project-member'::text NOT NULL,
    role_name text,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    CONSTRAINT project_team_role_check CHECK ((role = ANY (ARRAY['project-lead'::text, 'project-member'::text, 'project-external'::text])))
);

--
-- Name: projects; Type: TABLE; Schema: module_projects; Owner: -
--

CREATE TABLE module_projects.projects (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    client_id text,
    lead_id uuid,
    title text NOT NULL,
    briefing text,
    start_date date,
    end_date date,
    portal_enabled boolean DEFAULT false NOT NULL,
    portal_password text,
    portal_intro_text text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    client_name text,
    enabled_tabs jsonb,
    visibility text DEFAULT 'tenant'::text NOT NULL,
    timeplan_enabled boolean DEFAULT true NOT NULL,
    space_id uuid NOT NULL,
    CONSTRAINT projects_visibility_check CHECK ((visibility = ANY (ARRAY['tenant'::text, 'members'::text])))
);

ALTER TABLE ONLY module_projects.projects REPLICA IDENTITY FULL;

--
-- Name: project_inbox_candidates project_inbox_candidates_pkey; Type: CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.project_inbox_candidates
    ADD CONSTRAINT project_inbox_candidates_pkey PRIMARY KEY (id);

--
-- Name: project_inbox_candidates project_inbox_candidates_tenant_id_scope_id_inbox_message_i_key; Type: CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.project_inbox_candidates
    ADD CONSTRAINT project_inbox_candidates_tenant_id_scope_id_inbox_message_i_key UNIQUE (tenant_id, scope_id, inbox_message_id);

--
-- Name: project_phases project_phases_pkey; Type: CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.project_phases
    ADD CONSTRAINT project_phases_pkey PRIMARY KEY (id);

--
-- Name: project_settings project_settings_pkey; Type: CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.project_settings
    ADD CONSTRAINT project_settings_pkey PRIMARY KEY (tenant_id, scope_id);

--
-- Name: project_team project_team_pkey; Type: CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.project_team
    ADD CONSTRAINT project_team_pkey PRIMARY KEY (project_id, user_id);

--
-- Name: projects projects_id_tenant_scope_key; Type: CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.projects
    ADD CONSTRAINT projects_id_tenant_scope_key UNIQUE (id, tenant_id, scope_id);

--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

--
-- Name: idx_module_project_phases_project; Type: INDEX; Schema: module_projects; Owner: -
--

CREATE INDEX idx_module_project_phases_project ON module_projects.project_phases USING btree (project_id, order_index);

--
-- Name: idx_module_project_phases_scope; Type: INDEX; Schema: module_projects; Owner: -
--

CREATE INDEX idx_module_project_phases_scope ON module_projects.project_phases USING btree (tenant_id, scope_id);

--
-- Name: idx_module_project_team_project; Type: INDEX; Schema: module_projects; Owner: -
--

CREATE INDEX idx_module_project_team_project ON module_projects.project_team USING btree (project_id);

--
-- Name: idx_module_project_team_tenant_scope; Type: INDEX; Schema: module_projects; Owner: -
--

CREATE INDEX idx_module_project_team_tenant_scope ON module_projects.project_team USING btree (tenant_id, scope_id);

--
-- Name: idx_module_project_team_user; Type: INDEX; Schema: module_projects; Owner: -
--

CREATE INDEX idx_module_project_team_user ON module_projects.project_team USING btree (user_id);

--
-- Name: idx_module_projects_client; Type: INDEX; Schema: module_projects; Owner: -
--

CREATE INDEX idx_module_projects_client ON module_projects.projects USING btree (client_id);

--
-- Name: idx_module_projects_scope; Type: INDEX; Schema: module_projects; Owner: -
--

CREATE INDEX idx_module_projects_scope ON module_projects.projects USING btree (tenant_id, scope_id, updated_at DESC);

--
-- Name: idx_module_projects_space; Type: INDEX; Schema: module_projects; Owner: -
--

CREATE INDEX idx_module_projects_space ON module_projects.projects USING btree (tenant_id, space_id);

--
-- Name: idx_project_inbox_candidates_scope_status; Type: INDEX; Schema: module_projects; Owner: -
--

CREATE INDEX idx_project_inbox_candidates_scope_status ON module_projects.project_inbox_candidates USING btree (tenant_id, scope_id, status);

--
-- Name: idx_project_team_one_lead_per_project; Type: INDEX; Schema: module_projects; Owner: -
--

CREATE UNIQUE INDEX idx_project_team_one_lead_per_project ON module_projects.project_team USING btree (project_id) WHERE (role = 'project-lead'::text);

--
-- Name: project_inbox_candidates project_inbox_candidates_suggested_project_id_fkey; Type: FK CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.project_inbox_candidates
    ADD CONSTRAINT project_inbox_candidates_suggested_project_id_fkey FOREIGN KEY (suggested_project_id) REFERENCES module_projects.projects(id) ON DELETE SET NULL;

--
-- Name: project_inbox_candidates project_inbox_candidates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.project_inbox_candidates
    ADD CONSTRAINT project_inbox_candidates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: project_phases project_phases_project_id_fkey; Type: FK CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.project_phases
    ADD CONSTRAINT project_phases_project_id_fkey FOREIGN KEY (project_id) REFERENCES module_projects.projects(id) ON DELETE CASCADE;

--
-- Name: project_phases project_phases_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.project_phases
    ADD CONSTRAINT project_phases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: project_settings project_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.project_settings
    ADD CONSTRAINT project_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: project_team project_team_project_tenant_fkey; Type: FK CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.project_team
    ADD CONSTRAINT project_team_project_tenant_fkey FOREIGN KEY (project_id, tenant_id, scope_id) REFERENCES module_projects.projects(id, tenant_id, scope_id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: projects projects_lead_id_fkey; Type: FK CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.projects
    ADD CONSTRAINT projects_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: projects projects_space_tenant_fkey; Type: FK CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.projects
    ADD CONSTRAINT projects_space_tenant_fkey FOREIGN KEY (space_id, tenant_id) REFERENCES core.spaces(id, tenant_id) ON DELETE CASCADE;

--
-- Name: projects projects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_projects; Owner: -
--

ALTER TABLE ONLY module_projects.projects
    ADD CONSTRAINT projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: project_phases portal_anon_phases_select; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY portal_anon_phases_select ON module_projects.project_phases FOR SELECT TO anon USING (((is_public = true) AND module_projects.is_portal_enabled(project_id)));

--
-- Name: project_inbox_candidates; Type: ROW SECURITY; Schema: module_projects; Owner: -
--

ALTER TABLE module_projects.project_inbox_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: project_inbox_candidates project_inbox_candidates_delete_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_inbox_candidates_delete_own_scope ON module_projects.project_inbox_candidates FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_inbox_candidates project_inbox_candidates_insert_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_inbox_candidates_insert_own_scope ON module_projects.project_inbox_candidates FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_inbox_candidates project_inbox_candidates_read_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_inbox_candidates_read_own_scope ON module_projects.project_inbox_candidates FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_inbox_candidates project_inbox_candidates_update_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_inbox_candidates_update_own_scope ON module_projects.project_inbox_candidates FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_phases; Type: ROW SECURITY; Schema: module_projects; Owner: -
--

ALTER TABLE module_projects.project_phases ENABLE ROW LEVEL SECURITY;

--
-- Name: project_phases project_phases_delete_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_phases_delete_own_scope ON module_projects.project_phases FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_phases project_phases_insert_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_phases_insert_own_scope ON module_projects.project_phases FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_phases project_phases_read_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_phases_read_own_scope ON module_projects.project_phases FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id) AND module_projects.is_project_visible(project_id)));

--
-- Name: project_phases project_phases_update_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_phases_update_own_scope ON module_projects.project_phases FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_settings; Type: ROW SECURITY; Schema: module_projects; Owner: -
--

ALTER TABLE module_projects.project_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: project_settings project_settings_insert_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_settings_insert_own_scope ON module_projects.project_settings FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_settings project_settings_read_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_settings_read_own_scope ON module_projects.project_settings FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_settings project_settings_update_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_settings_update_own_scope ON module_projects.project_settings FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_team; Type: ROW SECURITY; Schema: module_projects; Owner: -
--

ALTER TABLE module_projects.project_team ENABLE ROW LEVEL SECURITY;

--
-- Name: project_team project_team_delete_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_team_delete_own_scope ON module_projects.project_team FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_team project_team_insert_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_team_insert_own_scope ON module_projects.project_team FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_team project_team_read_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY project_team_read_own_scope ON module_projects.project_team FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: projects; Type: ROW SECURITY; Schema: module_projects; Owner: -
--

ALTER TABLE module_projects.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY projects_delete_own_scope ON module_projects.projects FOR DELETE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: projects projects_insert_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY projects_insert_own_scope ON module_projects.projects FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: projects projects_read_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY projects_read_own_scope ON module_projects.projects FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id) AND ((visibility = 'tenant'::text) OR module_projects.is_project_member(id))));

--
-- Name: projects projects_update_own_scope; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY projects_update_own_scope ON module_projects.projects FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: project_inbox_candidates srv_tenant_isolation; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_projects.project_inbox_candidates TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: project_phases srv_tenant_isolation; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_projects.project_phases TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: project_settings srv_tenant_isolation; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_projects.project_settings TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: project_team srv_tenant_isolation; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_projects.project_team TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: projects srv_tenant_isolation; Type: POLICY; Schema: module_projects; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_projects.projects TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA module_projects; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_projects TO service_role;
GRANT USAGE ON SCHEMA module_projects TO anon;
GRANT USAGE ON SCHEMA module_projects TO authenticated;
GRANT USAGE ON SCHEMA module_projects TO engenty_server;

--
-- Name: FUNCTION is_portal_enabled(p_project_id text); Type: ACL; Schema: module_projects; Owner: -
--

GRANT ALL ON FUNCTION module_projects.is_portal_enabled(p_project_id text) TO engenty_server;

--
-- Name: FUNCTION is_project_member(p_project_id text); Type: ACL; Schema: module_projects; Owner: -
--

REVOKE ALL ON FUNCTION module_projects.is_project_member(p_project_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION module_projects.is_project_member(p_project_id text) TO authenticated;
GRANT ALL ON FUNCTION module_projects.is_project_member(p_project_id text) TO service_role;
GRANT ALL ON FUNCTION module_projects.is_project_member(p_project_id text) TO engenty_server;

--
-- Name: FUNCTION is_project_visible(p_project_id text); Type: ACL; Schema: module_projects; Owner: -
--

REVOKE ALL ON FUNCTION module_projects.is_project_visible(p_project_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION module_projects.is_project_visible(p_project_id text) TO authenticated;
GRANT ALL ON FUNCTION module_projects.is_project_visible(p_project_id text) TO service_role;
GRANT ALL ON FUNCTION module_projects.is_project_visible(p_project_id text) TO engenty_server;

--
-- Name: TABLE project_inbox_candidates; Type: ACL; Schema: module_projects; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_projects.project_inbox_candidates TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_projects.project_inbox_candidates TO engenty_server;

--
-- Name: TABLE project_phases; Type: ACL; Schema: module_projects; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_projects.project_phases TO service_role;
GRANT SELECT ON TABLE module_projects.project_phases TO anon;
GRANT SELECT ON TABLE module_projects.project_phases TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_projects.project_phases TO engenty_server;

--
-- Name: TABLE project_settings; Type: ACL; Schema: module_projects; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_projects.project_settings TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_projects.project_settings TO engenty_server;

--
-- Name: TABLE project_team; Type: ACL; Schema: module_projects; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_projects.project_team TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_projects.project_team TO engenty_server;

--
-- Name: TABLE projects; Type: ACL; Schema: module_projects; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_projects.projects TO service_role;
GRANT SELECT ON TABLE module_projects.projects TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_projects.projects TO engenty_server;

--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: module_projects; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA module_projects GRANT SELECT,USAGE ON SEQUENCES TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: module_projects; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA module_projects GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO service_role;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: projects; Type: TABLE DATA; Schema: module_projects; Owner: postgres
--


--
-- Data for Name: project_inbox_candidates; Type: TABLE DATA; Schema: module_projects; Owner: postgres
--


--
-- Data for Name: project_phases; Type: TABLE DATA; Schema: module_projects; Owner: postgres
--


--
-- Data for Name: project_settings; Type: TABLE DATA; Schema: module_projects; Owner: postgres
--


--
-- Data for Name: project_team; Type: TABLE DATA; Schema: module_projects; Owner: postgres
--


--
--

RESET check_function_bodies;
