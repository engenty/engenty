-- Declared classification for hired/DB agents (PLAN-mounted-engentys T1.3).
-- `kind` mirrors AgentConfig.kind; `module_id` records module ownership for
-- rows a module writer creates. Interface agents are platform-placed, never
-- hired, so the propose lane refuses `interface` at the API — the CHECK here
-- documents the vocabulary, not that policy.
alter table ai.engenty_ai_agents
  add column if not exists module_id text,
  add column if not exists kind text not null default 'specialist';

alter table ai.engenty_ai_agents
  drop constraint if exists engenty_ai_agents_kind_check;
alter table ai.engenty_ai_agents
  add constraint engenty_ai_agents_kind_check
  check (kind in ('interface', 'specialist', 'delegated', 'chat_surface'));
