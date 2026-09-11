-- Mount = grant (PLAN-spaces.md Phase 3, the keystone).
--
-- Today three unrelated configurations decide what an engenty can reach: workspace
-- presets (files), `module.connections.write.<id>` capabilities (connectors), and
-- `toolIds ∩ allowedToolIds` (tools). Mounting an app in a space UI would grant
-- nothing. This row is the single declaration all of them read.
--
-- ONE table for four resource kinds, not four near-identical ones: the acceptance
-- test demands ONE function answering "what can this space touch", and three tables
-- would be three queries that drift apart within a release.
--
-- `record_scope` and `agent_access` are typed nullable columns with a discriminating
-- CHECK rather than a `config jsonb`, because both carry authorization consequences
-- and must stay constrained by the database, not by whichever writer got there last.
--
-- Idempotent: guarded creates, drop-policy-first, re-grants.

create table if not exists core.space_mount (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  space_id uuid not null,
  resource_type text not null
    check (resource_type in ('module', 'agent', 'skill', 'connection')),
  -- 'offers' | agent id | skill name | connection id
  resource_key text not null,
  -- module-only; the CHECK below keeps them honest
  record_scope text,
  agent_access text,
  -- A space with no coordinator and no chat is a broken space. Required mounts are
  -- pre-checked and non-removable in the setup dialog (Phase 3b).
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (tenant_id, space_id, resource_type, resource_key),
  -- Composite FK: the mounted space must belong to the mount's tenant. A plain
  -- reference to core.spaces(id) would accept another tenant's space, and module
  -- DAL runs partly on a service-role client where RLS would not catch it.
  constraint space_mount_space_tenant_fkey
    foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
    on delete cascade,
  -- The `is not null` halves are load-bearing, not belt-and-braces: `null in
  -- ('space','all')` is NULL, and a CHECK only rejects FALSE — so the obvious
  -- spelling of this constraint accepts a module mount that simply OMITS both
  -- columns, which is precisely the authorization-carrying case it exists to
  -- pin down. Verified by the negative probe before this was tightened.
  constraint space_mount_module_config_check check (
    resource_type <> 'module'
    or (
      record_scope is not null
      and record_scope in ('space', 'all')
      and agent_access is not null
      and agent_access in ('none', 'read', 'write')
    )
  ),
  -- And the mirror: a non-module mount must not carry module-only settings, or
  -- a stray `agent_access` would sit in the table looking authoritative while
  -- no reader honours it.
  constraint space_mount_non_module_config_check check (
    resource_type = 'module'
    or (record_scope is null and agent_access is null)
  )
);

create index if not exists space_mount_space_type_idx
  on core.space_mount (tenant_id, space_id, resource_type);

alter table core.space_mount enable row level security;

-- Server lane: the standard tenant wall.
grant select, insert, update, delete on core.space_mount to engenty_server;

drop policy if exists srv_tenant_isolation on core.space_mount;
create policy srv_tenant_isolation on core.space_mount
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

-- Browser lane: members READ (the Apps tab and the space picker need it); writes
-- are ADMIN-ONLY and only through the API.
--
-- This is the escalation gate, not a nicety: mounting an agent with
-- agent_access='write' hands that agent write access to the space's data, so a
-- member-writable mount table would turn the space setup dialog into a
-- privilege-escalation path — exactly the "never infer authorization from
-- membership" non-goal. Enforced twice on purpose: here in the database for any
-- direct PostgREST call, and again in the route for a useful error message.
grant select on core.space_mount to authenticated;

drop policy if exists space_mount_select_own_tenant on core.space_mount;
create policy space_mount_select_own_tenant on core.space_mount
  as permissive for select to authenticated
  using (tenant_id = (select core.current_tenant_id()));

notify pgrst, 'reload schema';
