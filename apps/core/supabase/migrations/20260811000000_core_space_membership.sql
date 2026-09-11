-- Personal spaces & membership (PLAN-spaces.md Phase P1).
--
-- Built the Linux-home-directory way: a personal space is a NORMAL space plus a
-- general permission mechanism plus a thin convention. A home directory is an
-- ordinary directory; what makes it personal is owner + mode bits + the `useradd`
-- convention. Here:
--
--   mechanism   `visibility` (open|private) on every space + core.space_member
--   convention  `owner_user_id` set, auto-created, one per user per tenant, private
--
-- If personal spaces ever need an `if kind = 'personal'` branch outside the creation
-- trigger and the switcher's grouping, this design has failed its own test.
--
-- This RETIRES the "there is NO per-space access control" constraint, deliberately.
-- The §1c non-goal — no authorization inferred from membership — survives REFINED,
-- not reversed:
--
--   core.space_member (here)   users  → access & visibility
--   core.space_mount (exists)  agents → authorization (capabilities stay authoritative)
--
-- Agent membership already exists as `space_mount` rows with resource_type='agent'.
-- A second table for agents would be two sources of truth for "which agents are in
-- this space", drifting within a release — the same argument space_mount itself makes
-- against split tables.
--
-- ENFORCEMENT IS SPLIT, AND THIS FILE IS ONLY HALF OF IT. The server lane's JWT
-- subject is the nil UUID, so `core.current_user_id()` is meaningless there: Postgres
-- can enforce the tenant wall but cannot see WHICH user a server-mediated query
-- serves. The policies below therefore bind the BROWSER lane only. Every server path
-- is guarded in the DAL/route layer (Phase P2: requireSpaceAccess,
-- listAccessibleSpaces). A per-user rule believed to be "enforced by RLS" on a server
-- path is enforced by nothing.
--
-- Idempotent: guarded adds, drop-policy-first, drop-trigger-first, re-grants.

-- 1. The mechanism: visibility + owner on every space -------------------------------

alter table core.spaces
  add column if not exists visibility text not null default 'open';

alter table core.spaces
  add column if not exists owner_user_id uuid;

do $$
begin
  -- Composite FK, not a plain reference to core.users(id): the owner must belong to
  -- the space's own tenant. Same trap space_mount avoids — a plain reference would
  -- happily accept another tenant's user. Target index is core.users (id, tenant_id)
  -- from 20260809230000.
  if not exists (
    select 1 from pg_constraint where conname = 'spaces_owner_user_tenant_fkey'
  ) then
    alter table core.spaces
      add constraint spaces_owner_user_tenant_fkey
      foreign key (owner_user_id, tenant_id) references core.users (id, tenant_id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'spaces_visibility_check'
  ) then
    alter table core.spaces
      add constraint spaces_visibility_check
      check (visibility in ('open', 'private'));
  end if;

  -- The Company space is the tenant's shared front door; a personal space is one
  -- person's. Nothing sensible is both, and code that resolves "the default space"
  -- must never land on someone's private one.
  if not exists (
    select 1 from pg_constraint where conname = 'spaces_default_not_personal_check'
  ) then
    alter table core.spaces
      add constraint spaces_default_not_personal_check
      check (not (is_default and owner_user_id is not null));
  end if;

  -- A personal space is always private. Sharing one is done by GRANTING MEMBERSHIP
  -- (invite a person), never by opening it to the whole tenant — so the dangerous
  -- direction ("make my home directory world-readable") has no switch at all, while
  -- the useful direction stays available. This is why the setup dialog hides the
  -- visibility toggle for personal spaces: there is nothing behind it.
  if not exists (
    select 1 from pg_constraint where conname = 'spaces_personal_is_private_check'
  ) then
    alter table core.spaces
      add constraint spaces_personal_is_private_check
      check (owner_user_id is null or visibility = 'private');
  end if;
end
$$;

-- One personal space per user per tenant — the `useradd` half of the convention.
create unique index if not exists spaces_tenant_personal_uniq
  on core.spaces (tenant_id, owner_user_id) where owner_user_id is not null;

create index if not exists spaces_tenant_visibility_idx
  on core.spaces (tenant_id, visibility);

-- 2. The mechanism: user membership -------------------------------------------------

create table if not exists core.space_member (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  space_id uuid not null,
  user_id uuid not null,
  -- 'owner' is the personal space's holder and a shared space's steward. Role here
  -- governs membership management only; what a person may DO inside a space is still
  -- the capability system's answer, never this column's.
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, space_id, user_id),
  -- Both composite, for the reason above.
  constraint space_member_space_tenant_fkey
    foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
    on delete cascade,
  constraint space_member_user_tenant_fkey
    foreign key (user_id, tenant_id) references core.users (id, tenant_id)
    on delete cascade
);

