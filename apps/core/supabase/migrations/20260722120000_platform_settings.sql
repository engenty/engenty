-- core.platform_settings: DB-backed store for platform-wide config/credentials
-- and per-tenant credential overrides. Holds BOTH scopes in one table so the
-- settings resolver (@engenty/platform-settings) reads a single place with env
-- as the final fallback.
--
-- SECURITY: this table can hold decryptable secrets (value_enc, AES-256-GCM,
-- AAD-bound to scope|tenant|name). It is therefore SERVICE-ROLE ONLY — no grant
-- to `authenticated`, and deliberately NOT added to supabase_realtime — unlike
-- core.tenant_settings, which is authenticated-readable and realtime-published
-- and must never hold ciphertext. Every read/write goes through core API authz
-- (platform rows: platform superadmin; tenant rows: tenant admin, own tenant).

create table if not exists core.platform_settings (
  scope         text not null check (scope in ('platform', 'tenant')),
  tenant_id     uuid references core.tenants(id) on delete cascade,
  name          text not null,
  type          text not null
                check (type in ('string', 'numeric', 'boolean', 'json', 'secret')),
  value_string  text,
  value_jsonb   jsonb,
  value_numeric numeric,
  value_boolean boolean,
  value_enc     text,
  dek_id        uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  constraint platform_settings_scope_tenant_consistency check (
    (scope = 'platform' and tenant_id is null)
    or (scope = 'tenant' and tenant_id is not null)
  ),
  constraint platform_settings_value_consistency check (
    (type = 'string' and value_string is not null)
    or (type = 'numeric' and value_numeric is not null)
    or (type = 'boolean' and value_boolean is not null)
    or (type = 'json' and value_jsonb is not null)
    or (type = 'secret' and value_enc is not null)
  )
);

-- Platform rows are singletons per name; tenant rows unique per (tenant, name).
-- Partial unique indexes correctly ignore the NULL tenant_id of platform rows
-- (a plain unique constraint would treat every NULL as distinct).
create unique index if not exists platform_settings_platform_name
  on core.platform_settings (name)
  where scope = 'platform';

create unique index if not exists platform_settings_tenant_name
  on core.platform_settings (tenant_id, name)
  where scope = 'tenant';

create index if not exists idx_platform_settings_tenant
  on core.platform_settings (tenant_id)
  where scope = 'tenant';

grant select, insert, update, delete on core.platform_settings to service_role;

-- RLS on with NO permissive policies → default-deny for every non-service role.
-- Belt-and-suspenders: there is also no grant to authenticated in the first place.
alter table core.platform_settings enable row level security;
