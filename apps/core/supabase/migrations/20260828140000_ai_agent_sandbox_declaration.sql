-- Let a registered specialist declare its sandbox.
--
-- Every registered agent's workspace came from one hardcoded default, so an
-- agent that needed the network to install a package or call an API had no way
-- to say so — the declaration surface simply did not exist for anything created
-- through `agent_propose`. This column is that surface: the sandbox slice of
-- the workspace declaration, merged over the default at read time.
--
-- Only the sandbox slice. The preset (which mounts an agent gets) stays derived
-- from `agent_scope`, because that is platform policy about what an agent may
-- see, not a request an agent gets to make about itself.
--
-- Null means "the default", which is what every existing row wants.

alter table ai.engenty_ai_agents
  add column if not exists sandbox jsonb;

comment on column ai.engenty_ai_agents.sandbox is
  'Sandbox slice of the agent workspace declaration (lifecycle, network tier, timeout). Null = platform default. `requireApproval` is not honoured from here: unattended execution comes from an approval grant, never from an agent describing itself.';
