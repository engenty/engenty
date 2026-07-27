-- Durable service credentials (PLAN-service-identity.md, CP2).
--
-- A service credential is NOT a bearer token. It is a long-lived secret whose
-- only power is to be exchanged at POST /api/auth/service-token for a
-- 15-minute engenty access token. That is the whole point: core.api_tokens
-- issues 30–90 day bearers, and a 90-day bearer sitting in an env var is
-- exactly what this plan exists to remove.
--
-- capabilities is jsonb (not text[]) to match core.api_tokens — the auth-store
-- row mappers read `row.capabilities as string[]` straight off jsonb, and one
-- shape across both tables keeps them interchangeable.

create table if not exists core.service_credential (
  id            uuid primary key default public.uuidv7(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  name          text not null,              -- "ai-service" for this plan
  secret_hash   text not null,              -- sha256 of the raw secret
  capabilities  jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  disabled_at   timestamptz,
  last_used_at  timestamptz
);

create index if not exists service_credential_tenant
  on core.service_credential (tenant_id);

-- One live credential per (tenant, name): re-running `service-token create`
-- with the same name after a revoke is fine, but two ACTIVE "ai-service"
-- credentials for one tenant means a rotation went wrong and nobody noticed.
create unique index if not exists service_credential_active_name
  on core.service_credential (tenant_id, name)
  where disabled_at is null;

alter table core.service_credential enable row level security;
-- Service-role only (no policies): reachable exclusively through the core API.
