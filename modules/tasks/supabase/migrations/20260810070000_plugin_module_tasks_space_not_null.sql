-- Goals and tasks belong to exactly one space, enforced (PLAN-spaces.md Phase 6).
--
-- Phase 1 added `space_id` nullable, because the column had to exist before the
-- resolvers could read it and before any writer set it. Both are true now:
-- resolveCreateSpaceId fills it on every create (explicit → inherit from parent
-- task / goal / project → the tenant's default space), so NULL no longer means
-- "not yet", it means "escaped the tier". This migration closes that.
--
-- Two things change together, and the order is not optional:
--
--  1. The FK becomes `on delete restrict`. `on delete set null` cannot coexist
--     with `not null` — deleting a space would try to write a NULL and throw a
--     constraint violation instead of the clear error the user should get. The
--     obvious worry with restrict is that it would also block deleting a TENANT
--     (whose cascade removes its spaces and its tasks), so this was checked
--     against a live Postgres rather than reasoned about: a tenant delete
--     succeeds under both `restrict` and `no action`, because the cascade
--     removes the referencing rows as part of the same statement. What restrict
--     does block is deleting a space that still holds work — which is the
--     intent. There is no space-delete endpoint yet; this is the guard for when
--     there is one.
--
--  2. Then, and only then, `set not null`.
--
-- The backfill runs again here. The Phase 1 migration already backfilled, but
-- rows created between then and now went through the write path before it
-- resolved a space, so a second pass is needed — and on a fresh database it is
-- simply a no-op.
--
-- Idempotent: guarded constraint swap, re-runnable backfill, `set not null` is
-- a no-op on an already-not-null column.

update module_tasks.goals g
set space_id = s.id
from core.spaces s
where s.tenant_id = g.tenant_id and s.is_default and g.space_id is null;

update module_tasks.tasks t
set space_id = s.id
from core.spaces s
where s.tenant_id = t.tenant_id and s.is_default and t.space_id is null;

-- A row the backfill could not place means its tenant has no default space,
-- which core.ensure_default_space is supposed to make impossible. Fail with a
-- sentence rather than with a bare not-null violation three statements later.
do $$
declare
  orphaned_goals bigint;
  orphaned_tasks bigint;
begin
  select count(*) into orphaned_goals from module_tasks.goals where space_id is null;
  select count(*) into orphaned_tasks from module_tasks.tasks where space_id is null;
  if orphaned_goals > 0 or orphaned_tasks > 0 then
    raise exception
      'space_id backfill incomplete: % goal(s), % task(s) have no space. Their tenants are missing a default space — check core.spaces (is_default) before rerunning.',
      orphaned_goals, orphaned_tasks;
  end if;
end
$$;

alter table module_tasks.goals drop constraint if exists goals_space_tenant_fkey;
alter table module_tasks.goals
  add constraint goals_space_tenant_fkey
  foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
  on delete restrict;

alter table module_tasks.tasks drop constraint if exists tasks_space_tenant_fkey;
alter table module_tasks.tasks
  add constraint tasks_space_tenant_fkey
  foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
  on delete restrict;

alter table module_tasks.goals alter column space_id set not null;
alter table module_tasks.tasks alter column space_id set not null;

-- The partial indexes from Phase 1 carried `where space_id is not null`, which
-- is now every row: a partial index on an always-true predicate still works but
-- misleads anyone reading it into thinking space-less rows are a case.
drop index if exists module_tasks.idx_module_tasks_goals_space;
drop index if exists module_tasks.idx_module_tasks_tasks_space;
create index if not exists idx_module_tasks_goals_space
  on module_tasks.goals (tenant_id, space_id);
create index if not exists idx_module_tasks_tasks_space
  on module_tasks.tasks (tenant_id, space_id);

notify pgrst, 'reload schema';
