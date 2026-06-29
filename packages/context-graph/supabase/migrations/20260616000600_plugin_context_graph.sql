-- Consolidated context-graph baseline (pre-launch).

-- >>> from 20260526213450_plugin_context_graph.sql
-- @engenty/context-graph v0 schema.
--
-- Two tables under the `context_graph` schema. Current state only — no
-- temporal columns, no scope key beyond tenant, no embeddings. Writes go
-- exclusively through the plugin-SDK server API (service_role), reads are
-- RLS-isolated by tenant for `authenticated` / `anon`.

create schema if not exists context_graph;

-- Entities: typed nodes, optionally pointing at a canonical module row.
create table if not exists context_graph.entities (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  type text not null,
  external_ref jsonb,
  name text,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One canonical entity per (tenant, external reference triple). Lets modules
-- upsert idempotently by the module row they own without first looking up the
-- graph entity id.
create unique index if not exists entities_external_ref_uq
  on context_graph.entities (
    tenant_id,
    (external_ref ->> 'module'),
    (external_ref ->> 'entity'),
    (external_ref ->> 'id')
  )
  where external_ref is not null;

create index if not exists entities_tenant_type_idx
  on context_graph.entities (tenant_id, type);

-- Edges: typed directed relations between two entities.
create table if not exists context_graph.edges (
  id uuid primary key default uuidv7(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  type text not null,
  subject_id uuid not null references context_graph.entities(id) on delete cascade,
  object_id uuid not null references context_graph.entities(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subject_id <> object_id)
);

create unique index if not exists edges_triple_uq
  on context_graph.edges (tenant_id, type, subject_id, object_id);

create index if not exists edges_subject_idx
  on context_graph.edges (tenant_id, subject_id, type);

create index if not exists edges_object_idx
  on context_graph.edges (tenant_id, object_id, type);

-- RLS: tenant isolation only in v0.
alter table context_graph.entities enable row level security;
alter table context_graph.edges enable row level security;

drop policy if exists entities_tenant on context_graph.entities;
create policy entities_tenant on context_graph.entities
  for all
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

drop policy if exists edges_tenant on context_graph.edges;
create policy edges_tenant on context_graph.edges
  for all
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

grant usage on schema context_graph to anon, authenticated, service_role;
grant select, insert, update, delete on context_graph.entities to service_role;
grant select, insert, update, delete on context_graph.edges to service_role;
grant select on context_graph.entities to anon, authenticated;
grant select on context_graph.edges to anon, authenticated;
