-- Inbox module baseline: synced local message store over the connections
-- framework (docs/wip/inbox-module.md). Accounts ARE connections — no local
-- accounts table; `connection_id` + denormalized `owner_user_id` carry the
-- visibility split (org connection → tenant-readable, personal → owner-only).

create schema if not exists module_inbox;

-- One row per provider conversation (grouped by connection + provider_thread_id;
-- messages without a provider thread id get a synthetic single-message thread).
create table if not exists module_inbox.threads (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  connection_id uuid not null,
  owner_user_id uuid,
  provider_thread_id text,
  subject text,
  -- Participants digest: distinct from/to/cc addresses seen on the thread (capped).
  participants text[] not null default '{}',
  message_count integer not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_module_inbox_threads_provider
  on module_inbox.threads (tenant_id, connection_id, provider_thread_id)
  where provider_thread_id is not null;

create index if not exists idx_module_inbox_threads_list
  on module_inbox.threads (tenant_id, scope_id, last_message_at desc);

create index if not exists idx_module_inbox_threads_connection
  on module_inbox.threads (connection_id);

create table if not exists module_inbox.messages (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  thread_id text not null references module_inbox.threads(id) on delete cascade,
  connection_id uuid not null,
  owner_user_id uuid,
  provider_message_id text not null,
  provider_thread_id text,
  from_email text,
  from_name text,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  subject text,
  snippet text,
  body_text text,
  body_html text,
  has_attachments boolean not null default false,
  -- Attachment metadata (filename, mime_type, size, attachment_id, content_id);
  -- content is fetched on demand through connector actions, never mirrored here.
  attachments_json jsonb not null default '[]',
  received_at timestamptz,
  -- Triage: one global user-facing status…
  status text not null default 'new'
    check (status in ('new', 'triaged', 'processed', 'archived')),
  status_set_by text,
  -- …plus machine hints (nullable until the triage model is decided) and a
  -- user override, kept separate so neither clobbers the other.
  classification text,
  classification_reason text,
  user_classification text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_module_inbox_messages_provider
  on module_inbox.messages (connection_id, provider_message_id);

create index if not exists idx_module_inbox_messages_thread
  on module_inbox.messages (thread_id, received_at asc);

create index if not exists idx_module_inbox_messages_list
  on module_inbox.messages (tenant_id, scope_id, status, received_at desc);

-- Lexical search: subject/from weighted above body.
create index if not exists idx_module_inbox_messages_fts
  on module_inbox.messages using gin (
    (
      setweight(to_tsvector('simple', coalesce(subject, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(from_email, '') || ' ' || coalesce(from_name, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(body_text, '')), 'D')
    )
  );

-- Per-connection sync cursor + settings. `cursor` is connector-opaque (Gmail:
-- plain historyId when incremental, JSON backfill continuation while the
-- initial window is still paging).
create table if not exists module_inbox.sync_state (
  connection_id uuid primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  owner_user_id uuid,
  sync_enabled boolean not null default true,
  backfill_days integer not null default 90,
  cursor text,
  last_synced_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_inbox_sync_state_tenant
  on module_inbox.sync_state (tenant_id);

-- Per-(message, consumer) processing marks. Ships empty in v1; carries the
-- Model 1/hybrid triage dispatch later without a schema break.
create table if not exists module_inbox.message_routes (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  message_id text not null references module_inbox.messages(id) on delete cascade,
  consumer text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processed', 'skipped', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, consumer)
);

create index if not exists idx_module_inbox_message_routes_consumer
  on module_inbox.message_routes (tenant_id, consumer, status);

grant usage on schema module_inbox to service_role;
grant select, insert, update, delete on module_inbox.threads to service_role;
grant select, insert, update, delete on module_inbox.messages to service_role;
grant select, insert, update, delete on module_inbox.sync_state to service_role;
grant select, insert, update, delete on module_inbox.message_routes to service_role;

alter table module_inbox.threads enable row level security;
alter table module_inbox.messages enable row level security;
alter table module_inbox.sync_state enable row level security;
alter table module_inbox.message_routes enable row level security;

-- Visibility mirrors connections sharing: org-connection rows (owner_user_id
-- null) are tenant-readable, personal-connection rows are owner-only.
create policy threads_read_visible on module_inbox.threads
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
  and (owner_user_id is null or owner_user_id = auth.uid())
);

create policy messages_read_visible on module_inbox.messages
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
  and (owner_user_id is null or owner_user_id = auth.uid())
);

create policy messages_update_visible on module_inbox.messages
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
  and (owner_user_id is null or owner_user_id = auth.uid())
);

create policy sync_state_read_visible on module_inbox.sync_state
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
  and (owner_user_id is null or owner_user_id = auth.uid())
);

create policy message_routes_read_visible on module_inbox.message_routes
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- Realtime for the messages live binding (live-cache invalidation).
grant usage on schema module_inbox to authenticated;
grant select on table module_inbox.threads to authenticated;
grant select on table module_inbox.messages to authenticated;

alter table module_inbox.threads replica identity full;
alter table module_inbox.messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_inbox.threads;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table module_inbox.messages;
exception
  when duplicate_object then null;
end $$;

-- Lexical message search with the owner-visibility filter applied in the
-- FIRST index version (p_user_id null = service caller, sees everything).
create or replace function module_inbox.search_messages(
  p_tenant_id uuid,
  p_scope_id text,
  p_user_id uuid,
  p_query text,
  p_limit int,
  p_offset int,
  p_connection_id uuid default null,
  p_status text default null
)
returns jsonb
language plpgsql
stable
as $$
begin
  return (
    with params as (
      select
        nullif(trim(coalesce(p_query, '')), '') as raw_query,
        websearch_to_tsquery('simple', nullif(trim(coalesce(p_query, '')), '')) as tsq
    ),
    docs as (
      select
        m.id,
        m.thread_id,
        m.subject,
        m.received_at,
        (
          setweight(to_tsvector('simple', coalesce(m.subject, '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(m.from_email, '') || ' ' || coalesce(m.from_name, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(m.body_text, '')), 'D')
        ) as search_vector
      from module_inbox.messages m
      where m.tenant_id = p_tenant_id
        and m.scope_id = p_scope_id
        and (m.owner_user_id is null or p_user_id is null or m.owner_user_id = p_user_id)
        and (p_connection_id is null or m.connection_id = p_connection_id)
        and (p_status is null or m.status = p_status)
    ),
    scored as (
      select
        d.id,
        d.thread_id,
        case
          when params.tsq is null then 0::double precision
          else ts_rank_cd(d.search_vector, params.tsq)::double precision
        end as score,
        d.received_at
      from docs d
      cross join params
      where params.tsq is null or d.search_vector @@ params.tsq
    ),
    ordered as (
      select *, row_number() over (
        order by score desc, received_at desc nulls last, id asc
      ) as rn
      from scored
    )
    select jsonb_build_object(
      'total', (select count(*)::bigint from scored),
      'matches', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('id', id, 'thread_id', thread_id, 'score', score)
            order by rn
          )
          from ordered
          where rn > p_offset and rn <= p_offset + p_limit
        ),
        '[]'::jsonb
      )
    )
  );
end;
$$;

grant execute on function module_inbox.search_messages(uuid, text, uuid, text, int, int, uuid, text) to service_role;

-- Thread list with latest-message digest, status-lane filter, and the same
-- owner-visibility rule as the RLS policies (p_user_id null = service caller).
create or replace function module_inbox.list_threads(
  p_tenant_id uuid,
  p_scope_id text,
  p_user_id uuid,
  p_limit int,
  p_offset int,
  p_connection_id uuid default null,
  p_status text default null
)
returns jsonb
language plpgsql
stable
as $$
begin
  return (
    with visible_threads as (
      select t.*
      from module_inbox.threads t
      where t.tenant_id = p_tenant_id
        and t.scope_id = p_scope_id
        and (t.owner_user_id is null or p_user_id is null or t.owner_user_id = p_user_id)
        and (p_connection_id is null or t.connection_id = p_connection_id)
    ),
    latest as (
      select distinct on (m.thread_id)
        m.thread_id,
        m.from_email as latest_from_email,
        m.from_name as latest_from_name,
        m.snippet as latest_snippet,
        m.status as latest_status
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
        l.latest_status, coalesce(u.unhandled_count, 0) as unhandled_count
      from visible_threads vt
      left join latest l on l.thread_id = vt.id
      left join unhandled u on u.thread_id = vt.id
      where p_status is null or exists (
        select 1 from module_inbox.messages m
        where m.thread_id = vt.id and m.status = p_status
      )
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

grant execute on function module_inbox.list_threads(uuid, text, uuid, int, int, uuid, text) to service_role;
