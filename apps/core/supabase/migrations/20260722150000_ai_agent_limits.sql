-- Per-agent operational limits (governance).
--
-- A per-agent dial layered over the global/tenant defaults. Currently holds
-- `max_steps` (the reasoning-iteration cap per run); apps/ai reads it in
-- resolveAgentMaxSteps and clamps to the hard ceiling (60). Persisted as JSON
-- alongside `guardrails` so the shape can grow without further migrations.

alter table ai.engenty_ai_agents
  add column if not exists limits jsonb not null default '{}'::jsonb;
