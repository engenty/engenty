-- A personal space has NO members, ever (PLAN-spaces.md Phase P, corrected
-- 2026-08-11 by Matthias).
--
-- The original Phase P design treated a personal space as an ordinary space that
-- merely happened to start private, and therefore shareable by granting
-- membership — the Linux home directory you can `chmod` open for a colleague.
-- That is not the concept. **A personal space is a special type of space: it is
-- one person's, and nobody else is ever in it.** The decision is the user's and
-- it makes the mechanism smaller, not larger:
--
--   personal space  →  access is `owner_user_id = you`. Full stop.
--   shared space    →  access is `visibility = 'open'` or a `space_member` row.
--
-- So `core.space_member` is now exclusively a SHARED-space table, and the owner
-- row the Phase P trigger inserted was not just unnecessary, it encoded the
-- wrong idea: it implied a roster that could grow.
--
-- What this migration does:
--   1. stops `ensure_personal_space()` seeding an owner membership,
--   2. forbids any member row on an owned space, in the database,
--   3. removes the rows the previous trigger already created.
--
-- Step 3 deletes data: EVERY member row on a personal space, not merely the
-- owner rows the superseded trigger created. The narrower delete was the first
-- version of this migration and it was wrong — it would have left a personal
-- space carrying members that step 2 forbids anyone from ever creating, so the
-- invariant would read as enforced while a violating row sat in the table.
-- (Found immediately: a row from live testing survived the narrow delete.)
--
-- Safe because a shared space has no `owner_user_id`, so its roster cannot
-- match; and access is unaffected regardless, since every reader checks
-- `owner_user_id` before it checks membership.
--
-- Idempotent: replaceable functions, drop-trigger-first, guarded constraint.

-- 1. No owner membership on creation ------------------------------------------------

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

  -- Deliberately NO membership row for the personal space: `owner_user_id` is
  -- the entire access grant, and a roster of one would invite a roster of two.

  -- Membership in the tenant's default (Company) space stays — that one IS
  -- shared, and it is what keeps a brand-new user's rail from being empty.
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

-- 2. And none may be added later ----------------------------------------------------
--
-- A trigger rather than a CHECK: the rule spans two tables (a member row and its
-- space's `owner_user_id`), which a row-level CHECK cannot see.
create or replace function core.forbid_personal_space_member()
returns trigger
language plpgsql
set search_path = core, public
as $$
begin
  if exists (
    select 1 from core.spaces s
    where s.id = new.space_id and s.owner_user_id is not null
  ) then
    raise exception
      'space % is personal; personal spaces have no members'
      , new.space_id
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists space_member_forbid_personal on core.space_member;
create trigger space_member_forbid_personal
  before insert or update on core.space_member
  for each row execute function core.forbid_personal_space_member();

-- 3. Remove every member row on a personal space ------------------------------------
--
-- `core.protect_space_owner_member()` would refuse the owner rows (it guards
-- exactly the owner-of-a-personal-space case), so it goes first.
drop trigger if exists space_member_protect_owner on core.space_member;

delete from core.space_member m
using core.spaces s
where s.id = m.space_id
  and s.tenant_id = m.tenant_id
  and s.owner_user_id is not null;

-- The protection now has nothing to protect — a personal space has no member
-- rows at all, and `owner_user_id` is guarded by the FK and the uniqueness
-- index instead. Keeping an inert trigger around would be a claim that some
-- rule is still enforced here.
drop function if exists core.protect_space_owner_member();

notify pgrst, 'reload schema';
