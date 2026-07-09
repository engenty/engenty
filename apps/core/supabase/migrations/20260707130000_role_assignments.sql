-- Phase 1 — core.role_assignments: role profiles assigned to users OR agents,
-- always within one tenant. Role writes stay service-role-only through the core
-- API; authenticated may read (RLS-scoped to their tenant) so the UI can render.

-- Composite unique on agents makes the (agent_id, tenant_id) FK below possible,
-- so cross-tenant assignments are literally unrepresentable.
alter table core.agents
  add constraint agents_id_tenant_unique unique (id, tenant_id);

create table if not exists core.role_assignments (
  id         uuid primary key default uuidv7(),
  tenant_id  uuid not null references core.tenants(id) on delete cascade,
  role_id    text not null,                 -- role-profile id from the code registry
  user_id    uuid,
  agent_id   uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (agent_id is null)),
  foreign key (user_id, tenant_id)
    references core.user_tenant_roles(user_id, tenant_id) on delete cascade,
  foreign key (agent_id, tenant_id)
    references core.agents(id, tenant_id) on delete cascade,
  constraint role_assignments_unique
    unique nulls not distinct (tenant_id, role_id, user_id, agent_id)
);

create index if not exists role_assignments_user_idx
  on core.role_assignments (tenant_id, user_id);
create index if not exists role_assignments_agent_idx
  on core.role_assignments (tenant_id, agent_id);

alter table core.role_assignments enable row level security;
create policy role_assignments_select on core.role_assignments for select
  using (tenant_id = core.current_tenant_id());

grant select on core.role_assignments to authenticated;
grant select, insert, update, delete on core.role_assignments to service_role;
