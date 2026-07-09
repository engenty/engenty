-- Phase 4 — goal-scoped approval grants. When a human approves an agent
-- operation that exceeds the agent's role grants, the approval is bound to the
-- GOAL the agent is pursuing (not written back onto the agent's role). It lives
-- and dies with the goal, so the elevation never leaks into the agent's other
-- work. Effective agent capability = agent role grants ∪ goal grants.
create table if not exists core.agent_goal_grants (
  id          uuid primary key default uuidv7(),
  tenant_id   uuid not null references core.tenants(id) on delete cascade,
  goal_id     text not null,          -- the objective the run is executing
  agent_id    uuid,                   -- agent the grant was issued to (null = any agent on this goal)
  capability  text not null,          -- concrete capability approved (no wildcards)
  granted_by  uuid,                   -- approving user
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,            -- optional backstop TTL; goal completion also reaps
  constraint agent_goal_grants_unique
    unique nulls not distinct (tenant_id, goal_id, agent_id, capability)
);

create index if not exists agent_goal_grants_lookup_idx
  on core.agent_goal_grants (tenant_id, goal_id, agent_id);

alter table core.agent_goal_grants enable row level security;
create policy agent_goal_grants_select on core.agent_goal_grants for select
  using (tenant_id = core.current_tenant_id());

grant select on core.agent_goal_grants to authenticated;
grant select, insert, update, delete on core.agent_goal_grants to service_role;