create index if not exists space_member_user_idx
  on core.space_member (tenant_id, user_id);

-- 3. Invariants that must not depend on application code ----------------------------

-- A personal space's owner cannot be un-membered — that is the whole privacy
-- guarantee, and an admin "tidying up members" must not be able to reach through it.
--
-- Deliberately scoped to the OWNED case rather than a general last-owner rule: the
-- cascade from deleting a space and the orphan-on-leave path below both need this
-- delete to succeed, and both leave no matching row (space gone / owner nulled first).
create or replace function core.protect_space_owner_member()
returns trigger
language plpgsql
set search_path = core, public
as $$
begin
  if exists (
    select 1 from core.spaces s
    where s.id = old.space_id and s.owner_user_id = old.user_id
  ) then
    raise exception
      'cannot remove the owner membership of personal space %', old.space_id
      using errcode = 'check_violation';
  end if;
  return old;
end
$$;

drop trigger if exists space_member_protect_owner on core.space_member;
create trigger space_member_protect_owner
  before delete on core.space_member
  for each row execute function core.protect_space_owner_member();

-- 4. The convention: one personal space per user, made by the database --------------

-- Key from the email local part, never the display name: keys are URL segments bound
-- by spaces_key_format_check, and display names carry umlauts and spaces (this is an
-- Austrian codebase — "Müller" would slug to "m-ller"). The NAME carries the person;
-- the KEY just has to be stable and typable.
create or replace function core.personal_space_key(p_tenant_id uuid, p_user_id uuid)
returns text
language plpgsql
set search_path = core, public
as $$
declare
  v_base text;
  v_key text;
  v_n integer := 1;
begin
  select lower(split_part(u.email, '@', 1)) into v_base
  from core.users u where u.id = p_user_id;

  v_base := regexp_replace(coalesce(v_base, ''), '[^a-z0-9]+', '-', 'g');
  v_base := regexp_replace(v_base, '(^-+|-+$)', '', 'g');
  v_base := left(v_base, 50);
  if v_base = '' or v_base !~ '^[a-z0-9]' then
    v_base := 'me';
  end if;

  v_key := v_base;
  -- Matches spaces_tenant_key_uniq, which is on lower(key).
  while exists (
    select 1 from core.spaces
    where tenant_id = p_tenant_id and lower(key) = lower(v_key)
  ) loop
    v_n := v_n + 1;
    v_key := left(v_base, 50) || '-' || v_n::text;
  end loop;

  return v_key;
end
$$;

-- Hung off core.user_tenant_roles, the canonical membership source (see
-- dal/core-users/memberships.ts) rather than core.users: joining a tenant is the
-- event that should hand you a place to work, and users are written from several
-- paths that do not all mean "is now a member here".
--
-- Does two things, both so a brand-new user's rail is never empty:
--   1. their personal space (+ owner membership)
--   2. membership in the tenant's default (Company) space
--
-- The baseline-mounts trigger from 20260810050000 then fires on the new space for
-- free, so every personal space is born with its copilot and coordinator.
create or replace function core.ensure_personal_space()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_space_id uuid;
  v_default_space_id uuid;
  v_name text;
begin
  select id into v_space_id
  from core.spaces
  where tenant_id = new.tenant_id and owner_user_id = new.user_id;

  if v_space_id is null then
    select coalesce(nullif(u.display_name, ''), split_part(u.email, '@', 1))
      into v_name
    from core.users u where u.id = new.user_id;

    insert into core.spaces (tenant_id, key, name, visibility, owner_user_id)
    values (
      new.tenant_id,
      core.personal_space_key(new.tenant_id, new.user_id),
      coalesce(nullif(v_name, ''), 'Personal'),
      'private',
      new.user_id
    )
    returning id into v_space_id;
  end if;

  insert into core.space_member (tenant_id, space_id, user_id, role)
  values (new.tenant_id, v_space_id, new.user_id, 'owner')
  on conflict do nothing;

  select id into v_default_space_id
  from core.spaces where tenant_id = new.tenant_id and is_default;

  if v_default_space_id is not null then
    insert into core.space_member (tenant_id, space_id, user_id, role)
    values (new.tenant_id, v_default_space_id, new.user_id, 'member')
    on conflict do nothing;
  end if;

  return new;
end
$$;

drop trigger if exists user_tenant_roles_ensure_personal_space on core.user_tenant_roles;
create trigger user_tenant_roles_ensure_personal_space
  after insert on core.user_tenant_roles
  for each row execute function core.ensure_personal_space();

