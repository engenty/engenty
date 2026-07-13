-- Satellite tenant registry (docs/wip/manage-app.md §7.1, tenancy-spec Tier B).
-- A satellite is a per-tenant self-hosted stack (own supabase + apps/ai + custom
-- modules). The manage app tracks each satellite's service endpoints, a
-- reference to its credentials (never the secret itself), a pinned image
-- version, and the last health probe. The Management-API-shaped facade and
-- provisioning/lifecycle land on top of this registry later.

create table if not exists core.satellites (
  id uuid primary key default public.uuidv7(),
  -- The platform tenant this satellite was migrated from / belongs to (nullable
  -- for standalone satellites).
  tenant_id uuid references core.tenants(id) on delete set null,
  name text not null,
  slug text not null unique,
  status text not null default 'provisioning'
    check (status in ('provisioning', 'active', 'suspended', 'error', 'archived')),
  -- Service endpoints the manage app / facade talk to:
  -- { studioUrl, apiUrl, gotrueUrl, storageUrl, postgresMetaUrl }.
  endpoints jsonb not null default '{}'::jsonb,
  -- Reference (id/path) to credentials in the secrets backend — NOT the secret.
  credential_ref text,
  pinned_version text,
  -- Last health probe: { status, checkedAt, detail }.
  health jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists satellites_tenant_idx on core.satellites(tenant_id);

grant select, insert, update, delete on table core.satellites to service_role;

comment on table core.satellites is
  'Registry of per-tenant satellite stacks (Tier B); endpoints + health, secrets by reference only.';
