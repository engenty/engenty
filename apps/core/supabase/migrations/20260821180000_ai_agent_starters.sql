-- Empty-state composer chips declared on a database agent.
-- Same shape as AgentConfig.starters (id, label, prompt, optional locales/when).
-- Module agents keep theirs in agent.json; this column is the DB-agent rail.

alter table ai.engenty_ai_agents
  add column if not exists starters jsonb not null default '[]'::jsonb;
