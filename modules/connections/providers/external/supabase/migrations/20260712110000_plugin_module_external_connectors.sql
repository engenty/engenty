-- External (imported) connectors: platform-level records materialized into
-- live connector definitions at boot. Secrets (OAuth client credentials) are
-- AES-256-GCM encrypted by the application (CONNECTIONS_TOKEN_ENC_KEY).
--
-- Service-role only: like the connections token tables, this schema has NO
-- `authenticated` grants — every read/write flows through module routes.

create schema if not exists module_external_connectors;

create table if not exists module_external_connectors.imported_connectors (
  id                text primary key,
  domain            text not null,
  name              text not null,
  source_kind       text not null check (source_kind in ('openapi', 'mcp')),
  source_url        text not null,
  base_url          text,
  actions           jsonb not null default '[]'::jsonb,
  auth_config       jsonb not null default '{"kind":"none"}'::jsonb,
  registry_snapshot jsonb,
  spec_hash         text not null,
  client_id_enc     text,
  client_secret_enc text,
  tool_prefix       text not null,
  status            text not null default 'enabled'
                    check (status in ('enabled', 'disabled')),
  imported_by       uuid not null,
  imported_at       timestamptz not null default now(),
  refreshed_at      timestamptz
);

create unique index if not exists imported_connectors_tool_prefix_key
  on module_external_connectors.imported_connectors (tool_prefix);

alter table module_external_connectors.imported_connectors
  enable row level security;

-- Service-role only: all access flows through superadmin module routes.
grant usage on schema module_external_connectors to service_role;
grant select, insert, update, delete
  on all tables in schema module_external_connectors to service_role;

notify pgrst, 'reload schema';
