-- tasks: consolidated baseline.
-- Replaces 31 migration(s) (20260616001400..20260907140100),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_tasks; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_tasks;

--
-- Name: task_activity; Type: TABLE; Schema: module_tasks; Owner: -
--

CREATE TABLE module_tasks.task_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    task_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    actor_user_id uuid,
    actor_agent_type_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY module_tasks.task_activity REPLICA IDENTITY FULL;

--
-- Name: task_collaborators; Type: TABLE; Schema: module_tasks; Owner: -
--

CREATE TABLE module_tasks.task_collaborators (
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL
);

--
-- Name: task_comments; Type: TABLE; Schema: module_tasks; Owner: -
--

CREATE TABLE module_tasks.task_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    task_id uuid NOT NULL,
    content text NOT NULL,
    created_by_user_id uuid,
    created_by_agent_type_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'note'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT task_comments_kind_check CHECK ((kind = ANY (ARRAY['note'::text, 'progress'::text, 'question'::text, 'result'::text, 'system'::text])))
);

ALTER TABLE ONLY module_tasks.task_comments REPLICA IDENTITY FULL;

--
-- Name: COLUMN task_comments.kind; Type: COMMENT; Schema: module_tasks; Owner: -
--

COMMENT ON COLUMN module_tasks.task_comments.kind IS 'What this comment IS: note (person) | progress (agent, mid-run) | question (agent asked, run stopped) | result (run outcome) | system (lifecycle notice). Replaces emoji-prefix typing.';

--
-- Name: COLUMN task_comments.metadata; Type: COMMENT; Schema: module_tasks; Owner: -
--

COMMENT ON COLUMN module_tasks.task_comments.metadata IS 'Kind-specific payload. For kind=question: answer_type + options, so the UI can render the right control instead of parsing the prose.';

--
-- Name: task_contexts; Type: TABLE; Schema: module_tasks; Owner: -
--

CREATE TABLE module_tasks.task_contexts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    task_id uuid NOT NULL,
    context_type text NOT NULL,
    context_id text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE ONLY module_tasks.task_contexts REPLICA IDENTITY FULL;

--
-- Name: task_identifier_sequences; Type: TABLE; Schema: module_tasks; Owner: -
--

CREATE TABLE module_tasks.task_identifier_sequences (
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    prefix text DEFAULT 'ENG'::text NOT NULL,
    last_value integer DEFAULT 0 NOT NULL
);

--
-- Name: task_runs; Type: TABLE; Schema: module_tasks; Owner: -
--

CREATE TABLE module_tasks.task_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    task_id uuid NOT NULL,
    agent_session_run_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    outcome text,
    CONSTRAINT task_runs_role_check CHECK ((role = ANY (ARRAY['checkout'::text, 'work'::text, 'review'::text])))
);

ALTER TABLE ONLY module_tasks.task_runs REPLICA IDENTITY FULL;

--
-- Name: tasks; Type: TABLE; Schema: module_tasks; Owner: -
--

CREATE TABLE module_tasks.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    identifier text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'todo'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    parent_id uuid,
    primary_assignee_kind text DEFAULT 'none'::text NOT NULL,
    primary_assignee_user_id uuid,
    primary_assignee_agent_type_key text,
    created_by_user_id uuid,
    created_by_agent_type_key text,
    due_date date,
    request_depth integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    checkout_run_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id uuid,
    blocked_by_task_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    pending_approval_operation_ids text[] DEFAULT '{}'::text[] NOT NULL,
    space_id uuid NOT NULL,
    CONSTRAINT tasks_primary_assignee_kind_check CHECK ((primary_assignee_kind = ANY (ARRAY['user'::text, 'agent'::text, 'none'::text]))),
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])))
);

ALTER TABLE ONLY module_tasks.tasks REPLICA IDENTITY FULL;

--
-- Name: task_activity task_activity_pkey; Type: CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_activity
    ADD CONSTRAINT task_activity_pkey PRIMARY KEY (id);

--
-- Name: task_collaborators task_collaborators_pkey; Type: CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_collaborators
    ADD CONSTRAINT task_collaborators_pkey PRIMARY KEY (task_id, user_id);

