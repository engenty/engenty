-- Company (is_default) is Files + Connections, not Copilot. Chat lives on
-- the personal desk and on spaces created later. seed_space_baseline_mounts
-- still seeds Copilot on every non-default space.

create or replace function core.seed_space_baseline_mounts() returns trigger
  language plpgsql
  security definer
  set search_path to 'core', 'public'
as $$
begin
  -- SECURITY DEFINER: this fires inside tenant creation too, where the server
  -- lane's `core.current_tenant_id()` is not yet set and the RLS write policy
  -- on space_mount would refuse the insert.
  insert into core.space_mount (
    tenant_id, space_id, resource_type, resource_key,
    record_scope, agent_access, is_required
  )
  select new.tenant_id, new.id, b.resource_type, b.resource_key,
         b.record_scope, b.agent_access, true
  from core.space_baseline_mounts() b
  where not (
    new.is_default
    and (
      (b.resource_type = 'module' and b.resource_key = 'engenty-copilot')
      or (b.resource_type = 'agent' and b.resource_key = 'engenty.copilot')
    )
  )
  on conflict (tenant_id, space_id, resource_type, resource_key) do nothing;
  return new;
end
$$;

revoke all on function core.seed_space_baseline_mounts() from public;

-- Installs that already seeded Copilot onto Company: drop those rows. Personal
-- and later spaces keep theirs.
delete from core.space_mount sm
using core.spaces s
where sm.space_id = s.id
  and sm.tenant_id = s.tenant_id
  and s.is_default
  and (
    (sm.resource_type = 'module' and sm.resource_key = 'engenty-copilot')
    or (sm.resource_type = 'agent' and sm.resource_key = 'engenty.copilot')
  );
