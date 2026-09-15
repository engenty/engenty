-- The first (Company) space is baseline only: Copilot, Files, Connections.
-- Tasks is a module a space chooses later — it is not seeded on tenant create.

create or replace function core.ensure_default_space() returns trigger
  language plpgsql
  security definer
  set search_path to 'core', 'public'
as $$
begin
  insert into core.spaces (tenant_id, key, name, is_default)
  values (new.id, 'company', 'Company', true)
  on conflict do nothing;
  return new;
end
$$;

revoke all on function core.ensure_default_space() from public;

-- Installs that already ran the old trigger: drop the auto-seeded, removable
-- tasks mount from the default Company space. Spaces that added Tasks on
-- purpose later still have it if they are not the default space.
delete from core.space_mount sm
using core.spaces s
where sm.space_id = s.id
  and sm.tenant_id = s.tenant_id
  and s.is_default
  and sm.resource_type = 'module'
  and sm.resource_key = 'tasks'
  and sm.is_required is not true;
