-- "The Marketing Agent may use my Gmail" (PLAN-spaces.md Phase CN.5).
--
-- The alternative this replaces is impersonation: a background run borrowing
-- the user's id so the owner check passes. That works and is wrong — the audit
-- trail then says a person did what an agent did, and there is no single place
-- to take the access away again. A grant row is the opposite on both counts:
-- it names the agent, and revoking is deleting one row.
--
-- Only the OWNER may create one, enforced in the operation rather than here:
-- `owner_user_id` on the parent connection is the authority, and a policy that
-- re-derived it would be a second copy of the same rule.
--
-- Cascade on the connection: a deleted account cannot keep granting anything.
-- No FK to core.agents — agent rows live in another schema and a grant for an
-- agent that has since been removed is inert, not corrupt (the clamp matches on
-- the acting agent's id, and nothing acts as a deleted agent).

create table if not exists module_connections.connection_agent_grants (
  connection_id uuid not null
    references module_connections.connections(id) on delete cascade,
  agent_id uuid not null,
  granted_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (connection_id, agent_id)
);

create index if not exists idx_module_connections_agent_grants_agent
  on module_connections.connection_agent_grants (agent_id);

alter table module_connections.connection_agent_grants enable row level security;

-- Server lane: same shape as connection_action_policies (20260809210000) —
-- a tenantless child reached through its parent's tenant. The generator only
-- covers tables carrying tenant_id, so without this the table is unreachable
-- rather than unprotected.
grant select, insert, update, delete
  on module_connections.connection_agent_grants to engenty_server;

-- The maintenance lane too: the module_connections schema has no default
-- privileges (only a one-shot grant back in 20260704090000), so a new table
-- gets service_role nothing — which check:grants-coverage flags on a fresh
-- DB. service_role bypasses RLS anyway; this adds reach for maintenance
-- scripts, not exposure beyond what every sibling table already grants.
grant select, insert, update, delete
  on module_connections.connection_agent_grants to service_role;

alter default privileges in schema module_connections
  grant select, insert, update, delete on tables to service_role;

drop policy if exists srv_tenant_isolation
  on module_connections.connection_agent_grants;

create policy srv_tenant_isolation
  on module_connections.connection_agent_grants
  as permissive for all to engenty_server
  using (
    exists (
      select 1 from module_connections.connections c
      where c.id = connection_agent_grants.connection_id
        and c.tenant_id = (select core.current_tenant_id())
    )
  )
  with check (
    exists (
      select 1 from module_connections.connections c
      where c.id = connection_agent_grants.connection_id
        and c.tenant_id = (select core.current_tenant_id())
    )
  );

notify pgrst, 'reload schema';
