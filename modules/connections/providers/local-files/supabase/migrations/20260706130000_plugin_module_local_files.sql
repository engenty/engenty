-- Local Files connector: metadata for browser-granted directories and the
-- request/response bridge that carries server-side file actions into the
-- browser tab that holds the File System Access handle.
--
-- Cross-schema dependency: references module_connections.connections, so this
-- migration must aggregate AFTER the connections module's migrations (its
-- 20260704* timestamp precedes this 20260706* one).
--
-- The browser NEVER talks to PostgREST for this schema — all traffic goes
-- through authenticated core HTTP routes under the service role. There are no
-- `authenticated` grants on purpose, so there is no forgeable client surface.

create schema if not exists module_local_files;

-- One row per browser profile (a random installation id persisted in the
-- browser's localStorage). Liveness is a heartbeat the bridge posts while a tab
-- is open.
create table if not exists module_local_files.installations (
  installation_id uuid primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  user_id uuid not null,
  device_label text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Each granted directory is one connection ("account"). This row ties that
-- connection to the browser installation that actually holds its handle.
create table if not exists module_local_files.directories (
  connection_id uuid primary key
    references module_connections.connections(id) on delete cascade,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  installation_id uuid not null
    references module_local_files.installations(installation_id) on delete cascade,
  directory_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_local_files_directories_installation
  on module_local_files.directories (installation_id);

-- The durable request/response bridge. A server action inserts a pending row,
-- the browser claims and fulfills it, and the awaiting server handler reads the
-- response back (or times it out).
create table if not exists module_local_files.bridge_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  connection_id uuid not null
    references module_connections.connections(id) on delete cascade,
  installation_id uuid not null,
  action text not null,
  input jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'error', 'expired')),
  response jsonb,
  error text,
  error_code text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_module_local_files_requests_claim
  on module_local_files.bridge_requests (installation_id, status, created_at);

alter table module_local_files.installations enable row level security;
alter table module_local_files.directories enable row level security;
alter table module_local_files.bridge_requests enable row level security;

-- Service-role only: all access flows through authenticated core HTTP routes.
grant usage on schema module_local_files to service_role;
grant select, insert, update, delete
  on all tables in schema module_local_files to service_role;
