-- Browser Bridge connector: a Chrome extension installation linked 1:1 to an
-- engenty agent session drives a dedicated browser window. Server-side actions
-- (navigate/observe/click/...) travel through the durable request/response
-- bridge below; the extension claims requests over a held long-poll and posts
-- results back.
--
-- Cross-schema dependency: references module_connections.connections, so this
-- migration must aggregate AFTER the connections module's migrations (its
-- 20260704* timestamp precedes this 20260712* one).
--
-- The extension NEVER talks to PostgREST for this schema — all traffic goes
-- through authenticated core HTTP routes under the service role. There are no
-- `authenticated` grants on purpose, so there is no forgeable client surface
-- (same posture as module_local_files).

create schema if not exists module_browser_bridge;

-- One row per extension installation (a random installation id minted at link
-- time and persisted in the extension's chrome.storage). Liveness is the
-- heartbeat the service worker posts while linked.
--
-- `connection_id` ties the installation to its `browser`-auth-kind connection
-- (module_connections.connections) so action handlers can resolve
-- connection → installation. `allowed_origins` is the per-connection origin
-- allowlist for `navigate` — kept here (ONE simple place) because installation,
-- connection, and allowlist are all minted 1:1 at link time.
create table if not exists module_browser_bridge.installations (
  installation_id uuid primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  user_id uuid not null,
  connection_id uuid
    references module_connections.connections(id) on delete cascade,
  device_label text not null,
  allowed_origins jsonb not null default '[]',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_module_browser_bridge_installations_connection
  on module_browser_bridge.installations (connection_id)
  where connection_id is not null;

-- The 1:1 link between an installation and (optionally) an agent session
-- thread. `window_state` mirrors the managed window (id, active tab, current
-- url) for UX surfaces; it is never authorization state.
create table if not exists module_browser_bridge.bridge_sessions (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null
    references module_browser_bridge.installations(installation_id) on delete cascade,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  user_id uuid not null,
  thread_id text,
  window_state jsonb,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create unique index if not exists bridge_sessions_one_active_per_installation
  on module_browser_bridge.bridge_sessions (installation_id)
  where status = 'active';

-- The durable request/response bridge. A server action inserts a pending row,
-- the extension claims it (pending → claimed, so a service worker killed
-- mid-command is distinguishable from "never seen"), executes it, and posts
-- the response back (claimed → completed/error). The awaiting server handler
-- short-polls the row or times it out (→ expired).
create table if not exists module_browser_bridge.bridge_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  connection_id uuid not null
    references module_connections.connections(id) on delete cascade,
  installation_id uuid not null,
  action text not null,
  input jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'completed', 'error', 'expired')),
  response jsonb,
  error text,
  error_code text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_module_browser_bridge_requests_claim
  on module_browser_bridge.bridge_requests (installation_id, status, created_at);

alter table module_browser_bridge.installations enable row level security;
alter table module_browser_bridge.bridge_sessions enable row level security;
alter table module_browser_bridge.bridge_requests enable row level security;

-- Service-role only: all access flows through authenticated core HTTP routes.
grant usage on schema module_browser_bridge to service_role;
grant select, insert, update, delete
  on all tables in schema module_browser_bridge to service_role;
