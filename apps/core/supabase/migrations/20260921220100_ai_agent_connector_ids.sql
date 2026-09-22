-- Preferred connector ids on an agent (marketplace Phase 1).
--
-- Empty = use every plugin enabled on the active space (plus this agent's
-- personal accounts). Non-empty = intersection of that list with the space,
-- plus the agent's granted (personal) accounts.

ALTER TABLE ai.engenty_ai_agents
  ADD COLUMN IF NOT EXISTS connector_ids jsonb DEFAULT '[]'::jsonb NOT NULL;

COMMENT ON COLUMN ai.engenty_ai_agents.connector_ids IS
  'Preferred connector ids for this agent. Empty = all plugins enabled on the active space.';
