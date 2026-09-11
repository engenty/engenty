-- Tasks leaves the space baseline.
--
-- A space is chat, files and connections. Whether it also plans work is the
-- space's own choice: the create wizard features Tasks (preselected, removable)
-- and a space can add or drop it later like any other module.
--
-- 1. Redefine the baseline without module:tasks.
-- 2. Existing tasks mounts STAY — the spaces keep their work — but stop being
--    required, so the removal path accepts them from now on.
-- 3. Company keeps Tasks by default: the tenant trigger seeds a
--    non-required tasks mount after the baseline. Personal spaces get none.

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

update core.space_mount
set is_required = false
where resource_type = 'module'
  and resource_key = 'tasks'
  and is_required;

-- Company is trigger-made and never sees a template, so its default modules
-- are seeded here. The baseline trigger (`spaces_seed_baseline_mounts`) has
-- already fired inside the space insert by the time this insert runs.
-- `is_required = false`: a default, not a mandate.
create or replace function core.ensure_default_space()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_space_id uuid;
begin
  insert into core.spaces (tenant_id, key, name, is_default)
  values (new.id, 'company', 'Company', true)
  on conflict do nothing
  returning id into v_space_id;
  if v_space_id is not null then
    insert into core.space_mount (
      tenant_id, space_id, resource_type, resource_key,
      record_scope, agent_access, is_required
    )
    values (new.id, v_space_id, 'module', 'tasks', null, 'write', false)
    on conflict (tenant_id, space_id, resource_type, resource_key) do nothing;
  end if;
  return new;
end
$$;

revoke all on function core.ensure_default_space() from public;

notify pgrst, 'reload schema';
