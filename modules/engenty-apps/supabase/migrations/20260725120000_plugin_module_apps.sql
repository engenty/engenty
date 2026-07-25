-- engenty Apps: tenant-owned applications with a frontend, a backend and their
-- own working storage.
--
-- Postgres is the source of truth. The app host (apps/app-host) is a runtime:
-- losing all of its actor state means redeploying from `app_versions.files`,
-- not losing an app. See PLAN-engenty-apps.md §3.
--
-- Note on `app_data`: the plan originally put an App's working state in a
-- per-app SQLite database inside its agentOS VM. That path is unavailable —
-- agentOS's guest network bridge cannot reach the scoped Engine proxy, so the
-- only route to SQLite 500s on every request (SPIKE-agentos-apps.md §4). This
-- table stands in for it, and the app-facing API is deliberately a narrow
-- get/set/delete/list over (session_id, key) so the backing store can become
-- SQLite later without changing a single App.

create schema if not exists module_apps;

-- ── Apps ───────────────────────────────────────────────────────────────────

create table if not exists module_apps.apps (
  id uuid primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  -- The version currently deployed to the app host. Null until first release.
  active_version_id uuid,
  created_by_kind text not null default 'user'
    check (created_by_kind in ('agent', 'user')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_module_apps_apps_slug
  on module_apps.apps (tenant_id, slug);

create index if not exists idx_module_apps_apps_status
  on module_apps.apps (tenant_id, scope_id, status);

-- ── Versions ───────────────────────────────────────────────────────────────

create table if not exists module_apps.app_versions (
  id uuid primary key,
  app_id uuid not null references module_apps.apps(id) on delete cascade,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  version integer not null check (version > 0),
  -- Declared capability surface: entry points, allowed engenty operations,
  -- actions, egress allow-list. Validated by zod at the write boundary.
  manifest jsonb not null default '{}'::jsonb,
  -- path -> source text. The whole App, versioned; this is what gets rebuilt.
  files jsonb not null default '{}'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'active', 'archived')),
  -- Verbatim builder output. This is what engenty.coder reads to fix a build.
  build_log text,
  -- agentOS release hash, once the build succeeded.
  release text,
  deployed_at timestamptz,
  created_by_kind text not null default 'agent'
    check (created_by_kind in ('agent', 'user')),
  created_by text,
  created_at timestamptz not null default now(),
  -- Concurrency gate, mirroring ai.artifact_version: two agents proposing at
  -- once collide here rather than silently clobbering each other.
  unique (app_id, version)
);

create index if not exists idx_module_apps_versions_app
  on module_apps.app_versions (tenant_id, app_id, version desc);

alter table module_apps.apps
  drop constraint if exists module_apps_apps_active_version_fk;
alter table module_apps.apps
  add constraint module_apps_apps_active_version_fk
  foreign key (active_version_id)
  references module_apps.app_versions(id) on delete set null;

-- ── Capability handles ─────────────────────────────────────────────────────

-- An App backend never receives an engenty token. It receives one of these:
-- an opaque, hashed, short-lived handle that resolves to (user, app, allowed
-- operations) at engenty's proxy and is worthless anywhere else. Actor tokens
-- carry the target user's FULL grant set with no operation scoping anywhere in
-- the codebase, so handing one to tenant-authored code would be equivalent to
-- handing over the user's session — see PLAN-engenty-apps.md §2.2.
create table if not exists module_apps.app_capability (
  id uuid primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  app_id uuid not null references module_apps.apps(id) on delete cascade,
  user_id uuid not null,
  -- sha256 of the handle. The handle itself is never stored.
  token_hash text not null,
  allowed_operations text[] not null default '{}',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_module_apps_capability_hash
  on module_apps.app_capability (token_hash);

create index if not exists idx_module_apps_capability_expiry
  on module_apps.app_capability (expires_at)
  where revoked_at is null;

-- ── Consent ────────────────────────────────────────────────────────────────

-- Recorded once per (tenant, app, version, user). A new version that widens
-- the declared operation list re-asks, because the row is keyed by version.
create table if not exists module_apps.app_consent (
  id uuid primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  app_id uuid not null references module_apps.apps(id) on delete cascade,
  app_version integer not null,
  user_id uuid not null,
  operations text[] not null default '{}',
  granted_at timestamptz not null default now(),
  unique (tenant_id, app_id, app_version, user_id)
);

-- ── App working data ───────────────────────────────────────────────────────

create table if not exists module_apps.app_data (
  id uuid primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  app_id uuid not null references module_apps.apps(id) on delete cascade,
  -- One App can back many concurrent sessions (one per artifact instance).
  session_id text not null,
  key text not null check (length(key) between 1 and 200),
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, app_id, session_id, key)
);

