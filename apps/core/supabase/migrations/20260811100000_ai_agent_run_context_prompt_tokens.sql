-- Separate "what the run was billed on" from "how full the context window got".
--
-- `ai.agent_run.prompt_tokens` holds the run's TOTAL input across every step of
-- its agentic loop. That is the right number for billing and for the run feed,
-- and the wrong one for the context meter: a turn that called three tools sends
-- the whole prompt four times, so the sum reads as ~4× the window occupancy the
-- meter renders it as ("31.3k / 1M").
--
-- The window figure is the LAST step's input — the prompt the model most
-- recently actually saw. Recorded here instead of overloading prompt_tokens, so
-- every existing reader (run feed, usage_json) keeps its meaning.
--
-- Nullable on purpose: rows written before this column, and lanes that cannot
-- observe per-step usage, leave it null and the meter falls back to
-- prompt_tokens exactly as it did before.
alter table ai.agent_run
  add column if not exists context_prompt_tokens bigint;

comment on column ai.agent_run.context_prompt_tokens is
  'Input tokens of the run''s LAST step — context-window occupancy at the end of the run. Null = unknown; readers fall back to prompt_tokens (which is the sum across all steps).';
