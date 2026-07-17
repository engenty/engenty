-- Team-chat module baseline: Slack-compatible team messaging store.
-- Schema: module_team_chat (conversations, conversation_members, messages,
-- reactions, mentions, pins, agent_thread_links).
--
-- Access model (see docs/wip/team-chat-module.md §4.3):
--   * service_role — full CRUD via the core API; repos enforce tenant/scope and
--     conversation membership in code.
--   * authenticated — SELECT only, for Supabase Realtime (postgres_changes).
--     Every SELECT policy funnels through is_conversation_visible(), a
--     security-definer helper (WALRUS evaluates policies as the subscriber and
--     a naive membership policy would recurse through conversation_members'
--     own RLS — same pattern as ai.is_thread_member()).
--
-- Slack-compat invariants: one conversation family (public_channel /
-- private_channel / im / mpim); message identity = (conversation_id, ts) with
-- ts "<epoch-seconds>.<6-digit-suffix>"; replies carry thread_ts and roll up
-- onto the parent (reply_count / latest_reply / reply_users).

create schema if not exists module_team_chat;

-- ── Conversations ────────────────────────────────────────────────────────────
create table if not exists module_team_chat.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null default 'default',
  type text not null check (type in ('public_channel', 'private_channel', 'im', 'mpim')),
  name text,
  topic text,
  purpose text,
  is_archived boolean not null default false,
  created_by uuid,
  -- Canonical sorted member-set hash; makes conversations.open find-or-create
  -- for DMs (unique per tenant among im/mpim).
  member_hash text,
  project_id uuid,
  settings jsonb not null default '{}',
  external jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_module_team_chat_conv_name check (
    (type in ('im', 'mpim') and name is null)
    or (type in ('public_channel', 'private_channel') and name is not null)
  )
);

create unique index if not exists uq_module_team_chat_conv_name
  on module_team_chat.conversations (tenant_id, lower(name))
  where type in ('public_channel', 'private_channel') and is_archived = false;

create unique index if not exists uq_module_team_chat_conv_member_hash
  on module_team_chat.conversations (tenant_id, member_hash)
  where type in ('im', 'mpim');

create index if not exists idx_module_team_chat_conv_tenant
  on module_team_chat.conversations (tenant_id, scope_id, updated_at desc);

create index if not exists idx_module_team_chat_conv_project
  on module_team_chat.conversations (tenant_id, project_id)
  where project_id is not null;

-- ── Members ──────────────────────────────────────────────────────────────────
create table if not exists module_team_chat.conversation_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  conversation_id uuid not null references module_team_chat.conversations(id) on delete cascade,
  principal_type text not null check (principal_type in ('user', 'agent')),
  -- User uuid or agent_type_key, depending on principal_type.
  principal_id text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  last_read_ts text,
  muted boolean not null default false,
  notify_prefs jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_module_team_chat_member
  on module_team_chat.conversation_members (conversation_id, principal_type, principal_id);

create index if not exists idx_module_team_chat_members_principal
  on module_team_chat.conversation_members (tenant_id, principal_type, principal_id);

-- ── Messages ─────────────────────────────────────────────────────────────────
create table if not exists module_team_chat.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  conversation_id uuid not null references module_team_chat.conversations(id) on delete cascade,
  ts text not null,
  thread_ts text,
  user_id uuid,
  agent_type_key text,
  bot_id text,
  text text not null default '',
  blocks jsonb not null default '[]',
  attachments jsonb not null default '[]',
  files jsonb not null default '[]',
  subtype text,
  metadata jsonb not null default '{}',
  edited jsonb,
  reply_count integer not null default 0,
  latest_reply text,
  reply_users jsonb not null default '[]',
  deleted_at timestamptz,
  external jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_module_team_chat_msg_author check (
    user_id is not null or agent_type_key is not null
    or bot_id is not null or subtype is not null
  )
);

create unique index if not exists uq_module_team_chat_messages_ts
  on module_team_chat.messages (conversation_id, ts);

create index if not exists idx_module_team_chat_messages_history
  on module_team_chat.messages (conversation_id, ts desc)
  where thread_ts is null;

create index if not exists idx_module_team_chat_messages_thread
  on module_team_chat.messages (conversation_id, thread_ts, ts asc)
  where thread_ts is not null;

create index if not exists idx_module_team_chat_messages_search
  on module_team_chat.messages using gin (to_tsvector('simple', coalesce(text, '')));

-- ── Reactions (ops land in Phase 2; schema is part of the baseline) ─────────
create table if not exists module_team_chat.reactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  conversation_id uuid not null references module_team_chat.conversations(id) on delete cascade,
  message_ts text not null,
  emoji text not null,
  principal_type text not null check (principal_type in ('user', 'agent')),
  principal_id text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_module_team_chat_reactions
  on module_team_chat.reactions (conversation_id, message_ts, emoji, principal_type, principal_id);

create index if not exists idx_module_team_chat_reactions_msg
  on module_team_chat.reactions (conversation_id, message_ts);