--
-- Name: task_comments task_comments_pkey; Type: CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_comments
    ADD CONSTRAINT task_comments_pkey PRIMARY KEY (id);

--
-- Name: task_contexts task_contexts_pkey; Type: CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_contexts
    ADD CONSTRAINT task_contexts_pkey PRIMARY KEY (id);

--
-- Name: task_contexts task_contexts_task_id_context_type_context_id_key; Type: CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_contexts
    ADD CONSTRAINT task_contexts_task_id_context_type_context_id_key UNIQUE (task_id, context_type, context_id);

--
-- Name: task_identifier_sequences task_identifier_sequences_pkey; Type: CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_identifier_sequences
    ADD CONSTRAINT task_identifier_sequences_pkey PRIMARY KEY (tenant_id, scope_id, prefix);

--
-- Name: task_runs task_runs_pkey; Type: CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_runs
    ADD CONSTRAINT task_runs_pkey PRIMARY KEY (id);

--
-- Name: tasks tasks_id_tenant_scope_key; Type: CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.tasks
    ADD CONSTRAINT tasks_id_tenant_scope_key UNIQUE (id, tenant_id, scope_id);

--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

--
-- Name: tasks tasks_tenant_id_scope_id_identifier_key; Type: CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.tasks
    ADD CONSTRAINT tasks_tenant_id_scope_id_identifier_key UNIQUE (tenant_id, scope_id, identifier);

--
-- Name: idx_module_tasks_collaborators_tenant_user; Type: INDEX; Schema: module_tasks; Owner: -
--

CREATE INDEX idx_module_tasks_collaborators_tenant_user ON module_tasks.task_collaborators USING btree (tenant_id, scope_id, user_id);

--
-- Name: idx_module_tasks_comments_kind; Type: INDEX; Schema: module_tasks; Owner: -
--

CREATE INDEX idx_module_tasks_comments_kind ON module_tasks.task_comments USING btree (task_id, kind, created_at DESC);

--
-- Name: idx_module_tasks_comments_task; Type: INDEX; Schema: module_tasks; Owner: -
--

CREATE INDEX idx_module_tasks_comments_task ON module_tasks.task_comments USING btree (task_id, created_at DESC);

--
-- Name: idx_module_tasks_contexts_lookup; Type: INDEX; Schema: module_tasks; Owner: -
--

CREATE INDEX idx_module_tasks_contexts_lookup ON module_tasks.task_contexts USING btree (tenant_id, scope_id, context_type, context_id);

--
-- Name: idx_module_tasks_task_activity_task; Type: INDEX; Schema: module_tasks; Owner: -
--

CREATE INDEX idx_module_tasks_task_activity_task ON module_tasks.task_activity USING btree (task_id, created_at DESC);

--
-- Name: idx_module_tasks_task_runs_task; Type: INDEX; Schema: module_tasks; Owner: -
--

CREATE INDEX idx_module_tasks_task_runs_task ON module_tasks.task_runs USING btree (task_id, created_at DESC);

--
-- Name: idx_module_tasks_tasks_blocked_by; Type: INDEX; Schema: module_tasks; Owner: -
--

CREATE INDEX idx_module_tasks_tasks_blocked_by ON module_tasks.tasks USING gin (blocked_by_task_ids);

--
-- Name: idx_module_tasks_tasks_project; Type: INDEX; Schema: module_tasks; Owner: -
--

CREATE INDEX idx_module_tasks_tasks_project ON module_tasks.tasks USING btree (project_id) WHERE (project_id IS NOT NULL);

--
-- Name: idx_module_tasks_tasks_scope; Type: INDEX; Schema: module_tasks; Owner: -
--

CREATE INDEX idx_module_tasks_tasks_scope ON module_tasks.tasks USING btree (tenant_id, scope_id, updated_at DESC);

--
-- Name: idx_module_tasks_tasks_space; Type: INDEX; Schema: module_tasks; Owner: -
--

CREATE INDEX idx_module_tasks_tasks_space ON module_tasks.tasks USING btree (tenant_id, space_id);

