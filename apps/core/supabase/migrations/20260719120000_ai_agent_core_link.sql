-- Link AI-plane agent definitions to their core security principal.
-- Grants (core.agent_goal_grants, module secret_grants) key on core.agents(id)
-- uuid, while the AI registry keys on a text agent_id — this mapping column is
-- the single source of truth between the two. Provisioned by the AI plane on
-- registry upsert; FK keeps grants from pointing at a deleted principal.
alter table ai.engenty_ai_agents
  add column if not exists core_agent_id uuid
    references core.agents(id) on delete set null;

-- Builtin agents (e.g. engenty.copilot) have no ai registry row, so their
-- principal is found-or-created by (tenant, name); the unique index makes that
-- upsert race-safe. core.agents was never provisioned before this migration,
-- so no existing rows can violate it.
create unique index if not exists agents_tenant_name_key
  on core.agents (tenant_id, name);

create index if not exists engenty_ai_agents_core_agent_idx
  on ai.engenty_ai_agents (core_agent_id)
  where core_agent_id is not null;