-- Leaving the tenant orphans the space exactly like `userdel` leaves /home/alice:
-- the bytes stay, the owner does not, and nobody inherits read access by default.
-- An admin claims or deletes it as an explicit, audited action (Phase P2 route) —
-- `root` powers used like root powers, not a quiet clause in a policy.
create or replace function core.orphan_personal_space_on_leave()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
begin
  -- Order matters: nulling the owner first is what lets the membership delete below
  -- past core.protect_space_owner_member().
  update core.spaces
     set owner_user_id = null
   where tenant_id = old.tenant_id and owner_user_id = old.user_id;

  delete from core.space_member
   where tenant_id = old.tenant_id and user_id = old.user_id;

  return old;
end
$$;

drop trigger if exists user_tenant_roles_orphan_personal_space on core.user_tenant_roles;
create trigger user_tenant_roles_orphan_personal_space
  after delete on core.user_tenant_roles
  for each row execute function core.orphan_personal_space_on_leave();

-- 5. Backfill -----------------------------------------------------------------------
--
-- Existing spaces keep visibility='open' from the column default, so nothing changes
-- for anyone until a space is deliberately made private. What changes today is that
-- every existing tenant member gains a personal space and a Company membership.

do $$
declare
  r record;
  v_space_id uuid;
  v_name text;
begin
  for r in select user_id, tenant_id from core.user_tenant_roles loop
    select id into v_space_id
    from core.spaces
    where tenant_id = r.tenant_id and owner_user_id = r.user_id;

    if v_space_id is null then
      select coalesce(nullif(u.display_name, ''), split_part(u.email, '@', 1))
        into v_name
      from core.users u where u.id = r.user_id;

      -- A user_tenant_roles row whose core.users row is missing or lives in another
      -- tenant would fail the composite FK; skip rather than abort the migration.
      if not exists (
        select 1 from core.users u
        where u.id = r.user_id and u.tenant_id = r.tenant_id
      ) then
        continue;
      end if;

      insert into core.spaces (tenant_id, key, name, visibility, owner_user_id)
      values (
        r.tenant_id,
        core.personal_space_key(r.tenant_id, r.user_id),
        coalesce(nullif(v_name, ''), 'Personal'),
        'private',
        r.user_id
      )
      returning id into v_space_id;
    end if;

    insert into core.space_member (tenant_id, space_id, user_id, role)
    values (r.tenant_id, v_space_id, r.user_id, 'owner')
    on conflict do nothing;

    insert into core.space_member (tenant_id, space_id, user_id, role)
    select r.tenant_id, s.id, r.user_id, 'member'
    from core.spaces s
    where s.tenant_id = r.tenant_id and s.is_default
    on conflict do nothing;
  end loop;
end
$$;

-- 6. RLS: the browser lane only -----------------------------------------------------

alter table core.space_member enable row level security;

grant select, insert, update, delete on core.space_member to engenty_server;

drop policy if exists srv_tenant_isolation on core.space_member;
create policy srv_tenant_isolation on core.space_member
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

-- Own rows only. Deliberately NOT "rows of spaces I can see": this policy is read by
-- the core.spaces policy below, and a policy that looked back at core.spaces would
-- make the pair mutually recursive. Who else is in a space is answered by the API
-- (server lane), which is where the members list belongs anyway.
grant select on core.space_member to authenticated;

drop policy if exists space_member_select_own on core.space_member;
create policy space_member_select_own on core.space_member
  as permissive for select to authenticated
  using (
    tenant_id = (select core.current_tenant_id())
    and user_id = (select core.current_user_id())
  );

-- The access rule, in one place: enter S iff S is open, or you own it, or you have a
-- member row. Inlined rather than factored into a helper function because a function
-- selecting from core.spaces, called from core.spaces' own policy, recurses.
drop policy if exists spaces_select_own_tenant on core.spaces;
create policy spaces_select_own_tenant on core.spaces
  as permissive for select to authenticated
  using (
    tenant_id = (select core.current_tenant_id())
    and (
      visibility = 'open'
      or owner_user_id = (select core.current_user_id())
      or exists (
        select 1 from core.space_member m
        where m.space_id = spaces.id
          and m.user_id = (select core.current_user_id())
      )
    )
  );

-- Mounts follow the space: which agents and modules someone works with is itself
-- telling. The `exists` runs under the caller's role, so core.spaces' policy above
-- filters it — one access rule, applied twice, with no second copy to drift.
drop policy if exists space_mount_select_own_tenant on core.space_mount;
create policy space_mount_select_own_tenant on core.space_mount
  as permissive for select to authenticated
  using (
    tenant_id = (select core.current_tenant_id())
    and exists (
      select 1 from core.spaces s where s.id = space_mount.space_id
    )
  );

notify pgrst, 'reload schema';