--
-- Name: uniq_module_tasks_task_runs_per_run; Type: INDEX; Schema: module_tasks; Owner: -
--

CREATE UNIQUE INDEX uniq_module_tasks_task_runs_per_run ON module_tasks.task_runs USING btree (tenant_id, scope_id, task_id, agent_session_run_id, role);

--
-- Name: task_activity task_activity_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_activity
    ADD CONSTRAINT task_activity_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: task_activity task_activity_task_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_activity
    ADD CONSTRAINT task_activity_task_id_fkey FOREIGN KEY (task_id) REFERENCES module_tasks.tasks(id) ON DELETE CASCADE;

--
-- Name: task_activity task_activity_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_activity
    ADD CONSTRAINT task_activity_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: task_collaborators task_collaborators_task_tenant_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_collaborators
    ADD CONSTRAINT task_collaborators_task_tenant_fkey FOREIGN KEY (task_id, tenant_id, scope_id) REFERENCES module_tasks.tasks(id, tenant_id, scope_id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: task_collaborators task_collaborators_user_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_collaborators
    ADD CONSTRAINT task_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE CASCADE;

--
-- Name: task_comments task_comments_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_comments
    ADD CONSTRAINT task_comments_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: task_comments task_comments_task_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_comments
    ADD CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES module_tasks.tasks(id) ON DELETE CASCADE;

--
-- Name: task_comments task_comments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_comments
    ADD CONSTRAINT task_comments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: task_contexts task_contexts_task_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_contexts
    ADD CONSTRAINT task_contexts_task_id_fkey FOREIGN KEY (task_id) REFERENCES module_tasks.tasks(id) ON DELETE CASCADE;

--
-- Name: task_contexts task_contexts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_contexts
    ADD CONSTRAINT task_contexts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: task_identifier_sequences task_identifier_sequences_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_identifier_sequences
    ADD CONSTRAINT task_identifier_sequences_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: task_runs task_runs_task_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_runs
    ADD CONSTRAINT task_runs_task_id_fkey FOREIGN KEY (task_id) REFERENCES module_tasks.tasks(id) ON DELETE CASCADE;

--
-- Name: task_runs task_runs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.task_runs
    ADD CONSTRAINT task_runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: tasks tasks_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.tasks
    ADD CONSTRAINT tasks_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: tasks tasks_parent_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.tasks
    ADD CONSTRAINT tasks_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES module_tasks.tasks(id) ON DELETE SET NULL;

--
-- Name: tasks tasks_primary_assignee_user_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.tasks
    ADD CONSTRAINT tasks_primary_assignee_user_id_fkey FOREIGN KEY (primary_assignee_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: tasks tasks_space_tenant_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.tasks
    ADD CONSTRAINT tasks_space_tenant_fkey FOREIGN KEY (space_id, tenant_id) REFERENCES core.spaces(id, tenant_id) ON DELETE CASCADE;

--
-- Name: tasks tasks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_tasks; Owner: -
--

ALTER TABLE ONLY module_tasks.tasks
    ADD CONSTRAINT tasks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: task_activity srv_tenant_isolation; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_tasks.task_activity TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: task_collaborators srv_tenant_isolation; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_tasks.task_collaborators TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: task_comments srv_tenant_isolation; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_tasks.task_comments TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: task_contexts srv_tenant_isolation; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_tasks.task_contexts TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: task_identifier_sequences srv_tenant_isolation; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_tasks.task_identifier_sequences TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: task_runs srv_tenant_isolation; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_tasks.task_runs TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: tasks srv_tenant_isolation; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_tasks.tasks TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: task_activity; Type: ROW SECURITY; Schema: module_tasks; Owner: -
--

ALTER TABLE module_tasks.task_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: task_collaborators; Type: ROW SECURITY; Schema: module_tasks; Owner: -
--

ALTER TABLE module_tasks.task_collaborators ENABLE ROW LEVEL SECURITY;

--
-- Name: task_comments; Type: ROW SECURITY; Schema: module_tasks; Owner: -
--

ALTER TABLE module_tasks.task_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: task_contexts; Type: ROW SECURITY; Schema: module_tasks; Owner: -
--

ALTER TABLE module_tasks.task_contexts ENABLE ROW LEVEL SECURITY;

--
-- Name: task_contexts task_contexts_read; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY task_contexts_read ON module_tasks.task_contexts FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: task_identifier_sequences; Type: ROW SECURITY; Schema: module_tasks; Owner: -
--

ALTER TABLE module_tasks.task_identifier_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: task_runs; Type: ROW SECURITY; Schema: module_tasks; Owner: -
--

ALTER TABLE module_tasks.task_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: module_tasks; Owner: -
--

ALTER TABLE module_tasks.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: task_collaborators tasks_collaborators; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY tasks_collaborators ON module_tasks.task_collaborators USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id))) WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: task_comments tasks_comments; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY tasks_comments ON module_tasks.task_comments USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id))) WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: task_contexts tasks_contexts; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY tasks_contexts ON module_tasks.task_contexts USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id))) WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: task_identifier_sequences tasks_identifier_sequences; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY tasks_identifier_sequences ON module_tasks.task_identifier_sequences USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id))) WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: task_activity tasks_task_activity; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY tasks_task_activity ON module_tasks.task_activity USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id))) WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: task_runs tasks_task_runs; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY tasks_task_runs ON module_tasks.task_runs USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id))) WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: tasks tasks_tasks_read; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY tasks_tasks_read ON module_tasks.tasks FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: tasks tasks_tasks_write; Type: POLICY; Schema: module_tasks; Owner: -
--

