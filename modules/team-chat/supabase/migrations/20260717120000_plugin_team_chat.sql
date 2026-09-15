-- team_chat: consolidated baseline.
-- Replaces 3 migration(s) (20260717120000..20260719170000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
SET check_function_bodies = false;

--
-- Name: module_team_chat; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA module_team_chat;

--
-- Name: is_conversation_visible(uuid); Type: FUNCTION; Schema: module_team_chat; Owner: -
--

CREATE FUNCTION module_team_chat.is_conversation_visible(conv uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from module_team_chat.conversations c
    where c.id = conv
      and c.tenant_id = core.current_tenant_id()
      and (
        c.type = 'public_channel'
        or exists (
          select 1 from module_team_chat.conversation_members m
          where m.conversation_id = conv
            and m.principal_type = 'user'
            and m.principal_id = auth.uid()::text
        )
      )
  );
$$;

--
-- Name: list_my_conversations(uuid, text, uuid, boolean, boolean); Type: FUNCTION; Schema: module_team_chat; Owner: -
--

CREATE FUNCTION module_team_chat.list_my_conversations(p_tenant_id uuid, p_scope_id text, p_user_id uuid, p_include_public boolean DEFAULT false, p_include_archived boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select coalesce(jsonb_agg(row order by (row->>'updated_at') desc), '[]'::jsonb)
  from (
    select to_jsonb(c) - 'external'
      || jsonb_build_object(
        'is_member', m.id is not null,
        'member_role', m.role,
        'last_read_ts', m.last_read_ts,
        'muted', coalesce(m.muted, false),
        'unread_count', case when m.id is null then 0 else (
          select count(*) from module_team_chat.messages msg
          where msg.conversation_id = c.id
            and msg.deleted_at is null
            and msg.thread_ts is null
            and (m.last_read_ts is null or msg.ts::numeric > m.last_read_ts::numeric)
            and (msg.user_id is distinct from p_user_id)
        ) end,
        'mention_count', case when m.id is null then 0 else (
          select count(*) from module_team_chat.mentions men
          where men.conversation_id = c.id
            and men.kind = 'user' and men.target_id = p_user_id::text
            and (m.last_read_ts is null or men.message_ts::numeric > m.last_read_ts::numeric)
        ) end,
        'members', case when c.type in ('im', 'mpim') then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'principal_type', cm.principal_type, 'principal_id', cm.principal_id
          )), '[]'::jsonb)
          from module_team_chat.conversation_members cm
          where cm.conversation_id = c.id
        ) else '[]'::jsonb end,
        'last_message', (
          select jsonb_build_object('ts', lm.ts, 'text', left(lm.text, 140),
            'user_id', lm.user_id, 'agent_type_key', lm.agent_type_key, 'subtype', lm.subtype)
          from module_team_chat.messages lm
          where lm.conversation_id = c.id and lm.deleted_at is null and lm.thread_ts is null
          order by lm.ts desc limit 1
        )
      ) as row
    from module_team_chat.conversations c
    left join module_team_chat.conversation_members m
      on m.conversation_id = c.id
      and m.principal_type = 'user'
      and m.principal_id = p_user_id::text
    where c.tenant_id = p_tenant_id
      and c.scope_id = p_scope_id
      and (p_include_archived or c.is_archived = false)
      and (
        m.id is not null
        or (p_include_public and c.type = 'public_channel')
      )
  ) rows(row);
$$;

--
-- Name: messages; Type: TABLE; Schema: module_team_chat; Owner: -
--

CREATE TABLE module_team_chat.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    ts text NOT NULL,
    thread_ts text,
    user_id uuid,
    agent_type_key text,
    bot_id text,
    text text DEFAULT ''::text NOT NULL,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    files jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtype text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    edited jsonb,
    reply_count integer DEFAULT 0 NOT NULL,
    latest_reply text,
    reply_users jsonb DEFAULT '[]'::jsonb NOT NULL,
    deleted_at timestamp with time zone,
    external jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_module_team_chat_msg_author CHECK (((user_id IS NOT NULL) OR (agent_type_key IS NOT NULL) OR (bot_id IS NOT NULL) OR (subtype IS NOT NULL)))
);

