-- A project belongs to exactly one space, enforced (PLAN-spaces.md Phase 6).
--
-- The companion to the tasks-module migration of the same phase; see it for why
-- the FK has to stop being `on delete set null` before the column can become
-- `not null`, and for the live check that a tenant delete still cascades under
-- `restrict`.
--
-- Idempotent: guarded constraint swap, re-runnable backfill.

update module_projects.projects p
set space_id = s.id
from core.spaces s
where s.tenant_id = p.tenant_id and s.is_default and p.space_id is null;

do $$
declare
  orphaned bigint;
begin
  select count(*) into orphaned from module_projects.projects where space_id is null;
  if orphaned > 0 then
    raise exception
      'space_id backfill incomplete: % project(s) have no space. Their tenants are missing a default space — check core.spaces (is_default) before rerunning.',
      orphaned;
  end if;
end
$$;

alter table module_projects.projects drop constraint if exists projects_space_tenant_fkey;
alter table module_projects.projects
  add constraint projects_space_tenant_fkey
  foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
  on delete restrict;

alter table module_projects.projects alter column space_id set not null;

drop index if exists module_projects.idx_module_projects_space;
create index if not exists idx_module_projects_space
  on module_projects.projects (tenant_id, space_id);

notify pgrst, 'reload schema';
