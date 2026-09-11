-- Space link on goals and tasks (PLAN-spaces.md Phase 1).
--
-- Every work container except Global belongs to exactly one space. NULLABLE here and
-- flipped to `not null` at the end of Phase 6 — the column has to exist before the
-- resolvers can read it, and existing rows are backfilled to the tenant's default
-- (Company) space below.
--
-- The FK is COMPOSITE on (space_id, tenant_id): a plain reference to core.spaces(id)
-- would accept another tenant's space, and module DAL runs partly on a service-role
-- client where RLS would not catch it. `on delete set null` rather than `restrict` so a
-- tenant delete (which cascades to both spaces and tasks) cannot deadlock on the
-- reference — Phase 6 must revisit this when the column becomes `not null`.
--
-- Idempotent: guarded column adds, guarded constraint adds, backfill is a no-op on rerun.

alter table module_tasks.goals
  add column if not exists space_id uuid;
alter table module_tasks.tasks
  add column if not exists space_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'goals_space_tenant_fkey'
      and conrelid = 'module_tasks.goals'::regclass
  ) then
    alter table module_tasks.goals
      add constraint goals_space_tenant_fkey
      foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
      on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_space_tenant_fkey'
      and conrelid = 'module_tasks.tasks'::regclass
  ) then
    alter table module_tasks.tasks
      add constraint tasks_space_tenant_fkey
      foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
      on delete set null;
  end if;
end
$$;

-- Backfill: existing work lands in the tenant's default (Company) space, which
-- 20260810000000 guarantees exists for every tenant.
update module_tasks.goals g
set space_id = s.id
from core.spaces s
where s.tenant_id = g.tenant_id and s.is_default and g.space_id is null;

update module_tasks.tasks t
set space_id = s.id
from core.spaces s
where s.tenant_id = t.tenant_id and s.is_default and t.space_id is null;

-- Listing a space's contents is the container resolver's hot path.
create index if not exists idx_module_tasks_goals_space
  on module_tasks.goals (tenant_id, space_id) where space_id is not null;
create index if not exists idx_module_tasks_tasks_space
  on module_tasks.tasks (tenant_id, space_id) where space_id is not null;

notify pgrst, 'reload schema';
