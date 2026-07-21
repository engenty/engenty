-- Goal ownership by agent type key (agent coordination).
--
-- goals.owner_agent_id is a uuid FK to ai.engenty_ai_agents, but built-in
-- agents (like engenty.coordinator) are code-defined and have NO row there —
-- so that column can never reference them. owner_agent_type_key holds the
-- agent's stable type key (e.g. 'engenty.coordinator') instead, which is what
-- the "Hand to Coordinator" handoff sets and what the coordinator uses to tell
-- the goals it owns apart from human-led ones.
alter table module_tasks.goals
  add column if not exists owner_agent_type_key text;

create index if not exists idx_module_tasks_goals_owner_agent_type_key
  on module_tasks.goals (tenant_id, owner_agent_type_key)
  where owner_agent_type_key is not null;
