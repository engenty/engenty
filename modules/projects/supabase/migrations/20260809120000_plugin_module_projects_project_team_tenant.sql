-- Give module_projects.project_team a tenant boundary of its own.
--
-- The table was (project_id, user_id): a membership row could not say which
-- tenant it belonged to. Every reader had to join module_projects.projects to
-- find out, and its RLS policies did exactly that. Under RLS that is sound.
-- But modules read through a service-role client that BYPASSES RLS, so in
-- practice that join was the only tenant boundary — and a single reader that
-- forgot it turned a project id from another tenant into proven membership.
-- That is how the secrets reveal path (modules/secrets/src/api/reveal-routes.ts)
-- came to grant secret access across tenants.
--
-- Denormalising tenant_id/scope_id onto the row would normally swap that bug
-- for a worse one: membership rows that disagree with their own project, which
-- read as authoritative. The composite foreign key below makes that state
-- unrepresentable — Postgres rejects any team row whose
-- (project_id, tenant_id, scope_id) does not match a real projects row, and
-- ON UPDATE CASCADE carries the rows along if a project ever changes scope.

-- 0. Drop the composite FK first if a previous run created it — it depends on
--    the parent unique index recreated in step 1. Only matters on a re-run.
alter table module_projects.project_team
  drop constraint if exists project_team_project_tenant_fkey;

-- 1. The parent key the composite FK references. `id` is already the primary
--    key, so uniqueness is trivially satisfied; this only makes the triple
--    addressable as a foreign-key target.
alter table module_projects.projects
  drop constraint if exists projects_id_tenant_scope_key;

alter table module_projects.projects
  add constraint projects_id_tenant_scope_key unique (id, tenant_id, scope_id);

-- 2. Add nullable, backfill from the parent, then enforce.
alter table module_projects.project_team
  add column if not exists tenant_id uuid,
  add column if not exists scope_id text;

update module_projects.project_team pt
set tenant_id = pr.tenant_id,
    scope_id = pr.scope_id
from module_projects.projects pr
where pr.id = pt.project_id
  and (pt.tenant_id is null or pt.scope_id is null);

-- project_id already had an ON DELETE CASCADE foreign key, so a team row
-- without a project cannot exist and the backfill must have covered every row.
-- If it did not, something is wrong that silently dropping people's project
-- membership would only hide — fail the migration instead.
do $$
declare
  unresolved int;
begin
  select count(*) into unresolved
  from module_projects.project_team
  where tenant_id is null or scope_id is null;

  if unresolved > 0 then
    raise exception
      'project_team backfill left % row(s) with no tenant/scope', unresolved;
  end if;
end $$;

alter table module_projects.project_team
  alter column tenant_id set not null,
  alter column scope_id set not null;

-- 3. Swap the single-column FK for the composite one. This is the constraint
--    that makes the denormalised columns trustworthy rather than a second
--    source of truth.
alter table module_projects.project_team
  drop constraint if exists project_team_project_id_fkey;

alter table module_projects.project_team
  add constraint project_team_project_tenant_fkey
    foreign key (project_id, tenant_id, scope_id)
    references module_projects.projects (id, tenant_id, scope_id)
    on delete cascade
    on update cascade;

create index if not exists idx_module_project_team_tenant_scope
  on module_projects.project_team (tenant_id, scope_id);

-- 4. The row now carries its own boundary, so the policies no longer need to
--    reach through the parent. Same predicate every other table in this schema
--    uses, and cheap enough for Realtime/WALRUS to evaluate per row.
drop policy if exists project_team_read_own_scope on module_projects.project_team;
create policy project_team_read_own_scope on module_projects.project_team
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

drop policy if exists project_team_insert_own_scope on module_projects.project_team;
create policy project_team_insert_own_scope on module_projects.project_team
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

drop policy if exists project_team_delete_own_scope on module_projects.project_team;
create policy project_team_delete_own_scope on module_projects.project_team
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);