ALTER TABLE ONLY module_team_chat.messages REPLICA IDENTITY FULL;

--
-- Name: post_message(uuid, uuid, text, uuid, text, text, text, jsonb, jsonb, text, jsonb, jsonb); Type: FUNCTION; Schema: module_team_chat; Owner: -
--

CREATE FUNCTION module_team_chat.post_message(p_tenant_id uuid, p_conversation_id uuid, p_thread_ts text, p_user_id uuid, p_agent_type_key text, p_bot_id text, p_text text, p_blocks jsonb, p_files jsonb, p_subtype text, p_metadata jsonb, p_mentions jsonb) RETURNS module_team_chat.messages
    LANGUAGE plpgsql
    AS $$
declare
  v_now timestamptz := clock_timestamp();
  v_seconds bigint := floor(extract(epoch from v_now))::bigint;
  v_suffix integer := (extract(microseconds from v_now)::integer % 1000000);
  v_ts text;
  v_row module_team_chat.messages;
  v_parent module_team_chat.messages;
  v_author text := coalesce(p_user_id::text, p_agent_type_key, p_bot_id);
  v_mention jsonb;
begin
  if p_thread_ts is not null then
    select * into v_parent
      from module_team_chat.messages
      where conversation_id = p_conversation_id
        and ts = p_thread_ts
        and thread_ts is null
        and deleted_at is null
      for update;
    if not found then
      raise exception 'thread_not_found';
    end if;
  end if;

  for i in 0..999 loop
    v_ts := v_seconds::text || '.' || lpad(((v_suffix + i) % 1000000)::text, 6, '0');
    begin
      insert into module_team_chat.messages (
        tenant_id, conversation_id, ts, thread_ts,
        user_id, agent_type_key, bot_id,
        text, blocks, files, subtype, metadata
      ) values (
        p_tenant_id, p_conversation_id, v_ts, p_thread_ts,
        p_user_id, p_agent_type_key, p_bot_id,
        coalesce(p_text, ''), coalesce(p_blocks, '[]'::jsonb),
        coalesce(p_files, '[]'::jsonb), p_subtype, coalesce(p_metadata, '{}'::jsonb)
      ) returning * into v_row;
      exit;
    exception when unique_violation then
      if i = 999 then
        raise exception 'ts_exhausted';
      end if;
    end;
  end loop;

  if p_thread_ts is not null then
    update module_team_chat.messages
      set reply_count = reply_count + 1,
          latest_reply = v_row.ts,
          reply_users = case
            when v_author is null or reply_users ? v_author then reply_users
            else reply_users || to_jsonb(v_author)
          end,
          updated_at = now()
      where conversation_id = p_conversation_id and ts = p_thread_ts;
  end if;

  if p_mentions is not null then
    for v_mention in select * from jsonb_array_elements(p_mentions) loop
      insert into module_team_chat.mentions (
        tenant_id, conversation_id, message_ts, kind, target_id
      ) values (
        p_tenant_id, p_conversation_id, v_row.ts,
        v_mention->>'kind', v_mention->>'target_id'
      );
    end loop;
  end if;

  update module_team_chat.conversations
    set updated_at = now()
    where id = p_conversation_id;

  return v_row;
end;
$$;

--
-- Name: soft_delete_message(uuid, text); Type: FUNCTION; Schema: module_team_chat; Owner: -
--

CREATE FUNCTION module_team_chat.soft_delete_message(p_conversation_id uuid, p_ts text) RETURNS module_team_chat.messages
    LANGUAGE plpgsql
    AS $$
declare
  v_row module_team_chat.messages;
begin
  update module_team_chat.messages
    set deleted_at = now(), updated_at = now()
    where conversation_id = p_conversation_id and ts = p_ts and deleted_at is null
    returning * into v_row;
  if not found then
    raise exception 'message_not_found';
  end if;

  if v_row.thread_ts is not null then
    update module_team_chat.messages
      set reply_count = greatest(reply_count - 1, 0), updated_at = now()
      where conversation_id = p_conversation_id and ts = v_row.thread_ts;
  end if;

  delete from module_team_chat.mentions
    where conversation_id = p_conversation_id and message_ts = p_ts;

  return v_row;
