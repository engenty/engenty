-- Memory module: layered agent learning memory.
-- One record type, four scopes — (scope_kind, scope_ref) pairs:
--   user    → scope_ref = user uuid
--   project → scope_ref = project/goal id
--   org     → scope_ref = null (tenant-wide; agent writes land as 'proposed')
--   entity  → scope_ref = '<dotted-type>:<id>' (e.g. 'contacts.person:<uuid>')
-- Records are small markdown documents with typed metadata. Soft-delete only
-- (status = 'archived'); consolidation links merged losers via `supersedes`.

create schema if not exists module_memory;

create table if not exists module_memory.records (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  scope_kind text not null check (scope_kind in ('user', 'project', 'org', 'entity')),
  scope_ref text,
  kind text not null default 'fact'
    check (kind in ('fact', 'preference', 'lesson', 'decision', 'guideline')),
  slug text not null check (slug ~ '^[a-z0-9-]{3,60}$'),
  title text not null,
  body_md text not null,
  source_kind text not null default 'agent'
    check (source_kind in ('agent', 'reflection', 'human')),
  agent_type_key text,
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high')),
  status text not null default 'active'
    check (status in ('active', 'proposed', 'archived')),
  supersedes text references module_memory.records(id),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Slug is the upsert key per (tenant, scope). Org scope has scope_ref = null;
-- a plain unique constraint would treat NULLs as distinct, so coalesce.
create unique index if not exists idx_module_memory_records_slug
  on module_memory.records (tenant_id, scope_id, scope_kind, coalesce(scope_ref, ''), slug);

create index if not exists idx_module_memory_records_scope
  on module_memory.records (tenant_id, scope_kind, scope_ref, status);

create index if not exists idx_module_memory_records_recency
  on module_memory.records (tenant_id, scope_id, updated_at desc);

-- RLS: same direct-column pattern as module_contacts.
alter table module_memory.records enable row level security;

create policy memory_records_read_own_scope on module_memory.records
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy memory_records_insert_own_scope on module_memory.records
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy memory_records_update_own_scope on module_memory.records
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy memory_records_delete_own_scope on module_memory.records
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

grant usage on schema module_memory to service_role;
grant select, insert, update, delete on module_memory.records to service_role;

-- Realtime: authenticated SELECT + publication + full replica identity for the
-- memory live-cache signals (memory document UI refreshes when agents write).
grant usage on schema module_memory to authenticated;
grant select on table module_memory.records to authenticated;

alter table module_memory.records replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_memory.records;
exception
  when duplicate_object then null;
end $$;
