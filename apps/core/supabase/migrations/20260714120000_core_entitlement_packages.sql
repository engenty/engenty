-- Commercial-package entitlements (docs/wip/manage-app.md §7.2).
-- `core.packages` mirrors the authored `@engenty/entitlements` catalog, synced
-- at boot with a version-based upsert (like ai.model_pricing seeds). A tenant
-- references one package (`core.tenants.package_id`) plus an optional sparse
-- per-tenant delta (`core.tenant_entitlement_overrides`). The resolver composes
-- package -> override into resolved entitlements that feed the existing
-- enforcement points (plugin effective-state, feature flags, AI usage policy,
-- seat limits).

create table if not exists core.packages (
  id text primary key,
  version integer not null default 1,
  label text not null,
  -- string[] module allow-list, or null = no package restriction (all allowed).
  modules jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  ai_usage_policy jsonb not null,
  app_limits jsonb not null,
  updated_at timestamptz not null default now()
);

alter table core.tenants
  add column if not exists package_id text
    references core.packages(id) on delete set null;

create index if not exists tenants_package_id_idx
  on core.tenants(package_id);

-- One sparse override blob per tenant (JSON deltas over the assigned package).
create table if not exists core.tenant_entitlement_overrides (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  override jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id)
);

grant select, insert, update, delete on table core.packages to service_role;
grant select, insert, update, delete
  on table core.tenant_entitlement_overrides to service_role;

comment on table core.packages is
  'Synced mirror of the authored @engenty/entitlements catalog (pro-only).';
comment on column core.tenants.package_id is
  'Assigned commercial package; composed with tenant_entitlement_overrides.';
