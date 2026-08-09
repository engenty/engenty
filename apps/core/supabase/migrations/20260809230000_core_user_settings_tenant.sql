-- Tenant-ize core.user_settings (Phase A, PLAN-tenant-isolation-a-rls-seam.md WP5).
--
-- The table was user-keyed only (user_id, name), so the fail-closed engenty_server
-- generator gave the tenant lane no grants — user settings were unreachable from
-- the server lane. Every user belongs to exactly one tenant (core.users.tenant_id),
-- so the tenant stamp is derivable and the composite FK below keeps it from ever
-- drifting from the owning user's tenant. Browser policies (user_id = sub) are
-- untouched; the server lane gets the standard tenant wall, with per-user scoping
-- remaining code-enforced belt (the repo filters user_id on every query).
--
-- Idempotent: guarded column add, drop-policy-first, re-grants.

alter table core.user_settings
  add column if not exists tenant_id uuid references core.tenants(id) on delete cascade;

update core.user_settings us
set tenant_id = u.tenant_id
from core.users u
where us.user_id = u.id and us.tenant_id is null;

-- Rows whose user vanished cannot exist (user_id FK), so this only guards a
-- half-applied earlier run.
delete from core.user_settings where tenant_id is null;

alter table core.user_settings alter column tenant_id set not null;

-- Composite-FK recipe (same as the kb join-table tenant-izing): the stamped
-- tenant must be the owning user's tenant, enforced by the database.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_id_tenant_key' and conrelid = 'core.users'::regclass
  ) then
    alter table core.users add constraint users_id_tenant_key unique (id, tenant_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_settings_user_tenant_fkey'
      and conrelid = 'core.user_settings'::regclass
  ) then
    alter table core.user_settings
      add constraint user_settings_user_tenant_fkey
      foreign key (user_id, tenant_id) references core.users (id, tenant_id)
      on delete cascade;
  end if;
end
$$;

create index if not exists idx_core_user_settings_tenant
  on core.user_settings (tenant_id);

grant select, insert, update, delete on core.user_settings to engenty_server;

drop policy if exists srv_tenant_isolation on core.user_settings;
create policy srv_tenant_isolation on core.user_settings
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

notify pgrst, 'reload schema';
