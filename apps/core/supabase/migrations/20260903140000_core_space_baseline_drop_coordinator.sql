-- Retire the Coordinator as a space being. Copilot remains the personal
-- assistant (dock); spaces list Engenties, not a dispatcher agent.
--
-- 1. Redefine the space baseline without agent:engenty.coordinator.
-- 2. Drop existing required mounts so spaces do not keep a dead agent.

create or replace function core.space_baseline_mounts()
returns table (
  resource_type text,
  resource_key text,
  record_scope text,
  agent_access text
)
language sql
immutable
as $$
  select 'module'::text, 'engenty-copilot'::text, null::text, 'none'::text
  union all
  select 'module'::text, 'tasks'::text, null::text, 'write'::text
  union all
  select 'module'::text, 'files'::text, null::text, 'write'::text
  union all
  select 'module'::text, 'connections'::text, null::text, 'write'::text
  union all
  select 'agent'::text, 'engenty.copilot'::text, null::text, null::text
  union all
  select 'agent'::text, 'engenty.cli'::text, null::text, null::text
  union all
  select 'agent'::text, 'engenty.file-analyst'::text, null::text, null::text
$$;

grant execute on function core.space_baseline_mounts() to engenty_server, authenticated, service_role;

delete from core.space_mount
where resource_type = 'agent'
  and resource_key = 'engenty.coordinator';
