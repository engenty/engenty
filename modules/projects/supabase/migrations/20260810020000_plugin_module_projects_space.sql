-- Space link on projects (PLAN-spaces.md Phase 1).
--
-- A project is an EPISODE inside a steady space; the space is what persists when the
-- project ends. Nullable now, `not null` at the end of Phase 6. See the tasks-module
-- companion migration for why the FK is composite on (space_id, tenant_id) and why it
-- is `on delete set null`.
--
-- Idempotent: guarded column add, guarded constraint add, backfill is a no-op on rerun.

alter table module_projects.projects
  add column if not exists space_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_space_tenant_fkey'
      and conrelid = 'module_projects.projects'::regclass
  ) then
    alter table module_projects.projects
      add constraint projects_space_tenant_fkey
      foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
      on delete set null;
  end if;
end
$$;

update module_projects.projects p
set space_id = s.id
from core.spaces s
where s.tenant_id = p.tenant_id and s.is_default and p.space_id is null;

create index if not exists idx_module_projects_space
  on module_projects.projects (tenant_id, space_id) where space_id is not null;

notify pgrst, 'reload schema';