end;
$$;

--
-- Name: agent_thread_links; Type: TABLE; Schema: module_team_chat; Owner: -
--

CREATE TABLE module_team_chat.agent_thread_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    thread_ts text NOT NULL,
    agent_type_key text NOT NULL,
    ai_thread_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: conversation_members; Type: TABLE; Schema: module_team_chat; Owner: -
--

CREATE TABLE module_team_chat.conversation_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    principal_type text NOT NULL,
    principal_id text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    last_read_ts text,
    muted boolean DEFAULT false NOT NULL,
    notify_prefs jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversation_members_principal_type_check CHECK ((principal_type = ANY (ARRAY['user'::text, 'agent'::text]))),
    CONSTRAINT conversation_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text])))
);

ALTER TABLE ONLY module_team_chat.conversation_members REPLICA IDENTITY FULL;

--
-- Name: conversations; Type: TABLE; Schema: module_team_chat; Owner: -
--

CREATE TABLE module_team_chat.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    scope_id text DEFAULT 'default'::text NOT NULL,
    type text NOT NULL,
    name text,
    topic text,
    purpose text,
    is_archived boolean DEFAULT false NOT NULL,
    created_by uuid,
    member_hash text,
    project_id uuid,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    external jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_module_team_chat_conv_name CHECK ((((type = ANY (ARRAY['im'::text, 'mpim'::text])) AND (name IS NULL)) OR ((type = ANY (ARRAY['public_channel'::text, 'private_channel'::text])) AND (name IS NOT NULL)))),
    CONSTRAINT conversations_type_check CHECK ((type = ANY (ARRAY['public_channel'::text, 'private_channel'::text, 'im'::text, 'mpim'::text])))
);

ALTER TABLE ONLY module_team_chat.conversations REPLICA IDENTITY FULL;

--
-- Name: mentions; Type: TABLE; Schema: module_team_chat; Owner: -
--

CREATE TABLE module_team_chat.mentions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    message_ts text NOT NULL,
    kind text NOT NULL,
    target_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_module_team_chat_mention_target CHECK ((((kind = ANY (ARRAY['user'::text, 'agent'::text])) AND (target_id IS NOT NULL)) OR (kind = ANY (ARRAY['here'::text, 'channel'::text])))),
    CONSTRAINT mentions_kind_check CHECK ((kind = ANY (ARRAY['user'::text, 'agent'::text, 'here'::text, 'channel'::text])))
);

--
-- Name: pins; Type: TABLE; Schema: module_team_chat; Owner: -
--

CREATE TABLE module_team_chat.pins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    message_ts text NOT NULL,
    pinned_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: reactions; Type: TABLE; Schema: module_team_chat; Owner: -
--

CREATE TABLE module_team_chat.reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    message_ts text NOT NULL,
    emoji text NOT NULL,
    principal_type text NOT NULL,
    principal_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reactions_principal_type_check CHECK ((principal_type = ANY (ARRAY['user'::text, 'agent'::text])))
);

ALTER TABLE ONLY module_team_chat.reactions REPLICA IDENTITY FULL;

--
-- Name: agent_thread_links agent_thread_links_pkey; Type: CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.agent_thread_links
    ADD CONSTRAINT agent_thread_links_pkey PRIMARY KEY (id);

--
-- Name: conversation_members conversation_members_pkey; Type: CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.conversation_members
    ADD CONSTRAINT conversation_members_pkey PRIMARY KEY (id);

--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

--
-- Name: mentions mentions_pkey; Type: CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.mentions
    ADD CONSTRAINT mentions_pkey PRIMARY KEY (id);

--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

--
-- Name: pins pins_pkey; Type: CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.pins
    ADD CONSTRAINT pins_pkey PRIMARY KEY (id);

--
-- Name: reactions reactions_pkey; Type: CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.reactions
    ADD CONSTRAINT reactions_pkey PRIMARY KEY (id);

--
-- Name: idx_module_team_chat_conv_project; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE INDEX idx_module_team_chat_conv_project ON module_team_chat.conversations USING btree (tenant_id, project_id) WHERE (project_id IS NOT NULL);

