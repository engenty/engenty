-- Triggers and task templates belong to exactly one space (PLAN-spaces.md Phase 6).
--
-- A Trigger is a work container in the sense that matters here: firing one
-- MATERIALIZES a task, and tasks have been `space_id not null` since
-- 20260810070000. Until this migration the trigger itself had no space, so
-- fireTrigger created its task with no `space_id` to pass and every
-- trigger-materialized task fell through resolveCreateSpaceId's last resort
-- into the tenant's DEFAULT space — including triggers that conceptually live
-- in Marketing or Support. The tier was silently collapsing on the one path
-- that creates work without a human in the loop.
--
-- Both tables get the column, not just `triggers`:
--   * `triggers`       — the container the fired task inherits from.
--   * `task_templates` — a template is authored in a space and listed there;
--     leaving it space-less would make the trigger editor's template picker the
--     one surface that still shows every space's rows at once.
--
-- Backfill target is the tenant's default space for both. There is no better
-- parent to inherit from: a trigger has no containing goal or project, and
-- module-declared routines (ROUTINE.md sync, `source = 'module'`) are tenant
-- operations whose natural home IS the Company space.
--
-- FK shape and ordering follow 20260810070000 exactly — composite
-- `(space_id, tenant_id)` so a row cannot point at another tenant's space, and
-- `on delete restrict` because `set null` cannot coexist with `not null`.
-- Restrict does not block deleting a TENANT: that cascade removes the
-- referencing rows in the same statement (verified against a live Postgres when
-- the tasks migration was written, not assumed here).
--
-- Idempotent: `add column if not exists`, re-runnable backfill, guarded
-- constraint swap, `set not null` is a no-op on an already-not-null column.

alter table module_tasks.task_templates
  add column if not exists space_id uuid;
alter table module_tasks.triggers
  add column if not exists space_id uuid;

update module_tasks.task_templates tt
set space_id = s.id
from core.spaces s
where s.tenant_id = tt.tenant_id and s.is_default and tt.space_id is null;

update module_tasks.triggers t
set space_id = s.id
from core.spaces s
where s.tenant_id = t.tenant_id and s.is_default and t.space_id is null;

-- A row the backfill could not place means its tenant has no default space,
-- which core.ensure_default_space is supposed to make impossible. Fail with a
-- sentence rather than with a bare not-null violation two statements later.
do $$
declare
  orphaned_templates bigint;
  orphaned_triggers bigint;
begin
  select count(*) into orphaned_templates
    from module_tasks.task_templates where space_id is null;
  select count(*) into orphaned_triggers
    from module_tasks.triggers where space_id is null;
  if orphaned_templates > 0 or orphaned_triggers > 0 then
    raise exception
      'space_id backfill incomplete: % task template(s), % trigger(s) have no space. Their tenants are missing a default space — check core.spaces (is_default) before rerunning.',
      orphaned_templates, orphaned_triggers;
  end if;
end
$$;

alter table module_tasks.task_templates
  drop constraint if exists task_templates_space_tenant_fkey;
alter table module_tasks.task_templates
  add constraint task_templates_space_tenant_fkey
  foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
  on delete restrict;

alter table module_tasks.triggers
  drop constraint if exists triggers_space_tenant_fkey;
alter table module_tasks.triggers
  add constraint triggers_space_tenant_fkey
  foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
  on delete restrict;

alter table module_tasks.task_templates alter column space_id set not null;
alter table module_tasks.triggers alter column space_id set not null;

create index if not exists idx_module_tasks_task_templates_space
  on module_tasks.task_templates (tenant_id, space_id);
create index if not exists idx_module_tasks_triggers_space
  on module_tasks.triggers (tenant_id, space_id);

notify pgrst, 'reload schema';
