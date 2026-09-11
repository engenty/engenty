-- The platform sub-agents (CLI runner, file analyst) are space substrate the
-- same way copilot and coordinator are: every space's specialists delegate to
-- them, so a space without the mounts has a silently smaller toolbox. Seeded
-- as baseline — added, not chosen; refused by the removal path.

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
  -- Chat: a mounted app like any other, not a special case in the schema.
  -- `none` because the copilot module holds no records of its own — the chat
  -- agent's reach comes from the OTHER modules mounted in the space.
  select 'module'::text, 'engenty-copilot'::text, null::text, 'none'::text
  union all
  -- Plan: write, because this module holds the space's work records and the
  -- space's agents act on them.
  select 'module'::text, 'tasks'::text, null::text, 'write'::text
  union all
  -- Files: the space Data tab's Files/ root. Agents write there.
  select 'module'::text, 'files'::text, null::text, 'write'::text
  union all
  -- Memory: agents' learning layer for the space.
  select 'module'::text, 'memory'::text, null::text, 'write'::text
  union all
  -- Connections: account substrate other modules require. Specific accounts
  -- are still chosen per space; this mount is the module itself.
  select 'module'::text, 'connections'::text, null::text, 'write'::text
  union all
  select 'agent'::text, 'engenty.copilot'::text, null::text, null::text
  union all
  select 'agent'::text, 'engenty.coordinator'::text, null::text, null::text
  union all
  -- Platform sub-agents every specialist may delegate to.
  select 'agent'::text, 'engenty.cli'::text, null::text, null::text
  union all
  select 'agent'::text, 'engenty.file-analyst'::text, null::text, null::text
$$;

grant execute on function core.space_baseline_mounts() to engenty_server, authenticated, service_role;

-- Backfill: every existing space, including personal ones and Company.
insert into core.space_mount (
  tenant_id, space_id, resource_type, resource_key,
  record_scope, agent_access, is_required
)
select s.tenant_id, s.id, b.resource_type, b.resource_key,
       b.record_scope, b.agent_access, true
from core.spaces s
cross join core.space_baseline_mounts() b
on conflict (tenant_id, space_id, resource_type, resource_key)
do update set is_required = true;