--
-- Name: idx_module_team_chat_conv_tenant; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE INDEX idx_module_team_chat_conv_tenant ON module_team_chat.conversations USING btree (tenant_id, scope_id, updated_at DESC);

--
-- Name: idx_module_team_chat_members_principal; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE INDEX idx_module_team_chat_members_principal ON module_team_chat.conversation_members USING btree (tenant_id, principal_type, principal_id);

--
-- Name: idx_module_team_chat_mentions_msg; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE INDEX idx_module_team_chat_mentions_msg ON module_team_chat.mentions USING btree (conversation_id, message_ts);

--
-- Name: idx_module_team_chat_mentions_target; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE INDEX idx_module_team_chat_mentions_target ON module_team_chat.mentions USING btree (tenant_id, kind, target_id, created_at DESC);

--
-- Name: idx_module_team_chat_messages_history; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE INDEX idx_module_team_chat_messages_history ON module_team_chat.messages USING btree (conversation_id, ts DESC) WHERE (thread_ts IS NULL);

--
-- Name: idx_module_team_chat_messages_search; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE INDEX idx_module_team_chat_messages_search ON module_team_chat.messages USING gin (to_tsvector('simple'::regconfig, COALESCE(text, ''::text)));

--
-- Name: idx_module_team_chat_messages_thread; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE INDEX idx_module_team_chat_messages_thread ON module_team_chat.messages USING btree (conversation_id, thread_ts, ts) WHERE (thread_ts IS NOT NULL);

--
-- Name: idx_module_team_chat_reactions_msg; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE INDEX idx_module_team_chat_reactions_msg ON module_team_chat.reactions USING btree (conversation_id, message_ts);

--
-- Name: uq_module_team_chat_agent_thread_links; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE UNIQUE INDEX uq_module_team_chat_agent_thread_links ON module_team_chat.agent_thread_links USING btree (conversation_id, thread_ts, agent_type_key);

--
-- Name: uq_module_team_chat_conv_member_hash; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE UNIQUE INDEX uq_module_team_chat_conv_member_hash ON module_team_chat.conversations USING btree (tenant_id, member_hash) WHERE (type = ANY (ARRAY['im'::text, 'mpim'::text]));

--
-- Name: uq_module_team_chat_conv_name; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE UNIQUE INDEX uq_module_team_chat_conv_name ON module_team_chat.conversations USING btree (tenant_id, lower(name)) WHERE ((type = ANY (ARRAY['public_channel'::text, 'private_channel'::text])) AND (is_archived = false));

--
-- Name: uq_module_team_chat_member; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE UNIQUE INDEX uq_module_team_chat_member ON module_team_chat.conversation_members USING btree (conversation_id, principal_type, principal_id);

--
-- Name: uq_module_team_chat_messages_ts; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE UNIQUE INDEX uq_module_team_chat_messages_ts ON module_team_chat.messages USING btree (conversation_id, ts);

--
-- Name: uq_module_team_chat_pins; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE UNIQUE INDEX uq_module_team_chat_pins ON module_team_chat.pins USING btree (conversation_id, message_ts);

--
-- Name: uq_module_team_chat_reactions; Type: INDEX; Schema: module_team_chat; Owner: -
--

CREATE UNIQUE INDEX uq_module_team_chat_reactions ON module_team_chat.reactions USING btree (conversation_id, message_ts, emoji, principal_type, principal_id);

--
-- Name: agent_thread_links agent_thread_links_conversation_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.agent_thread_links
    ADD CONSTRAINT agent_thread_links_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES module_team_chat.conversations(id) ON DELETE CASCADE;

--
-- Name: agent_thread_links agent_thread_links_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.agent_thread_links
    ADD CONSTRAINT agent_thread_links_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: conversation_members conversation_members_conversation_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.conversation_members
    ADD CONSTRAINT conversation_members_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES module_team_chat.conversations(id) ON DELETE CASCADE;

--
-- Name: conversation_members conversation_members_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.conversation_members
    ADD CONSTRAINT conversation_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: conversations conversations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.conversations
    ADD CONSTRAINT conversations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: mentions mentions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.mentions
    ADD CONSTRAINT mentions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES module_team_chat.conversations(id) ON DELETE CASCADE;

