-- Phase 0.1 — backfill core.user_tenant_roles as the single membership source.
-- Some users only carry core.users.tenant_id (their primary tenant) without a
-- join row. Everything in the authz-roles plan FKs/reads against
-- user_tenant_roles, so ensure every tenant user has a membership row.
insert into core.user_tenant_roles (user_id, tenant_id, role)
select
  u.id,
  u.tenant_id,
  case
    when nullif(u.role, '') = 'admin' then 'admin'
    else 'member'
  end as role
from core.users u
where u.tenant_id is not null
on conflict (user_id, tenant_id) do nothing;
