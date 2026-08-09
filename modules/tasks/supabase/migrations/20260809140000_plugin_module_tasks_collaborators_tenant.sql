-- Give module_tasks.task_collaborators a tenant boundary of its own.
--
-- Same shape, and same reasoning, as the project_team change in
-- modules/projects (20260809120000_..._project_team_tenant.sql): the table was
-- (task_id, user_id), so a row could not say which tenant it belonged to and
-- its RLS policy had to reach through module_tasks.tasks to find out. Sound
-- under RLS — but modules read through a service-role client that BYPASSES
-- RLS, so that join was the only boundary.
--
-- This table is the worst-placed one for that: THREE modules read it, and two
-- of them are foreign (module_projects' task bridge and module_time_tracking's
-- assignment lookup). Two of those reads key on `user_id` alone — a globally
-- unique id — so they return task ids from every tenant that user touches and
-- rely entirely on a later, tenant-scoped read to drop the foreign ones. That
-- is a correct-by-accident boundary: it holds only while nobody uses those ids
-- for anything except re-reading tasks.
--
-- The composite foreign key is what makes denormalising tenant onto the row
-- safe rather than a second source of truth — Postgres rejects any
-- collaborator row whose (task_id, tenant_id, scope_id) does not match a real
-- task, and ON UPDATE CASCADE carries the rows along if a task changes scope.

-- 0. Drop the composite FK first if a previous run created it — it depends on
--    the parent unique index recreated in step 1. Only matters on a re-run.
alter table module_tasks.task_collaborators
  drop constraint if exists task_collaborators_task_tenant_fkey;

-- 1. The parent key the composite FK references. `id` is already the primary
--    key, so uniqueness is trivially satisfied; this only makes the triple
--    addressable as a foreign-key target.
alter table module_tasks.tasks
  drop constraint if exists tasks_id_tenant_scope_key;

alter table module_tasks.tasks
  add constraint tasks_id_tenant_scope_key unique (id, tenant_id, scope_id);

-- 2. Add nullable, backfill from the parent, then enforce.
alter table module_tasks.task_collaborators
  add column if not exists tenant_id uuid,
  add column if not exists scope_id text;

update module_tasks.task_collaborators tc
set tenant_id = t.tenant_id,
    scope_id = t.scope_id
from module_tasks.tasks t
where t.id = tc.task_id
  and (tc.tenant_id is null or tc.scope_id is null);

-- task_id already had an ON DELETE CASCADE foreign key, so a collaborator row
-- without a task cannot exist and the backfill must have covered every row. If
-- it did not, something is wrong that silently dropping people's task
-- assignments would only hide — fail the migration instead.
do $$
declare
  unresolved int;
begin
  select count(*) into unresolved
  from module_tasks.task_collaborators
  where tenant_id is null or scope_id is null;

  if unresolved > 0 then
    raise exception
      'task_collaborators backfill left % row(s) with no tenant/scope', unresolved;
  end if;
end $$;

alter table module_tasks.task_collaborators
  alter column tenant_id set not null,
  alter column scope_id set not null;

-- 3. Swap the single-column FK for the composite one. This is the constraint
--    that makes the denormalised columns trustworthy.
alter table module_tasks.task_collaborators
  drop constraint if exists task_collaborators_task_id_fkey;

alter table module_tasks.task_collaborators
  add constraint task_collaborators_task_tenant_fkey
    foreign key (task_id, tenant_id, scope_id)
    references module_tasks.tasks (id, tenant_id, scope_id)
    on delete cascade
    on update cascade;

-- The `user_id`-keyed reads described above are the reason this index exists:
-- with a tenant filter now available they become (tenant, scope, user) lookups.
create index if not exists idx_module_tasks_collaborators_tenant_user
  on module_tasks.task_collaborators (tenant_id, scope_id, user_id);

-- 4. The row now carries its own boundary, so the policy no longer needs to
--    reach through the parent. Same predicate every other table in this schema
--    uses, and cheap enough for Realtime/WALRUS to evaluate per row — which
--    also unblocks the postgres_changes subscription that projects' live
--    binding had to leave out for exactly this reason.
drop policy if exists tasks_collaborators on module_tasks.task_collaborators;
create policy tasks_collaborators on module_tasks.task_collaborators
for all using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
) with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);