--
-- Name: mentions mentions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.mentions
    ADD CONSTRAINT mentions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES module_team_chat.conversations(id) ON DELETE CASCADE;

--
-- Name: messages messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.messages
    ADD CONSTRAINT messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: pins pins_conversation_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.pins
    ADD CONSTRAINT pins_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES module_team_chat.conversations(id) ON DELETE CASCADE;

--
-- Name: pins pins_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.pins
    ADD CONSTRAINT pins_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: reactions reactions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.reactions
    ADD CONSTRAINT reactions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES module_team_chat.conversations(id) ON DELETE CASCADE;

--
-- Name: reactions reactions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: module_team_chat; Owner: -
--

ALTER TABLE ONLY module_team_chat.reactions
    ADD CONSTRAINT reactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: agent_thread_links; Type: ROW SECURITY; Schema: module_team_chat; Owner: -
--

ALTER TABLE module_team_chat.agent_thread_links ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_members; Type: ROW SECURITY; Schema: module_team_chat; Owner: -
--

ALTER TABLE module_team_chat.conversation_members ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: module_team_chat; Owner: -
--

ALTER TABLE module_team_chat.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: mentions; Type: ROW SECURITY; Schema: module_team_chat; Owner: -
--

ALTER TABLE module_team_chat.mentions ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: module_team_chat; Owner: -
--

ALTER TABLE module_team_chat.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: pins; Type: ROW SECURITY; Schema: module_team_chat; Owner: -
--

ALTER TABLE module_team_chat.pins ENABLE ROW LEVEL SECURITY;

--
-- Name: reactions; Type: ROW SECURITY; Schema: module_team_chat; Owner: -
--

ALTER TABLE module_team_chat.reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_thread_links srv_tenant_isolation; Type: POLICY; Schema: module_team_chat; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team_chat.agent_thread_links TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: conversation_members srv_tenant_isolation; Type: POLICY; Schema: module_team_chat; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team_chat.conversation_members TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: conversations srv_tenant_isolation; Type: POLICY; Schema: module_team_chat; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team_chat.conversations TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: mentions srv_tenant_isolation; Type: POLICY; Schema: module_team_chat; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team_chat.mentions TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: messages srv_tenant_isolation; Type: POLICY; Schema: module_team_chat; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team_chat.messages TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: pins srv_tenant_isolation; Type: POLICY; Schema: module_team_chat; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team_chat.pins TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: reactions srv_tenant_isolation; Type: POLICY; Schema: module_team_chat; Owner: -
--

CREATE POLICY srv_tenant_isolation ON module_team_chat.reactions TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: conversations team_chat_conversations_select; Type: POLICY; Schema: module_team_chat; Owner: -
--

CREATE POLICY team_chat_conversations_select ON module_team_chat.conversations FOR SELECT TO authenticated USING (module_team_chat.is_conversation_visible(id));

--
-- Name: conversation_members team_chat_members_select; Type: POLICY; Schema: module_team_chat; Owner: -
--

CREATE POLICY team_chat_members_select ON module_team_chat.conversation_members FOR SELECT TO authenticated USING (module_team_chat.is_conversation_visible(conversation_id));

--
-- Name: messages team_chat_messages_select; Type: POLICY; Schema: module_team_chat; Owner: -
--

CREATE POLICY team_chat_messages_select ON module_team_chat.messages FOR SELECT TO authenticated USING (module_team_chat.is_conversation_visible(conversation_id));

--
-- Name: reactions team_chat_reactions_select; Type: POLICY; Schema: module_team_chat; Owner: -
--

CREATE POLICY team_chat_reactions_select ON module_team_chat.reactions FOR SELECT TO authenticated USING (module_team_chat.is_conversation_visible(conversation_id));

--
-- Name: SCHEMA module_team_chat; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA module_team_chat TO service_role;
GRANT USAGE ON SCHEMA module_team_chat TO authenticated;
GRANT USAGE ON SCHEMA module_team_chat TO engenty_server;

