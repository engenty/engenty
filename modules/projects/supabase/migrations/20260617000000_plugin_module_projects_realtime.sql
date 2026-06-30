-- Realtime: authenticated SELECT + publication + full replica identity for the
-- projects live-cache signals (see modules/projects/ui/projects-live-binding.ts).
-- Only tables that carry tenant_id and an RLS SELECT policy are eligible: the
-- live cache filters on tenant_id, and realtime postgres_changes evaluates the
-- table's RLS SELECT policy as the connected user. (Project task rows live in
-- module_tasks via the bridge and are published by the tasks module.)
-- REPLICA IDENTITY FULL makes DELETE events (and the tenant_id filter) carry the
-- full row, not just the primary key.

grant usage on schema module_projects to authenticated;

grant select on table module_projects.projects to authenticated;
grant select on table module_projects.project_phases to authenticated;

alter table module_projects.projects replica identity full;
alter table module_projects.project_phases replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_projects.projects;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table module_projects.project_phases;
exception
  when duplicate_object then null;
end $$;
