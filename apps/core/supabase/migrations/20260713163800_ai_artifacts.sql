-- AI artifacts: AI-generated documents (markdown/html/table/…) shown and edited
-- through the copilot. Born thread-scoped, promoted to task/project/goal (a scope
-- change, not a copy — origin thread_id is preserved). Owned by apps/ai (ai schema),
-- accessed via the service-role API; authenticated grants (SELECT) are added by the
-- companion *_realtime.sql migration for browser realtime only.
--
-- Version model: every edit inserts a new artifact_version; ai.artifact.current_version
-- tracks the latest. Text content lives inline (≤256KB) on the version row; blob storage
-- is a later phase (storage/storage_key/storage_connection_id reserved).

create table if not exists ai.artifact (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  type text not null,
  title text not null,
  scope_type text not null check (scope_type in ('thread', 'task', 'project', 'goal')),
  scope_id text not null,
  -- Origin thread as a soft reference (no FK): provenance must survive thread
  -- deletion, and an artifact may be created before a draft thread is persisted.
  thread_id uuid,
  created_by_kind text not null check (created_by_kind in ('agent', 'user')),
  created_by uuid,
  current_version integer not null default 1,
  storage text not null default 'inline' check (storage in ('inline', 'blob')),
  storage_key text,
  storage_connection_id uuid,
  mime_type text,
  size_bytes bigint,
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artifact_tenant_scope_idx
  on ai.artifact (tenant_id, scope_type, scope_id) where status = 'active';
create index if not exists artifact_thread_idx on ai.artifact (thread_id);

create table if not exists ai.artifact_version (
  id uuid primary key default public.uuidv7(),
  artifact_id uuid not null references ai.artifact(id) on delete cascade,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  version integer not null,
  content text,
  storage_key text,
  summary text,
  created_by_kind text not null check (created_by_kind in ('agent', 'user')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (artifact_id, version)
);

alter table ai.artifact enable row level security;
alter table ai.artifact_version enable row level security;

grant select, insert, update, delete on table ai.artifact to service_role;
grant select, insert, update, delete on table ai.artifact_version to service_role;
