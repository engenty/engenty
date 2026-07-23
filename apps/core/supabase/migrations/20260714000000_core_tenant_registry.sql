-- Tenant registry columns for the manage app (docs/internal/manage-app.md WP2).
-- `tier` supersedes `tenant_connection_mode` (kept one release for rollback);
-- `status` drives suspend/archive lifecycle actions in the manage console.

alter table core.tenants
  add column if not exists tier text not null default 'platform',
  add column if not exists status text not null default 'active';

alter table core.tenants
  add constraint tenants_tier_check
    check (tier in ('platform', 'satellite')),
  add constraint tenants_status_check
    check (status in ('active', 'suspended', 'provisioning', 'archived'));

update core.tenants
  set tier = 'satellite'
  where tenant_connection_mode = 'dedicated_instance';

comment on column core.tenants.tier is
  'Tenancy tier per docs/internal/tenancy-spec.md; supersedes tenant_connection_mode (kept one release for rollback).';
