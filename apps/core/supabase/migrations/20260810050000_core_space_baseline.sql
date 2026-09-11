-- Baseline mounts: the mounts every space has and cannot lose (PLAN-spaces.md 3b).
--
-- "A space with no coordinator and no chat is a broken space; the dialog should
-- make that unreachable rather than validating it afterwards." Validating after
-- the fact is exactly what a nullable convention would give us, so the baseline
-- is SEEDED BY THE DATABASE for every space however it comes into existence —
-- including the default Company space, which is created by a trigger where no
-- application code runs at all.
--
-- The list is mirrored by `SPACE_BASELINE_MOUNTS` in
-- `packages/plugin-sdk/src/space-setup.ts`, and `space-setup.test.ts` reads THIS
-- FILE and fails if the two disagree. Two copies are unavoidable (the dialog has
-- to know the list before a space exists; the trigger has to know it where no TS
-- runs) — an unchecked second copy would not be.
--
-- Idempotent: replaceable function, drop-trigger-first, `on conflict do nothing`
-- seeding that doubles as the backfill.

create or replace function core.space_baseline_mounts()
returns table (
  resource_type text,
  resource_key text,
  record_scope text,
  agent_access text
)
language sql
immutable
as $$
  -- Chat: a mounted app like any other, not a special case in the schema.
  -- `none` because the copilot module holds no records of its own — the chat
  -- agent's reach comes from the OTHER modules mounted in the space.
  select 'module'::text, 'engenty-copilot'::text, 'space'::text, 'none'::text
  union all
  select 'agent'::text, 'engenty.copilot'::text, null::text, null::text
  union all
  select 'agent'::text, 'engenty.coordinator'::text, null::text, null::text
$$;

comment on function core.space_baseline_mounts() is
  'PLAN-spaces.md 3b: mounts every space is seeded with and may not remove. Mirrored by SPACE_BASELINE_MOUNTS in packages/plugin-sdk/src/space-setup.ts and pinned by space-setup.test.ts.';

-- The dialog needs this list before the space it is creating exists, so the
-- browser lane may read it. It is a constant, not tenant data.
grant execute on function core.space_baseline_mounts() to engenty_server, authenticated, service_role;

create or replace function core.seed_space_baseline_mounts()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
begin
  -- SECURITY DEFINER: this fires inside tenant creation too, where the server
  -- lane's `core.current_tenant_id()` is not yet set and the RLS write policy on
  -- space_mount would refuse the insert.
  insert into core.space_mount (
    tenant_id, space_id, resource_type, resource_key,
    record_scope, agent_access, is_required
  )
  select new.tenant_id, new.id, b.resource_type, b.resource_key,
         b.record_scope, b.agent_access, true
  from core.space_baseline_mounts() b
  on conflict (tenant_id, space_id, resource_type, resource_key) do nothing;
  return new;
end
$$;

drop trigger if exists spaces_seed_baseline_mounts on core.spaces;
create trigger spaces_seed_baseline_mounts
  after insert on core.spaces
  for each row execute function core.seed_space_baseline_mounts();

-- Backfill: every space that predates this migration, including the Company
-- spaces the Phase 0 trigger made. `is_required` is forced true on an existing
-- row so a baseline entry mounted by hand earlier becomes non-removable now.
insert into core.space_mount (
  tenant_id, space_id, resource_type, resource_key,
  record_scope, agent_access, is_required
)
select s.tenant_id, s.id, b.resource_type, b.resource_key,
       b.record_scope, b.agent_access, true
from core.spaces s
cross join core.space_baseline_mounts() b
on conflict (tenant_id, space_id, resource_type, resource_key)
do update set is_required = true;

notify pgrst, 'reload schema';
