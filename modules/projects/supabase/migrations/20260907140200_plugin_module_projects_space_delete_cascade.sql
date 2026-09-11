-- Companion to the tasks/KB space-delete CASCADE. See the tasks migration
-- of the same hour for why RESTRICT is no longer the right default.
--
-- Guarded so a database without the projects module can still apply this.

do $$
begin
  if to_regclass('module_projects.projects') is null then
    return;
  end if;
  alter table module_projects.projects
    drop constraint if exists projects_space_tenant_fkey;
  alter table module_projects.projects
    add constraint projects_space_tenant_fkey
    foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
    on delete cascade;
end
$$;

notify pgrst, 'reload schema';
