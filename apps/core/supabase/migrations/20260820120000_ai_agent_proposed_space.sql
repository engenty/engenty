-- Intended space for a coordinator-proposed agent. Set on new proposals only;
-- cleared when the proposal is approved (the mount on core.space_mount is then
-- the source of truth). Revisions to active agents leave this null.
alter table ai.engenty_ai_agents
  add column if not exists proposed_space_id uuid;
