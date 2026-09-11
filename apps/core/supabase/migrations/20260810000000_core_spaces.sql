-- Spaces: the steady container above Project (PLAN-spaces.md Phase 0).
--
-- A space is neutral core infrastructure — a client, a topic, a team, a department,
-- or just "your space" on a one-person tenant. It sits between Project and Global in
-- the containment ladder:
--
--   Thread > Task > Goal | Routine | Phase > Project > SPACE > Global
--
-- The space is a PATH SEGMENT, not merely a foreign key: object keys become
-- `tenants/<t>/spaces/<s>/…`, so a space-scoped engenty cannot address another
-- space's bytes because no path exists — containment by construction rather than by
-- a membership check. See packages/file-storage/src/internal-storage-path.ts
-- (fileStorageSpaceObjectKey) and work-workspace.ts for the path half of this.
--
-- Idempotent: guarded creates, drop-policy-first, re-grants.

create table if not exists core.spaces (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  -- URL segment (`/s/<key>/…`). Constrained here rather than in application code
  -- because it lands in routes; a key with a slash or a dot segment would be a
  -- path-traversal shape. Storage keys use the id, not the key, so bytes are
  -- unaffected by a later rename.
  key text not null,
  name text not null,
  icon text,
  color text,
  -- The Company space: the first ordinary space every tenant gets. It is NOT the
  -- Global tier — global stays tenant-level (skills, platform commons).
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint spaces_key_format_check check (key ~ '^[a-z0-9][a-z0-9-]{0,62}$')
);

create unique index if not exists spaces_tenant_key_uniq
  on core.spaces (tenant_id, lower(key));

-- Exactly one default per tenant. Without this, "the tenant's default space" is
-- ambiguous, and every caller that resolves it (storage prefixes, the rail, the
-- Phase 6 backfill) would silently pick an arbitrary row.
create unique index if not exists spaces_tenant_default_uniq
  on core.spaces (tenant_id) where is_default;

alter table core.spaces enable row level security;

-- Server lane (engenty_server, NOBYPASSRLS): the standard tenant wall.
grant select, insert, update, delete on core.spaces to engenty_server;

drop policy if exists srv_tenant_isolation on core.spaces;
create policy srv_tenant_isolation on core.spaces
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

-- Browser lane: members of the tenant may READ their spaces (the rail needs this).
-- Writes stay server-side — creating a space issues capability grants once mounts
-- land (PLAN-spaces.md Phase 3), so it is an admin operation behind the API, never
-- a direct PostgREST insert. Scoped `to authenticated` rather than the older
-- `to public` style so the policy can never be OR-combined into the server lane.
grant select on core.spaces to authenticated;

drop policy if exists spaces_select_own_tenant on core.spaces;
create policy spaces_select_own_tenant on core.spaces
  as permissive for select to authenticated
  using (tenant_id = (select core.current_tenant_id()));

-- Every tenant has a default space, guaranteed by the database ----------------------
--
-- A trigger rather than an application-level bootstrap: tenants are created from at
-- least three paths (ensureDefaultTenant, the superadmin console, test fixtures), and
-- Phase 6 flips space_id to `not null` everywhere. An invariant that must hold for
-- every row is cheaper to enforce once here than to remember at each call site.
--
-- SECURITY DEFINER because the inserting principal may be the tenant-locked lane,
-- whose srv_tenant_isolation policy rejects a row for a tenant that is not its own —
-- and when a tenant is being created, it is by definition not the caller's tenant yet.
-- Lives in `core`, not `public`, so it is out of scope of the PostgREST definer
-- lockdown (scripts/check-server-lane-coverage.mjs invariant 3).
create or replace function core.ensure_default_space()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
begin
  insert into core.spaces (tenant_id, key, name, is_default)
  values (new.id, 'company', 'Company', true)
  on conflict do nothing;
  return new;
end
$$;

drop trigger if exists tenants_ensure_default_space on core.tenants;
create trigger tenants_ensure_default_space
  after insert on core.tenants
  for each row execute function core.ensure_default_space();

-- Backfill: one Company space for every tenant that predates this migration.
insert into core.spaces (tenant_id, key, name, is_default)
select t.id, 'company', 'Company', true
from core.tenants t
where not exists (
  select 1 from core.spaces s where s.tenant_id = t.id and s.is_default
)
on conflict do nothing;

-- Artifacts can be space-scoped ----------------------------------------------------
-- Same scope model as task/project/goal; the space is simply the widest scope below
-- the tenant. (PLAN-spaces.md Phase 0 checklist.)
alter table ai.artifact drop constraint if exists artifact_scope_type_check;
alter table ai.artifact add constraint artifact_scope_type_check
  check (scope_type in ('thread', 'task', 'project', 'goal', 'space'));

notify pgrst, 'reload schema';