--
-- Name: FUNCTION is_conversation_visible(conv uuid); Type: ACL; Schema: module_team_chat; Owner: -
--

REVOKE ALL ON FUNCTION module_team_chat.is_conversation_visible(conv uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION module_team_chat.is_conversation_visible(conv uuid) TO authenticated;
GRANT ALL ON FUNCTION module_team_chat.is_conversation_visible(conv uuid) TO service_role;
GRANT ALL ON FUNCTION module_team_chat.is_conversation_visible(conv uuid) TO engenty_server;

--
-- Name: FUNCTION list_my_conversations(p_tenant_id uuid, p_scope_id text, p_user_id uuid, p_include_public boolean, p_include_archived boolean); Type: ACL; Schema: module_team_chat; Owner: -
--

GRANT ALL ON FUNCTION module_team_chat.list_my_conversations(p_tenant_id uuid, p_scope_id text, p_user_id uuid, p_include_public boolean, p_include_archived boolean) TO service_role;

--
-- Name: TABLE messages; Type: ACL; Schema: module_team_chat; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.messages TO service_role;
GRANT SELECT ON TABLE module_team_chat.messages TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.messages TO engenty_server;

--
-- Name: FUNCTION post_message(p_tenant_id uuid, p_conversation_id uuid, p_thread_ts text, p_user_id uuid, p_agent_type_key text, p_bot_id text, p_text text, p_blocks jsonb, p_files jsonb, p_subtype text, p_metadata jsonb, p_mentions jsonb); Type: ACL; Schema: module_team_chat; Owner: -
--

GRANT ALL ON FUNCTION module_team_chat.post_message(p_tenant_id uuid, p_conversation_id uuid, p_thread_ts text, p_user_id uuid, p_agent_type_key text, p_bot_id text, p_text text, p_blocks jsonb, p_files jsonb, p_subtype text, p_metadata jsonb, p_mentions jsonb) TO service_role;

--
-- Name: FUNCTION soft_delete_message(p_conversation_id uuid, p_ts text); Type: ACL; Schema: module_team_chat; Owner: -
--

GRANT ALL ON FUNCTION module_team_chat.soft_delete_message(p_conversation_id uuid, p_ts text) TO service_role;

--
-- Name: TABLE agent_thread_links; Type: ACL; Schema: module_team_chat; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.agent_thread_links TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.agent_thread_links TO engenty_server;

--
-- Name: TABLE conversation_members; Type: ACL; Schema: module_team_chat; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.conversation_members TO service_role;
GRANT SELECT ON TABLE module_team_chat.conversation_members TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.conversation_members TO engenty_server;

--
-- Name: TABLE conversations; Type: ACL; Schema: module_team_chat; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.conversations TO service_role;
GRANT SELECT ON TABLE module_team_chat.conversations TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.conversations TO engenty_server;

--
-- Name: TABLE mentions; Type: ACL; Schema: module_team_chat; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.mentions TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.mentions TO engenty_server;

--
-- Name: TABLE pins; Type: ACL; Schema: module_team_chat; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.pins TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.pins TO engenty_server;

--
-- Name: TABLE reactions; Type: ACL; Schema: module_team_chat; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.reactions TO service_role;
GRANT SELECT ON TABLE module_team_chat.reactions TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE module_team_chat.reactions TO engenty_server;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: conversations; Type: TABLE DATA; Schema: module_team_chat; Owner: postgres
--


--
-- Data for Name: agent_thread_links; Type: TABLE DATA; Schema: module_team_chat; Owner: postgres
--


--
-- Data for Name: conversation_members; Type: TABLE DATA; Schema: module_team_chat; Owner: postgres
--


--
-- Data for Name: mentions; Type: TABLE DATA; Schema: module_team_chat; Owner: postgres
--


--
-- Data for Name: messages; Type: TABLE DATA; Schema: module_team_chat; Owner: postgres
--


--
-- Data for Name: pins; Type: TABLE DATA; Schema: module_team_chat; Owner: postgres
--


--
-- Data for Name: reactions; Type: TABLE DATA; Schema: module_team_chat; Owner: postgres
--


--
--

RESET check_function_bodies;
