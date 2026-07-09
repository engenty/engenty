-- Calendar sync (Phase 2): map local time entries to external calendar
-- events (two-way identity) and track per-connection push settings/cursor.

-- Per-connection sync state — mirrors module_inbox.sync_state. One row per
-- calendar connection a user has enabled push for.
create table if not exists module_time_tracking.calendar_sync_state (
  connection_id uuid primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  owner_user_id text not null,
  sync_enabled boolean not null default false,
  -- Calendar within the connection that entries are written to.
  target_calendar_id text,
  -- IANA zone of the target calendar; timed pushes send wall-clock + this zone.
  time_zone text,
  -- Provider incremental cursor (gcal syncToken / graph deltaLink); Phase 3.
  cursor text,
  last_synced_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_time_tracking_calendar_sync_owner
  on module_time_tracking.calendar_sync_state (tenant_id, owner_user_id);

-- Entry ⇄ remote event link. entry_id is NOT a FK: the row must outlive the
-- entry so the reconcile pass can delete the orphaned remote event.
create table if not exists module_time_tracking.calendar_links (
  entry_id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  owner_user_id text not null,
  connection_id uuid not null,
  calendar_id text not null,
  provider_event_id text not null,
  etag text,
  -- Hash of the last-pushed (date,start,hours,title); skip redundant pushes
  -- and detect remote drift (Phase 3).
  sync_hash text,
  status text not null default 'linked'
    check (status in ('linked', 'remote_deleted', 'error')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_module_time_tracking_calendar_links_provider
  on module_time_tracking.calendar_links (connection_id, provider_event_id);

create index if not exists idx_module_time_tracking_calendar_links_owner
  on module_time_tracking.calendar_links (tenant_id, owner_user_id);

grant usage on schema module_time_tracking to service_role;
grant select, insert, update, delete
  on module_time_tracking.calendar_sync_state to service_role;
grant select, insert, update, delete
  on module_time_tracking.calendar_links to service_role;

alter table module_time_tracking.calendar_sync_state enable row level security;
alter table module_time_tracking.calendar_links enable row level security;

-- Read policies mirror time_entries (tenant + scope); all writes go through
-- the service-role DAL.
create policy calendar_sync_state_read_own_scope
  on module_time_tracking.calendar_sync_state
  for select using (
    tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
  );

create policy calendar_links_read_own_scope
  on module_time_tracking.calendar_links
  for select using (
    tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
  );
