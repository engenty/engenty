-- Plan is a plugin-contributed space tab (tasks.registerSpaceTab), not host
-- chrome. Trigger-created spaces — Company (`ensure_default_space`) and every
-- personal space (`ensure_personal_space`) — never see a template, so they
-- only ever received the copilot baseline. Existing task rows were backfilled
-- into Company with no matching mount, which is why those dashboards had a
-- Plan tab (hardcoded) and no briefing (mount-gated).
--
-- Seeding tasks here makes the mount exist wherever a space exists. The tab
-- strip still only renders Plan when the plugin is enabled AND this row is
-- present — the two halves of "tasks as a plugin".

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
  select 'agent'::text, 'engenty.copilot'::text, null::text, null::text
  union all
  select 'agent'::text, 'engenty.coordinator'::text, null::text, null::text
$$;

grant execute on function core.space_baseline_mounts() to engenty_server, authenticated, service_role;

-- Backfill: every existing space, including personal ones and Company.
-- `is_required` is forced true on an existing row so a tasks mount added by
-- hand earlier becomes non-removable now, matching the other baseline entries.
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
