-- inbox: consolidated baseline.
-- Replaces 10 migration(s) (20260705090000..20260829140000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_inbox; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_inbox;

--
-- Name: list_threads(uuid, text, uuid, integer, integer, uuid, text, text, uuid[], uuid[]); Type: FUNCTION; Schema: module_inbox; Owner: -
--

CREATE FUNCTION module_inbox.list_threads(p_tenant_id uuid, p_scope_id text, p_connection_id uuid, p_limit integer, p_offset integer, p_user_id uuid, p_status text, p_category text DEFAULT NULL::text, p_granted_connection_ids uuid[] DEFAULT NULL::uuid[], p_space_connection_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'module_inbox', 'public'
    AS $$
begin
  return (
    with visible_threads as (
      select t.*
      from module_inbox.threads t
      where t.tenant_id = p_tenant_id
        and t.scope_id = p_scope_id
        and (
          t.owner_user_id is null
          or p_user_id is null
          or t.owner_user_id = p_user_id
          or (p_granted_connection_ids is not null
              and t.connection_id = any(p_granted_connection_ids))
        )
        -- The space narrowing is an AND, never an arm of the visibility OR: a
        -- granted mailbox that this space did not place is still not this
        -- space's mail.
        and (p_space_connection_ids is null
             or t.connection_id = any(p_space_connection_ids))
        and (p_connection_id is null or t.connection_id = p_connection_id)
    ),
    latest as (
      select distinct on (m.thread_id)
        m.thread_id,
        m.from_email as latest_from_email,
        m.from_name as latest_from_name,
        m.snippet as latest_snippet,
        m.status as latest_status,
        m.ai_category as latest_category
      from module_inbox.messages m
      join visible_threads vt on vt.id = m.thread_id
      order by m.thread_id, m.received_at desc nulls last, m.id desc
    ),
    unhandled as (
      select m.thread_id, count(*)::int as unhandled_count
      from module_inbox.messages m
      join visible_threads vt on vt.id = m.thread_id
      where m.status in ('new', 'triaged')
      group by m.thread_id
    ),
    filtered as (
      select vt.*, l.latest_from_email, l.latest_from_name, l.latest_snippet,
        l.latest_status, l.latest_category, coalesce(u.unhandled_count, 0) as unhandled_count
      from visible_threads vt
      left join latest l on l.thread_id = vt.id
      left join unhandled u on u.thread_id = vt.id
      where (p_status is null or exists (
        select 1 from module_inbox.messages m
        where m.thread_id = vt.id and m.status = p_status
      ))
      and (p_category is null or l.latest_category = p_category)
    ),
    ordered as (
      select *, row_number() over (
        order by last_message_at desc nulls last, id asc
      ) as rn
      from filtered
    )
    select jsonb_build_object(
      'total', (select count(*)::bigint from filtered),
      'threads', coalesce(
        (
          select jsonb_agg(to_jsonb(ordered) - 'rn' order by rn)
          from ordered
          where rn > p_offset and rn <= p_offset + p_limit
        ),
        '[]'::jsonb
      )
    )
  );
end;
$$;

--
-- Name: message_digests; Type: TABLE; Schema: module_inbox; Owner: -
--

CREATE TABLE module_inbox.message_digests (
    message_id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    thread_id text NOT NULL,
    owner_user_id uuid,
    digest_version integer DEFAULT 1 NOT NULL,
    model_id text,
    content_md text NOT NULL,
    attachments_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category text DEFAULT 'conversation'::text NOT NULL
);

--
-- Name: message_routes; Type: TABLE; Schema: module_inbox; Owner: -
--

CREATE TABLE module_inbox.message_routes (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    message_id text NOT NULL,
    consumer text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_routes_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processed'::text, 'skipped'::text, 'failed'::text])))
);

--
-- Name: messages; Type: TABLE; Schema: module_inbox; Owner: -
--

CREATE TABLE module_inbox.messages (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    thread_id text NOT NULL,
    connection_id uuid NOT NULL,
    owner_user_id uuid,
    provider_message_id text NOT NULL,
    provider_thread_id text,
    from_email text,
    from_name text,
    to_emails text[] DEFAULT '{}'::text[] NOT NULL,
    cc_emails text[] DEFAULT '{}'::text[] NOT NULL,
    subject text,
    snippet text,
    body_text text,
    body_html text,
    has_attachments boolean DEFAULT false NOT NULL,
    attachments_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    received_at timestamp with time zone,
    status text DEFAULT 'new'::text NOT NULL,
    status_set_by text,
    classification text,
    classification_reason text,
    user_classification text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_category text,
    CONSTRAINT messages_status_check CHECK ((status = ANY (ARRAY['new'::text, 'read'::text, 'archived'::text])))
);

ALTER TABLE ONLY module_inbox.messages REPLICA IDENTITY FULL;

--
-- Name: sync_state; Type: TABLE; Schema: module_inbox; Owner: -
--

CREATE TABLE module_inbox.sync_state (
    connection_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    owner_user_id uuid,
    sync_enabled boolean DEFAULT true NOT NULL,
    backfill_days integer DEFAULT 90 NOT NULL,
    cursor text,
    last_synced_at timestamp with time zone,
    last_error text,
    last_error_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: thread_digests; Type: TABLE; Schema: module_inbox; Owner: -
--

CREATE TABLE module_inbox.thread_digests (
    thread_id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    owner_user_id uuid,
    digest_version integer DEFAULT 1 NOT NULL,
    model_id text,
    summary_md text NOT NULL,
    participants_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    summarized_message_count integer DEFAULT 0 NOT NULL,
    last_message_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category text DEFAULT 'conversation'::text NOT NULL,
    suggested_actions jsonb DEFAULT '[]'::jsonb NOT NULL
);

--
-- Name: threads; Type: TABLE; Schema: module_inbox; Owner: -
--

CREATE TABLE module_inbox.threads (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    connection_id uuid NOT NULL,
    owner_user_id uuid,
    provider_thread_id text,
    subject text,
    participants text[] DEFAULT '{}'::text[] NOT NULL,
    message_count integer DEFAULT 0 NOT NULL,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY module_inbox.threads REPLICA IDENTITY FULL;

--
-- Name: message_digests message_digests_pkey; Type: CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.message_digests
    ADD CONSTRAINT message_digests_pkey PRIMARY KEY (message_id);

--
-- Name: message_routes message_routes_message_id_consumer_key; Type: CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.message_routes
    ADD CONSTRAINT message_routes_message_id_consumer_key UNIQUE (message_id, consumer);

--
-- Name: message_routes message_routes_pkey; Type: CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.message_routes
    ADD CONSTRAINT message_routes_pkey PRIMARY KEY (id);

--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

--
-- Name: sync_state sync_state_pkey; Type: CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.sync_state
    ADD CONSTRAINT sync_state_pkey PRIMARY KEY (connection_id);

--
-- Name: thread_digests thread_digests_pkey; Type: CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.thread_digests
    ADD CONSTRAINT thread_digests_pkey PRIMARY KEY (thread_id);

--
-- Name: threads threads_pkey; Type: CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.threads
    ADD CONSTRAINT threads_pkey PRIMARY KEY (id);

--
-- Name: idx_module_inbox_message_digests_thread; Type: INDEX; Schema: module_inbox; Owner: -
--

CREATE INDEX idx_module_inbox_message_digests_thread ON module_inbox.message_digests USING btree (thread_id);

--
-- Name: idx_module_inbox_message_routes_consumer; Type: INDEX; Schema: module_inbox; Owner: -
--

CREATE INDEX idx_module_inbox_message_routes_consumer ON module_inbox.message_routes USING btree (tenant_id, consumer, status);

--
-- Name: idx_module_inbox_messages_ai_category; Type: INDEX; Schema: module_inbox; Owner: -
--

CREATE INDEX idx_module_inbox_messages_ai_category ON module_inbox.messages USING btree (tenant_id, scope_id, ai_category);

--
-- Name: idx_module_inbox_messages_fts; Type: INDEX; Schema: module_inbox; Owner: -
--

CREATE INDEX idx_module_inbox_messages_fts ON module_inbox.messages USING gin ((((setweight(to_tsvector('simple'::regconfig, COALESCE(subject, ''::text)), 'A'::"char") || setweight(to_tsvector('simple'::regconfig, ((COALESCE(from_email, ''::text) || ' '::text) || COALESCE(from_name, ''::text))), 'B'::"char")) || setweight(to_tsvector('simple'::regconfig, COALESCE(body_text, ''::text)), 'D'::"char"))));

--
-- Name: idx_module_inbox_messages_list; Type: INDEX; Schema: module_inbox; Owner: -
--

CREATE INDEX idx_module_inbox_messages_list ON module_inbox.messages USING btree (tenant_id, scope_id, status, received_at DESC);

--
-- Name: idx_module_inbox_messages_thread; Type: INDEX; Schema: module_inbox; Owner: -
--

CREATE INDEX idx_module_inbox_messages_thread ON module_inbox.messages USING btree (thread_id, received_at);

--
-- Name: idx_module_inbox_sync_state_tenant; Type: INDEX; Schema: module_inbox; Owner: -
--

CREATE INDEX idx_module_inbox_sync_state_tenant ON module_inbox.sync_state USING btree (tenant_id);

--
-- Name: idx_module_inbox_thread_digests_category; Type: INDEX; Schema: module_inbox; Owner: -
--

CREATE INDEX idx_module_inbox_thread_digests_category ON module_inbox.thread_digests USING btree (tenant_id, scope_id, category);

--
-- Name: idx_module_inbox_threads_connection; Type: INDEX; Schema: module_inbox; Owner: -
--

CREATE INDEX idx_module_inbox_threads_connection ON module_inbox.threads USING btree (connection_id);

--
-- Name: idx_module_inbox_threads_list; Type: INDEX; Schema: module_inbox; Owner: -
--

CREATE INDEX idx_module_inbox_threads_list ON module_inbox.threads USING btree (tenant_id, scope_id, last_message_at DESC);

--
-- Name: uq_module_inbox_messages_provider; Type: INDEX; Schema: module_inbox; Owner: -
--

CREATE UNIQUE INDEX uq_module_inbox_messages_provider ON module_inbox.messages USING btree (connection_id, provider_message_id);

--
-- Name: uq_module_inbox_threads_provider; Type: INDEX; Schema: module_inbox; Owner: -
--

CREATE UNIQUE INDEX uq_module_inbox_threads_provider ON module_inbox.threads USING btree (tenant_id, connection_id, provider_thread_id) WHERE (provider_thread_id IS NOT NULL);

--
-- Name: message_digests message_digests_message_id_fkey; Type: FK CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.message_digests
    ADD CONSTRAINT message_digests_message_id_fkey FOREIGN KEY (message_id) REFERENCES module_inbox.messages(id) ON DELETE CASCADE;

--
-- Name: message_digests message_digests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.message_digests
    ADD CONSTRAINT message_digests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: message_digests message_digests_thread_id_fkey; Type: FK CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.message_digests
    ADD CONSTRAINT message_digests_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES module_inbox.threads(id) ON DELETE CASCADE;

--
-- Name: message_routes message_routes_message_id_fkey; Type: FK CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.message_routes
    ADD CONSTRAINT message_routes_message_id_fkey FOREIGN KEY (message_id) REFERENCES module_inbox.messages(id) ON DELETE CASCADE;

--
-- Name: message_routes message_routes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.message_routes
    ADD CONSTRAINT message_routes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: messages messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.messages
    ADD CONSTRAINT messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: messages messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.messages
    ADD CONSTRAINT messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES module_inbox.threads(id) ON DELETE CASCADE;

--
-- Name: sync_state sync_state_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.sync_state
    ADD CONSTRAINT sync_state_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: thread_digests thread_digests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.thread_digests
    ADD CONSTRAINT thread_digests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: thread_digests thread_digests_thread_id_fkey; Type: FK CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.thread_digests
    ADD CONSTRAINT thread_digests_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES module_inbox.threads(id) ON DELETE CASCADE;

--
-- Name: threads threads_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_inbox; Owner: -
--

ALTER TABLE ONLY module_inbox.threads
    ADD CONSTRAINT threads_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: message_digests; Type: ROW SECURITY; Schema: module_inbox; Owner: -
--

ALTER TABLE module_inbox.message_digests ENABLE ROW LEVEL SECURITY;

--
-- Name: message_digests message_digests_read_visible; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY message_digests_read_visible ON module_inbox.message_digests FOR SELECT TO authenticated USING (((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)) AND core.has_scope(scope_id) AND ((owner_user_id IS NULL) OR (owner_user_id = ( SELECT core.current_user_id() AS current_user_id)))));

--
-- Name: message_routes; Type: ROW SECURITY; Schema: module_inbox; Owner: -
--

ALTER TABLE module_inbox.message_routes ENABLE ROW LEVEL SECURITY;

--
-- Name: message_routes message_routes_read_visible; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY message_routes_read_visible ON module_inbox.message_routes FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: messages; Type: ROW SECURITY; Schema: module_inbox; Owner: -
--

ALTER TABLE module_inbox.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_read_visible; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY messages_read_visible ON module_inbox.messages FOR SELECT TO authenticated USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id) AND ((owner_user_id IS NULL) OR (owner_user_id = core.current_user_id()))));

