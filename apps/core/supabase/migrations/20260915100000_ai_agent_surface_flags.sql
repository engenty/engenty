-- Per-agent surface flags on the registry row.
--
-- ui_tools: may this Engenty drive the person's screen from a chat surface
--   (navigate, dialogs, focus, guided tour, browser-use)? 'auto' = the
--   Space's coordinator gets them, other Engenties do not; 'on'/'off' decide
--   outright. Only a browser-started run ever carries the tools, whatever the
--   flag says.
--
-- remote_enabled / remote_handle: reachable from a channel (Slack, Telegram)
--   as ITSELF — a bound channel or `@handle` routes the turn to this agent,
--   assembled with its own tools and memory. Off by default.

ALTER TABLE ai.engenty_ai_agents
  ADD COLUMN IF NOT EXISTS ui_tools text DEFAULT 'auto' NOT NULL,
  ADD COLUMN IF NOT EXISTS remote_enabled boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS remote_handle text;

ALTER TABLE ai.engenty_ai_agents
  DROP CONSTRAINT IF EXISTS engenty_ai_agents_ui_tools_check;
ALTER TABLE ai.engenty_ai_agents
  ADD CONSTRAINT engenty_ai_agents_ui_tools_check
  CHECK (ui_tools = ANY (ARRAY['auto'::text, 'on'::text, 'off'::text]));

ALTER TABLE ai.engenty_ai_agents
  DROP CONSTRAINT IF EXISTS engenty_ai_agents_remote_handle_check;
ALTER TABLE ai.engenty_ai_agents
  ADD CONSTRAINT engenty_ai_agents_remote_handle_check
  CHECK (remote_handle IS NULL OR remote_handle ~ '^[a-z0-9][a-z0-9_-]{0,31}$');

-- A handle names one agent per tenant; the front door parses `@handle`.
CREATE UNIQUE INDEX IF NOT EXISTS uq_engenty_ai_agents_remote_handle
  ON ai.engenty_ai_agents (tenant_id, remote_handle)
  WHERE remote_handle IS NOT NULL;

COMMENT ON COLUMN ai.engenty_ai_agents.ui_tools IS
  'Frontend (screen-driving) tools on chat surfaces: auto = coordinator only, on, off. Browser-started runs only.';
COMMENT ON COLUMN ai.engenty_ai_agents.remote_enabled IS
  'Reachable from remote channels as itself (bound channel or @handle). Default off.';
COMMENT ON COLUMN ai.engenty_ai_agents.remote_handle IS
  'Short channel handle (@handle, /to handle). Null = last segment of agent_id.';