CREATE POLICY tasks_tasks_write ON module_tasks.tasks USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id))) WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: SCHEMA module_tasks; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_tasks TO service_role;
GRANT USAGE ON SCHEMA module_tasks TO authenticated;
GRANT USAGE ON SCHEMA module_tasks TO engenty_server;

--
-- Name: TABLE task_activity; Type: ACL; Schema: module_tasks; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.task_activity TO service_role;
GRANT SELECT ON TABLE module_tasks.task_activity TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.task_activity TO engenty_server;

--
-- Name: TABLE task_collaborators; Type: ACL; Schema: module_tasks; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.task_collaborators TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.task_collaborators TO engenty_server;

--
-- Name: TABLE task_comments; Type: ACL; Schema: module_tasks; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.task_comments TO service_role;
GRANT SELECT ON TABLE module_tasks.task_comments TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.task_comments TO engenty_server;

--
-- Name: TABLE task_contexts; Type: ACL; Schema: module_tasks; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.task_contexts TO service_role;
GRANT SELECT ON TABLE module_tasks.task_contexts TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.task_contexts TO engenty_server;

--
-- Name: TABLE task_identifier_sequences; Type: ACL; Schema: module_tasks; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.task_identifier_sequences TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.task_identifier_sequences TO engenty_server;

--
-- Name: TABLE task_runs; Type: ACL; Schema: module_tasks; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.task_runs TO service_role;
GRANT SELECT ON TABLE module_tasks.task_runs TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.task_runs TO engenty_server;

--
-- Name: TABLE tasks; Type: ACL; Schema: module_tasks; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.tasks TO service_role;
GRANT SELECT ON TABLE module_tasks.tasks TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_tasks.tasks TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: tasks; Type: TABLE DATA; Schema: module_tasks; Owner: postgres
--


--
-- Data for Name: task_activity; Type: TABLE DATA; Schema: module_tasks; Owner: postgres
--


--
-- Data for Name: task_collaborators; Type: TABLE DATA; Schema: module_tasks; Owner: postgres
--


--
-- Data for Name: task_comments; Type: TABLE DATA; Schema: module_tasks; Owner: postgres
--


--
-- Data for Name: task_contexts; Type: TABLE DATA; Schema: module_tasks; Owner: postgres
--


--
-- Data for Name: task_identifier_sequences; Type: TABLE DATA; Schema: module_tasks; Owner: postgres
--


--
-- Data for Name: task_runs; Type: TABLE DATA; Schema: module_tasks; Owner: postgres
--


--
--

RESET check_function_bodies;
