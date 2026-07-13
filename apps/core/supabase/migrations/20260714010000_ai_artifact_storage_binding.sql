-- Per-scope external storage binding for artifacts: which connection (and
-- folder) promoted artifacts are mirrored to. connection_id is a soft
-- reference into the connections module (no cross-schema FK, same as
-- ai.artifact.storage_connection_id).
create table "ai"."artifact_storage_binding" (
  "id" uuid primary key default public.uuidv7(),
  "tenant_id" uuid not null references core.tenants(id) on delete cascade,
  "scope_type" text not null check (scope_type in ('task','project','goal')),
  "scope_id" text not null,
  "connection_id" uuid not null,
  "folder_ref" text,
  "created_by" uuid,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  unique (tenant_id, scope_type, scope_id)
);

alter table ai.artifact_storage_binding enable row level security;

grant select, insert, update, delete on table ai.artifact_storage_binding to service_role;