create index if not exists idx_module_apps_data_session
  on module_apps.app_data (tenant_id, app_id, session_id);

-- ── App config ─────────────────────────────────────────────────────────────
--
-- `app_data` is session-scoped: its key includes session_id, so an App's
-- working state belongs to one artifact instance and dies with it. That leaves
-- an App unable to remember anything about a tenant or a user across
-- instances. This table is that missing axis — durable, no session_id.
--
-- Two levels, distinguished by user_id:
--   user_id is null → the tenant-wide default for this app, set by an admin.
--   user_id is set  → that user's own value, which shadows the default.
-- Reads resolve user-then-default; see `resolveConfig` in the DAL.

create table if not exists module_apps.app_config (
  id uuid primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  app_id uuid not null references module_apps.apps(id) on delete cascade,
  user_id uuid,
  key text not null check (length(key) between 1 and 200),
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Postgres treats NULLs as distinct in a unique constraint, so a single
-- `unique (tenant_id, app_id, user_id, key)` would happily admit duplicate
-- tenant-wide rows. Two partial indexes are the correct spelling: one per
-- level, each total over the rows it covers.
create unique index if not exists uq_module_apps_config_user
  on module_apps.app_config (tenant_id, app_id, user_id, key)
  where user_id is not null;

create unique index if not exists uq_module_apps_config_default
  on module_apps.app_config (tenant_id, app_id, key)
  where user_id is null;

-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- Every table carries tenant_id, so RLS is mandatory (scripts/check-rls-coverage.mjs).
-- apps / app_versions / app_data / app_config follow the standard tenant+scope
-- pattern.
-- app_capability and app_consent are service-role-only: RLS on with no
-- policies denies every authenticated principal, which is what we want for a
-- credential table — nothing but the proxy should ever read a handle row.

alter table module_apps.apps enable row level security;
alter table module_apps.app_versions enable row level security;
alter table module_apps.app_capability enable row level security;
alter table module_apps.app_consent enable row level security;
alter table module_apps.app_data enable row level security;
alter table module_apps.app_config enable row level security;

create policy apps_read_own_scope on module_apps.apps
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy app_versions_read_own_scope on module_apps.app_versions
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy app_data_read_own_scope on module_apps.app_data
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- A tenant-wide default is readable by the whole scope; a user-level value is
-- readable only by the user it belongs to.
create policy app_config_read_own_scope on module_apps.app_config
for select using (
  tenant_id = core.current_tenant_id()
  and core.has_scope(scope_id)
  and (user_id is null or user_id = auth.uid())
);

-- Writes go through the gateway operations (service role), never straight from
-- a browser: a tenant-authored App must not be able to reach these tables
-- except through the manifest-scoped proxy.

-- ── Grants ─────────────────────────────────────────────────────────────────
--
-- Explicit and complete. A baseline migration that creates tables with RLS but
-- forgets the service_role grants produces "permission denied for schema" at
-- runtime and has broken a release here before (see engenty-remote
-- 20260720100001). New module schemas ALSO need PostgREST's exposed-schemas
-- list updated and a reload — `pnpm engenty db sync` locally, a manual config
-- change on cloud Supabase.

grant usage on schema module_apps to service_role;
grant select, insert, update, delete on all tables in schema module_apps to service_role;
alter default privileges in schema module_apps
  grant select, insert, update, delete on tables to service_role;

grant usage on schema module_apps to authenticated;
grant select on table module_apps.apps to authenticated;
grant select on table module_apps.app_versions to authenticated;
grant select on table module_apps.app_data to authenticated;
grant select on table module_apps.app_config to authenticated;

notify pgrst, 'reload schema';
