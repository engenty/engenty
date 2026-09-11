-- Notifications live in core, owned by @engenty/notifications.
--
-- One record, four coordinates: tenant (always), space (null = tenant-global),
-- audience (tenant | user | stream) and class (decision | alert | todo |
-- update, derived from a registered kind at emit). `subject_type/subject_id`
-- names the thing the notification points at (a run, a task, an approval
-- request) so the seam that settles that thing can resolve every open record
-- about it with one indexed query.
--
-- Delivery is a ledger, not a side effect: emit inserts one
-- notification_deliveries row per channel the class allows, and whichever
-- process has that channel registered claims the row (compare-and-swap on
-- status) and sends. Two processes never double-send, and a channel with no
-- runner simply leaves its rows pending.
--
-- Schema only — nothing is copied from the earlier Mastra-backed inbox.

create table if not exists core.notifications (
  id               uuid primary key default public.uuidv7(),
  tenant_id        uuid not null references core.tenants(id) on delete cascade,
  space_id         uuid null,
  audience_kind    text not null check (audience_kind in ('tenant', 'user', 'stream')),
  audience_id      text null,
  kind             text not null,
  class            text not null check (class in ('decision', 'alert', 'todo', 'update')),
  source           text not null,
  actor_kind       text null check (actor_kind in ('agent', 'user', 'system')),
  actor_id         text null,
  priority         text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status           text not null default 'pending' check (status in ('pending', 'seen', 'dismissed', 'resolved')),
  summary          text not null,
  payload          jsonb null,
  metadata         jsonb null,
  subject_type     text null,
  subject_id       text null,
  dedupe_key       text null,
  coalesce_key     text null,
  coalesced_count  integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  seen_at          timestamptz null,
  resolved_at      timestamptz null,
  dismissed_at     timestamptz null
);

-- Composite FK so a space can never be attached to a foreign tenant's record
-- (same trap-avoidance as ai.thread.space_id).
alter table core.notifications
  drop constraint if exists notifications_space_fk;
alter table core.notifications
  add constraint notifications_space_fk
    foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
    on delete set null (space_id);

create index if not exists notifications_open_idx
  on core.notifications (tenant_id, status, created_at desc);
create index if not exists notifications_audience_idx
  on core.notifications (tenant_id, audience_kind, audience_id, status);
create index if not exists notifications_space_idx
  on core.notifications (tenant_id, space_id, status);
create index if not exists notifications_subject_idx
  on core.notifications (tenant_id, subject_type, subject_id)
  where status = 'pending';
create index if not exists notifications_actor_idx
  on core.notifications (tenant_id, actor_kind, actor_id, status);
-- Dedupe while pending: a second emit with the same key coalesces instead of
-- duplicating; once the record is seen/resolved the key is free again.
create unique index if not exists notifications_dedupe_idx
  on core.notifications (tenant_id, dedupe_key)
  where status = 'pending' and dedupe_key is not null;

create table if not exists core.notification_deliveries (
  id               uuid primary key default public.uuidv7(),
  tenant_id        uuid not null references core.tenants(id) on delete cascade,
  notification_id  uuid not null references core.notifications(id) on delete cascade,
  channel          text not null,
  target           jsonb not null default '{}'::jsonb,
  status           text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  not_before       timestamptz not null default now(),
  attempts         integer not null default 0,
  last_error       text null,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz null,
  unique (notification_id, channel)
);

create index if not exists notification_deliveries_due_idx
  on core.notification_deliveries (channel, status, not_before);

