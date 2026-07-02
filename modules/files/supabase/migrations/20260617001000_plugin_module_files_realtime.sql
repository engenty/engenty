-- Realtime for the files list (binding in apps/ui/src/lib/module-live-bindings.ts).
-- file_entries/file_folders have RLS enabled but no SELECT policy (API reads them
-- as service_role). Per product decision, files are visible to all members of the
-- tenant, so add a tenant-scoped SELECT policy, grant, full replica identity, and
-- publication so realtime can deliver changes to authenticated subscribers.

do $$
begin
  create policy file_entries_read_tenant on module_files.file_entries
  for select using (tenant_id = core.current_tenant_id());
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy file_folders_read_tenant on module_files.file_folders
  for select using (tenant_id = core.current_tenant_id());
exception
  when duplicate_object then null;
end $$;

grant usage on schema module_files to authenticated;
grant select on table module_files.file_entries to authenticated;
grant select on table module_files.file_folders to authenticated;

alter table module_files.file_entries replica identity full;
alter table module_files.file_folders replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_files.file_entries;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table module_files.file_folders;
exception
  when duplicate_object then null;
end $$;