-- ── Mentions ─────────────────────────────────────────────────────────────────
create table if not exists module_team_chat.mentions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  conversation_id uuid not null references module_team_chat.conversations(id) on delete cascade,
  message_ts text not null,
  kind text not null check (kind in ('user', 'agent', 'here', 'channel')),
  target_id text,
  created_at timestamptz not null default now(),
  constraint chk_module_team_chat_mention_target check (
    (kind in ('user', 'agent') and target_id is not null)
    or kind in ('here', 'channel')
  )
);

create index if not exists idx_module_team_chat_mentions_target
  on module_team_chat.mentions (tenant_id, kind, target_id, created_at desc);

create index if not exists idx_module_team_chat_mentions_msg
  on module_team_chat.mentions (conversation_id, message_ts);

-- ── Pins (ops land in Phase 2) ───────────────────────────────────────────────
create table if not exists module_team_chat.pins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  conversation_id uuid not null references module_team_chat.conversations(id) on delete cascade,
  message_ts text not null,
  pinned_by uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_module_team_chat_pins
  on module_team_chat.pins (conversation_id, message_ts);

-- ── Agent thread links (channel thread → ai.thread; consumed in Phase 3) ────
create table if not exists module_team_chat.agent_thread_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  conversation_id uuid not null references module_team_chat.conversations(id) on delete cascade,
  thread_ts text not null,
  agent_type_key text not null,
  ai_thread_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_module_team_chat_agent_thread_links
  on module_team_chat.agent_thread_links (conversation_id, thread_ts, agent_type_key);

-- ── post_message: atomic ts generation + insert + rollup + mentions ─────────
-- The unique (conversation_id, ts) index is the arbiter; the loop bumps the
-- 6-digit suffix on collision (Slack semantics: unique per conversation,
-- roughly time-ordered).
create or replace function module_team_chat.post_message(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_thread_ts text,
  p_user_id uuid,
  p_agent_type_key text,
  p_bot_id text,
  p_text text,
  p_blocks jsonb,
  p_files jsonb,
  p_subtype text,
  p_metadata jsonb,
  p_mentions jsonb
) returns module_team_chat.messages
language plpgsql
as $$
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

-- ── soft_delete_message: tombstone + parent rollup decrement ─────────────────
create or replace function module_team_chat.soft_delete_message(
  p_conversation_id uuid,
  p_ts text
) returns module_team_chat.messages
language plpgsql
as $$
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

-- ── list_my_conversations: sidebar in one round-trip ─────────────────────────
-- Returns the caller's conversations (+ optionally all public channels) with
-- membership state, unread/mention counts, member principals for im/mpim
-- naming, and a last-message preview.
create or replace function module_team_chat.list_my_conversations(
  p_tenant_id uuid,
  p_scope_id text,
  p_user_id uuid,
  p_include_public boolean default false,
  p_include_archived boolean default false
) returns jsonb
language sql
stable
as $$
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

-- ── Grants + RLS ─────────────────────────────────────────────────────────────
grant usage on schema module_team_chat to service_role;
grant select, insert, update, delete on all tables in schema module_team_chat to service_role;
grant execute on all functions in schema module_team_chat to service_role;

alter table module_team_chat.conversations enable row level security;
alter table module_team_chat.conversation_members enable row level security;
alter table module_team_chat.messages enable row level security;
alter table module_team_chat.reactions enable row level security;
alter table module_team_chat.mentions enable row level security;
alter table module_team_chat.pins enable row level security;
alter table module_team_chat.agent_thread_links enable row level security;

-- Realtime path: authenticated may SELECT rows of conversations they can see.
-- security definer breaks the RLS recursion (members table is itself gated).
create or replace function module_team_chat.is_conversation_visible(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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

revoke all on function module_team_chat.is_conversation_visible(uuid) from public;
grant execute on function module_team_chat.is_conversation_visible(uuid) to authenticated, service_role;

grant usage on schema module_team_chat to authenticated;
grant select on module_team_chat.conversations to authenticated;
grant select on module_team_chat.conversation_members to authenticated;
grant select on module_team_chat.messages to authenticated;
grant select on module_team_chat.reactions to authenticated;

create policy team_chat_conversations_select on module_team_chat.conversations
  for select to authenticated
  using (module_team_chat.is_conversation_visible(id));

create policy team_chat_members_select on module_team_chat.conversation_members
  for select to authenticated
  using (module_team_chat.is_conversation_visible(conversation_id));

create policy team_chat_messages_select on module_team_chat.messages
  for select to authenticated
  using (module_team_chat.is_conversation_visible(conversation_id));

create policy team_chat_reactions_select on module_team_chat.reactions
  for select to authenticated
  using (module_team_chat.is_conversation_visible(conversation_id));

-- Realtime publication (replica identity full so old rows carry filters).
alter table module_team_chat.conversations replica identity full;
alter table module_team_chat.conversation_members replica identity full;
alter table module_team_chat.messages replica identity full;
alter table module_team_chat.reactions replica identity full;

do $$ begin
  alter publication supabase_realtime add table module_team_chat.conversations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table module_team_chat.conversation_members;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table module_team_chat.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table module_team_chat.reactions;
exception when duplicate_object then null; end $$;
