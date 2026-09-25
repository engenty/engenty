-- Agents no longer bind to a model purpose. An unpinned agent runs on its
-- effort tier's graded model, else the tenant's chat model; the router,
-- research, planning_coding and safeguard tiers the column pointed at are
-- gone. The check constraint goes with the column.
alter table ai.engenty_ai_agents
  drop column purpose;