--
-- Name: messages messages_update_visible; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY messages_update_visible ON module_inbox.messages FOR UPDATE TO authenticated USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id) AND ((owner_user_id IS NULL) OR (owner_user_id = core.current_user_id()))));

--
-- Name: message_digests srv_tenant_isolation; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_inbox.message_digests TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: message_routes srv_tenant_isolation; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_inbox.message_routes TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: messages srv_tenant_isolation; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_inbox.messages TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: sync_state srv_tenant_isolation; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_inbox.sync_state TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: thread_digests srv_tenant_isolation; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_inbox.thread_digests TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: threads srv_tenant_isolation; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_inbox.threads TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: sync_state; Type: ROW SECURITY; Schema: module_inbox; Owner: -
--

ALTER TABLE module_inbox.sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_state sync_state_read_visible; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY sync_state_read_visible ON module_inbox.sync_state FOR SELECT TO authenticated USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id) AND ((owner_user_id IS NULL) OR (owner_user_id = core.current_user_id()))));

--
-- Name: thread_digests; Type: ROW SECURITY; Schema: module_inbox; Owner: -
--

ALTER TABLE module_inbox.thread_digests ENABLE ROW LEVEL SECURITY;

--
-- Name: thread_digests thread_digests_read_visible; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY thread_digests_read_visible ON module_inbox.thread_digests FOR SELECT TO authenticated USING (((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)) AND core.has_scope(scope_id) AND ((owner_user_id IS NULL) OR (owner_user_id = ( SELECT core.current_user_id() AS current_user_id)))));

