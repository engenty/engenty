-- An agent without a model runs on its effort tier's role binding
-- (ai.model_binding). Module and function agents never carry one, and new
-- agents are no longer pinned to a default model.
alter table ai.engenty_ai_agents alter column model drop not null;
