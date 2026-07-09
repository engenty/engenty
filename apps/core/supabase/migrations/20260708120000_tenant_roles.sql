-- Phase 7 — tenant-defined custom roles. The resolver consults the code
-- registry first, then this table (see resolveGrants getTenantRole hook), so a
-- custom role is a pure data change. role_id is namespaced 'custom.<slug>' so it
-- can never shadow a code profile.
create table if not exists core.tenant_roles (
  id           uuid primary key default uuidv7(),
  tenant_id    uuid not null references core.tenants(id) on delete cascade,
  role_id      text not null,
  title        text not null,
  description  text,
  capabilities text[] not null,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, role_id),
  check (role_id like 'custom.%')
);

alter table core.tenant_roles enable row level security;
create policy tenant_roles_select on core.tenant_roles for select
  using (tenant_id = core.current_tenant_id());

grant select on core.tenant_roles to authenticated;
grant select, insert, update, delete on core.tenant_roles to service_role;