--
-- Name: threads; Type: ROW SECURITY; Schema: module_inbox; Owner: -
--

ALTER TABLE module_inbox.threads ENABLE ROW LEVEL SECURITY;

--
-- Name: threads threads_read_visible; Type: POLICY; Schema: module_inbox; Owner: -
--

CREATE POLICY threads_read_visible ON module_inbox.threads FOR SELECT TO authenticated USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id) AND ((owner_user_id IS NULL) OR (owner_user_id = core.current_user_id()))));

--
-- Name: SCHEMA module_inbox; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_inbox TO service_role;
GRANT USAGE ON SCHEMA module_inbox TO authenticated;
GRANT USAGE ON SCHEMA module_inbox TO engenty_server;

--
-- Name: FUNCTION list_threads(p_tenant_id uuid, p_scope_id text, p_connection_id uuid, p_limit integer, p_offset integer, p_user_id uuid, p_status text, p_category text, p_granted_connection_ids uuid[], p_space_connection_ids uuid[]); Type: ACL; Schema: module_inbox; Owner: -
--

GRANT ALL ON FUNCTION module_inbox.list_threads(p_tenant_id uuid, p_scope_id text, p_connection_id uuid, p_limit integer, p_offset integer, p_user_id uuid, p_status text, p_category text, p_granted_connection_ids uuid[], p_space_connection_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION module_inbox.list_threads(p_tenant_id uuid, p_scope_id text, p_connection_id uuid, p_limit integer, p_offset integer, p_user_id uuid, p_status text, p_category text, p_granted_connection_ids uuid[], p_space_connection_ids uuid[]) TO engenty_server;

--
-- Name: TABLE message_digests; Type: ACL; Schema: module_inbox; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_inbox.message_digests TO service_role;
GRANT SELECT ON TABLE module_inbox.message_digests TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_inbox.message_digests TO engenty_server;

--
-- Name: TABLE message_routes; Type: ACL; Schema: module_inbox; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_inbox.message_routes TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_inbox.message_routes TO engenty_server;

--
-- Name: TABLE messages; Type: ACL; Schema: module_inbox; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_inbox.messages TO service_role;
GRANT SELECT ON TABLE module_inbox.messages TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_inbox.messages TO engenty_server;

--
-- Name: TABLE sync_state; Type: ACL; Schema: module_inbox; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_inbox.sync_state TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_inbox.sync_state TO engenty_server;

--
-- Name: TABLE thread_digests; Type: ACL; Schema: module_inbox; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_inbox.thread_digests TO service_role;
GRANT SELECT ON TABLE module_inbox.thread_digests TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_inbox.thread_digests TO engenty_server;

--
-- Name: TABLE threads; Type: ACL; Schema: module_inbox; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_inbox.threads TO service_role;
GRANT SELECT ON TABLE module_inbox.threads TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_inbox.threads TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: threads; Type: TABLE DATA; Schema: module_inbox; Owner: postgres
--


--
-- Data for Name: messages; Type: TABLE DATA; Schema: module_inbox; Owner: postgres
--


--
-- Data for Name: message_digests; Type: TABLE DATA; Schema: module_inbox; Owner: postgres
--


--
-- Data for Name: message_routes; Type: TABLE DATA; Schema: module_inbox; Owner: postgres
--


--
-- Data for Name: sync_state; Type: TABLE DATA; Schema: module_inbox; Owner: postgres
--


--
-- Data for Name: thread_digests; Type: TABLE DATA; Schema: module_inbox; Owner: postgres
--


--
--

RESET check_function_bodies;
