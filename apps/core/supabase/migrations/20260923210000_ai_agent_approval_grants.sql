-- Standing approvals on an agent ("Für diesen Agent erlauben").
--
-- One row = this agent may run this exact operation without asking again, in
-- any user's chat and in its routines and tasks. The operation id is the same
-- grant id the approval gates key on — a module operation id, or a workspace
-- call such as `workspace:mastra_workspace_execute_command:<command>`.

create table ai.agent_approval_grants (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid not null references core.tenants (id) on delete cascade,
  agent_id text not null,
  operation_id text not null,
  granted_by uuid,
  created_at timestamptz not null default now(),
  constraint agent_approval_grants_unique unique (tenant_id, agent_id, operation_id)
);

comment on table ai.agent_approval_grants is
  'Operations an agent may run without asking, approved by a person from an approval card.';
comment on column ai.agent_approval_grants.agent_id is
  'Registry agent key (ai.engenty_ai_agents.agent_id, or a built-in agent id).';
comment on column ai.agent_approval_grants.operation_id is
  'Exact grant id the gate checks: a module operation id or workspace:<tool>:<target>.';

alter table ai.agent_approval_grants enable row level security;

grant select, insert, update, delete on ai.agent_approval_grants to engenty_server;
grant select, insert, update, delete on ai.agent_approval_grants to service_role;

create policy srv_tenant_isolation on ai.agent_approval_grants
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));
