-- Secrets Vault module: client-anchored secrets/password manager + paid-services
-- registry. Payloads are AES-256-GCM encrypted app-side (SECRETS_ENC_KEY in
-- phase 1; per-tenant DEK + KMS in phase 2) and only ever decrypted server-side.
-- RLS policies never expose *_enc columns to authenticated (column grants below).
-- Mirrors module_connections conventions. See docs/wip/secrets-vault-module.md.

create schema if not exists module_secrets;

-- ── per-tenant data keys (envelope; phase 2). Created first: secrets.dek_id FKs it.
create table if not exists module_secrets.data_keys (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants(id) on delete cascade,
  version      int  not null,
  wrapped_dek  text not null,      -- DEK wrapped by KMS master (opaque)
  kms_key_ref  text,               -- which KMS master wrapped it
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (tenant_id, version)
);

-- ── secrets ────────────────────────────────────────────────────────────────
create table if not exists module_secrets.secrets (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants(id) on delete cascade,
  scope_id     text not null,                       -- core.has_scope() partition
  owner_scope  text not null check (owner_scope in ('user','project','client','tenant')),
  owner_id     text not null,                       -- user uuid | project uuid | contact id (text) | tenant uuid
  name         text not null,
  kind         text not null check (kind in
                 ('username_password','api_key','key_list','credit_card','note')),
  url          text,
  description  text,
  payload_enc  text not null,                       -- AES-256-GCM iv.ct.tag (base64); AAD-bound to id+owner
  dek_id       uuid references module_secrets.data_keys(id),  -- null = static-key path (phase 1)
  created_by   uuid references core.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_secrets_owner
  on module_secrets.secrets (tenant_id, owner_scope, owner_id) where deleted_at is null;
create index if not exists idx_secrets_scope
  on module_secrets.secrets (tenant_id, scope_id, updated_at desc);

-- ── associations (many-to-many to projects) ─────────────────────────────────
create table if not exists module_secrets.secret_projects (
  tenant_id  uuid not null references core.tenants(id) on delete cascade,
  secret_id  uuid not null references module_secrets.secrets(id) on delete cascade,
  project_id uuid not null,
  primary key (secret_id, project_id)
);

-- ── explicit principal grants (durable, non-goal); mirrors role_assignments ──
create table if not exists module_secrets.secret_grants (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants(id) on delete cascade,
  secret_id   uuid not null references module_secrets.secrets(id) on delete cascade,
  user_id     uuid,
  agent_id    uuid,
  access      text not null default 'read' check (access in ('read')),
  granted_by  uuid references core.users(id) on delete set null,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  check ((user_id is null) <> (agent_id is null)),
  unique nulls not distinct (secret_id, user_id, agent_id)
);
create index if not exists idx_secret_grants_lookup
  on module_secrets.secret_grants (tenant_id, secret_id);

-- ── paid services / subscriptions registry ───────────────────────────────────
create table if not exists module_secrets.services (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenants(id) on delete cascade,
  scope_id          text not null,
  owner_scope       text not null check (owner_scope in ('client','tenant')),
  owner_id          text not null,
  name              text not null,
  url               text,
  description       text,
  cost_amount       numeric(14,2),
  cost_currency     text,
  cost_period       text check (cost_period in ('monthly','yearly','once')),
  next_billing_date date,
  billing_email     text,
  paid_via          text,
  connection_id     uuid,          -- SOFT link to module_connections.connections (no FK; R7)
  status            text not null default 'active' check (status in ('active','cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create table if not exists module_secrets.service_secrets (
  service_id uuid not null references module_secrets.services(id) on delete cascade,
  secret_id  uuid not null references module_secrets.secrets(id) on delete cascade,
  primary key (service_id, secret_id)
);

-- ── audit: every reveal / decrypt-for-agent ──────────────────────────────────
create table if not exists module_secrets.access_log (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants(id) on delete cascade,
  secret_id      uuid not null,
  principal_id   text not null,
  principal_kind text not null check (principal_kind in ('user','agent')),
  action         text not null check (action in ('reveal','copy','decrypt_for_agent')),
  goal_id        text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_secrets_access_log
  on module_secrets.access_log (tenant_id, secret_id, created_at desc);

-- ── updated_at trigger (mirrors other module schemas) ────────────────────────
create or replace function module_secrets.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_secrets_updated_at on module_secrets.secrets;
create trigger trg_secrets_updated_at before update on module_secrets.secrets
  for each row execute function module_secrets.set_updated_at();
drop trigger if exists trg_services_updated_at on module_secrets.services;
create trigger trg_services_updated_at before update on module_secrets.services
  for each row execute function module_secrets.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table module_secrets.data_keys       enable row level security;
alter table module_secrets.secrets         enable row level security;
alter table module_secrets.secret_projects enable row level security;
alter table module_secrets.secret_grants   enable row level security;
alter table module_secrets.services        enable row level security;
alter table module_secrets.service_secrets enable row level security;
alter table module_secrets.access_log      enable row level security;

-- Coarse row visibility = tenant + scope. Whether a member may reveal a specific
-- secret is refined server-side in resolve.ts (owner_scope membership). See R2/R9.
create policy secrets_read on module_secrets.secrets for select
  using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));
create policy services_read on module_secrets.services for select
  using (tenant_id = core.current_tenant_id() and core.has_scope(scope_id));
create policy secret_projects_read on module_secrets.secret_projects for select
  using (tenant_id = core.current_tenant_id());
create policy secret_grants_read on module_secrets.secret_grants for select
  using (tenant_id = core.current_tenant_id());
create policy service_secrets_read on module_secrets.service_secrets for select
  using (
    exists (select 1 from module_secrets.services s
            where s.id = service_id and s.tenant_id = core.current_tenant_id())
  );
create policy access_log_read on module_secrets.access_log for select
  using (tenant_id = core.current_tenant_id());
-- data_keys: no authenticated policy at all (service-role only).

-- ── Grants: writes service-role only; reads column-limited (NO *_enc) ────────
grant usage on schema module_secrets to service_role;
grant select, insert, update, delete on all tables in schema module_secrets to service_role;

grant usage on schema module_secrets to authenticated;
-- CRITICAL: payload_enc is intentionally absent from this column list.
grant select (
  id, tenant_id, scope_id, owner_scope, owner_id, name, kind, url, description,
  dek_id, created_by, created_at, updated_at, deleted_at
) on module_secrets.secrets to authenticated;
grant select on module_secrets.secret_projects to authenticated;
grant select on module_secrets.secret_grants   to authenticated;
grant select on module_secrets.services         to authenticated;
grant select on module_secrets.service_secrets  to authenticated;
grant select on module_secrets.access_log       to authenticated;
-- data_keys.wrapped_dek: never granted to authenticated.
