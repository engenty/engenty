-- Copilot is baseline on every space, including Company. Chat in a space
-- needs the module and the engenty.copilot agent; omitting them from the
-- default space blocked adding other apps (the setup write requires the
-- full baseline) and left Company without a working space copilot.

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
  on conflict (tenant_id, space_id, resource_type, resource_key) do nothing;
  return new;
end
$$;

revoke all on function core.seed_space_baseline_mounts() from public;

-- Spaces that lost Copilot when Company skipped it, or never had the rows:
-- put the module and agent back, required.
insert into core.space_mount (
  tenant_id, space_id, resource_type, resource_key,
  record_scope, agent_access, is_required
)
select s.tenant_id, s.id, b.resource_type, b.resource_key,
       b.record_scope, b.agent_access, true
from core.spaces s
cross join core.space_baseline_mounts() b
where
  (b.resource_type = 'module' and b.resource_key = 'engenty-copilot')
  or (b.resource_type = 'agent' and b.resource_key = 'engenty.copilot')
on conflict (tenant_id, space_id, resource_type, resource_key)
do update set is_required = true;
