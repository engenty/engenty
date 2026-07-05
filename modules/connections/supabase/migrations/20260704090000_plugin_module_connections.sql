-- Connections module: central external-service connections (OAuth tokens,
-- per-action policies, pending OAuth flows, durable approval requests).
-- Tokens are AES-256-GCM encrypted app-side (CONNECTIONS_TOKEN_ENC_KEY) and
-- only ever read server-side; RLS policies never expose *_enc columns to
-- anon/authenticated roles via column grants below.

create schema if not exists module_connections;

create table if not exists module_connections.connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  connector_id text not null,
  owner_user_id uuid references core.users(id) on delete cascade,
  sharing text not null default 'personal' check (sharing in ('personal', 'org')),
  autonomous_mode text not null default 'off'
    check (autonomous_mode in ('off', 'read_only', 'full')),
  non_owner_max_group text
    check (non_owner_max_group in ('read', 'write', 'destructive')),
  display_name text,
  external_account text,
  auth_kind text not null default 'oauth2' check (auth_kind in ('oauth2', 'api_key')),
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'error', 'revoked')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_connections_connections_tenant
  on module_connections.connections (tenant_id, connector_id);

-- One personal connection per user+connector; one org connection per connector.
create unique index if not exists uq_module_connections_personal
  on module_connections.connections (tenant_id, connector_id, owner_user_id)
  where sharing = 'personal';
create unique index if not exists uq_module_connections_org
  on module_connections.connections (tenant_id, connector_id)
  where sharing = 'org';

create table if not exists module_connections.connection_action_policies (
  connection_id uuid not null references module_connections.connections(id) on delete cascade,
  selector text not null, -- action id (e.g. 'search_threads') or 'group:<read|write|destructive>'
  policy text not null check (policy in ('allow', 'ask', 'deny')),
  primary key (connection_id, selector)
);

create table if not exists module_connections.pending_oauth_flows (
  nonce text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  user_id uuid not null,
  connector_id text not null,
  sharing text not null default 'personal' check (sharing in ('personal', 'org')),
  requested_scopes text[] not null default '{}',
  redirect_to text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_connections_pending_expires
  on module_connections.pending_oauth_flows (expires_at);

create table if not exists module_connections.approval_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  connection_id uuid not null references module_connections.connections(id) on delete cascade,
  action_id text not null,
  operation_id text not null,
  requested_by text not null, -- principal id (agent/service) that hit the gate
  task_id text,               -- tasks-module task blocked on this approval, if any
  input_summary jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'expired')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_connections_approvals_tenant_status
  on module_connections.approval_requests (tenant_id, status, created_at desc);

-- updated_at trigger, mirroring other module schemas
create or replace function module_connections.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_connections_updated_at on module_connections.connections;
create trigger trg_connections_updated_at
  before update on module_connections.connections
  for each row execute function module_connections.set_updated_at();

alter table module_connections.connections enable row level security;
alter table module_connections.connection_action_policies enable row level security;
alter table module_connections.pending_oauth_flows enable row level security;
alter table module_connections.approval_requests enable row level security;

-- Connections: owners see their personal connections; everyone in the tenant
-- sees org connections (metadata only — token columns are not granted).
create policy connections_read on module_connections.connections
for select using (
  tenant_id = core.current_tenant_id()
  and (sharing = 'org' or owner_user_id = auth.uid())
);

create policy connection_action_policies_read on module_connections.connection_action_policies
for select using (
  exists (
    select 1 from module_connections.connections c
    where c.id = connection_id
      and c.tenant_id = core.current_tenant_id()
      and (c.sharing = 'org' or c.owner_user_id = auth.uid())
  )
);

create policy approval_requests_read on module_connections.approval_requests
for select using (tenant_id = core.current_tenant_id());

-- All writes go through the service role (core operations); no client-side
-- insert/update/delete policies on purpose. pending_oauth_flows is service-only.

grant usage on schema module_connections to service_role;
grant select, insert, update, delete on all tables in schema module_connections to service_role;

-- Token columns stay server-only: authenticated gets a column-limited select
-- (no table-wide grant, so *_enc is unreadable even through RLS-passing rows).
grant usage on schema module_connections to authenticated;
grant select (
  id, tenant_id, connector_id, owner_user_id, sharing, autonomous_mode,
  non_owner_max_group, display_name, external_account, auth_kind,
  token_expires_at, granted_scopes, status, error_message, created_at, updated_at
) on module_connections.connections to authenticated;
grant select on module_connections.connection_action_policies to authenticated;
grant select on module_connections.approval_requests to authenticated;
