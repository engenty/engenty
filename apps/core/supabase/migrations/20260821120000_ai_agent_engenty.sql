-- Visual character (engenty silhouette) for the agent start header.
-- Null = hash the agent id. Kinds match ui-core ENGENTY_KINDS.
alter table ai.engenty_ai_agents
  add column if not exists engenty text;

alter table ai.engenty_ai_agents
  drop constraint if exists engenty_ai_agents_engenty_check;

alter table ai.engenty_ai_agents
  add constraint engenty_ai_agents_engenty_check
    check (engenty is null or engenty in (
      'round', 'drop', 'dome', 'flame', 'oval',
      'bean', 'pebble', 'sprout', 'tower', 'wedge'
    ));
