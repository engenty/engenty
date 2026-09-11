alter table ai.engenty_ai_agents
  add column if not exists agent_scope text not null default 'shared';

alter table ai.engenty_ai_agents
  drop constraint if exists engenty_ai_agents_agent_scope_check;

alter table ai.engenty_ai_agents
  add constraint engenty_ai_agents_agent_scope_check
  check (agent_scope in ('personal', 'shared'));