-- One row per browser/device push endpoint a user enabled. The endpoint is
-- globally unique per the Web Push spec; a re-subscribe upserts the keys.
create table if not exists core.notification_push_subscriptions (
  id            uuid primary key default public.uuidv7(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  user_id       uuid not null,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz null
);

create index if not exists notification_push_subscriptions_user_idx
  on core.notification_push_subscriptions (tenant_id, user_id);

-- Named streams: a shared work queue with routes out to real channels.
create table if not exists core.notification_streams (
  id                  uuid primary key default public.uuidv7(),
  tenant_id           uuid not null references core.tenants(id) on delete cascade,
  space_id            uuid null,
  key                 text not null,
  name                text not null,
  description         text null,
  created_by_user_id  uuid null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, key)
);

alter table core.notification_streams
  drop constraint if exists notification_streams_space_fk;
alter table core.notification_streams
  add constraint notification_streams_space_fk
    foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
    on delete set null (space_id);

create table if not exists core.notification_routes (
  id            uuid primary key default public.uuidv7(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  stream_id     uuid not null references core.notification_streams(id) on delete cascade,
  channel       text not null,
  target        jsonb not null default '{}'::jsonb,
  min_priority  text not null default 'low' check (min_priority in ('low', 'medium', 'high', 'urgent')),
  enabled       boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists notification_routes_stream_idx
  on core.notification_routes (tenant_id, stream_id);

-- ── Row-level security ──────────────────────────────────────────────────────
-- Members read the tenant inbox, their own records and every stream; writes
-- are server-side only (the routes run on the tenant-locked server lane).

alter table core.notifications enable row level security;
alter table core.notification_deliveries enable row level security;
alter table core.notification_push_subscriptions enable row level security;
alter table core.notification_streams enable row level security;
alter table core.notification_routes enable row level security;

drop policy if exists notifications_select on core.notifications;
create policy notifications_select on core.notifications
  for select using (
    tenant_id = core.current_tenant_id()
    and (
      audience_kind in ('tenant', 'stream')
      or (audience_kind = 'user' and audience_id = auth.uid()::text)
    )
  );
grant select on core.notifications to authenticated;

drop policy if exists notification_streams_select on core.notification_streams;
create policy notification_streams_select on core.notification_streams
  for select using (tenant_id = core.current_tenant_id());
grant select on core.notification_streams to authenticated;

grant select, insert, update, delete on table core.notifications to service_role;
grant select, insert, update, delete on table core.notification_deliveries to service_role;
grant select, insert, update, delete on table core.notification_push_subscriptions to service_role;
grant select, insert, update, delete on table core.notification_streams to service_role;
grant select, insert, update, delete on table core.notification_routes to service_role;

grant select, insert, update, delete on table core.notifications to engenty_server;
grant select, insert, update, delete on table core.notification_deliveries to engenty_server;
grant select, insert, update, delete on table core.notification_push_subscriptions to engenty_server;
grant select, insert, update, delete on table core.notification_streams to engenty_server;
grant select, insert, update, delete on table core.notification_routes to engenty_server;

drop policy if exists srv_tenant_isolation on core.notifications;
create policy srv_tenant_isolation on core.notifications
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));
drop policy if exists srv_tenant_isolation on core.notification_deliveries;
create policy srv_tenant_isolation on core.notification_deliveries
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));
drop policy if exists srv_tenant_isolation on core.notification_push_subscriptions;
create policy srv_tenant_isolation on core.notification_push_subscriptions
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));
drop policy if exists srv_tenant_isolation on core.notification_streams;
create policy srv_tenant_isolation on core.notification_streams
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));
drop policy if exists srv_tenant_isolation on core.notification_routes;
create policy srv_tenant_isolation on core.notification_routes
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

-- Realtime: the bell subscribes to postgres_changes on this table; WALRUS
-- evaluates the select policy above as the subscriber, so a user only ever
-- receives rows they may read.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'core'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table core.notifications;
  end if;
end $$;

comment on table core.notifications is
  'Notification records (@engenty/notifications): a signal about something that happened or is waiting — never a work item.';
comment on table core.notification_deliveries is
  'Per-channel delivery ledger for a notification; claimed by whichever process has the channel registered.';

notify pgrst, 'reload schema';
