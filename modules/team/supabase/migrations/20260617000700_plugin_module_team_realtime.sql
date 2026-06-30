-- Realtime: authenticated SELECT + publication + full replica identity for the
-- core team live-cache signal (see modules/team/ui/team-live-binding.ts) so a
-- member profile edit in one window refreshes every other open window with no
-- reload. Only tables with tenant_id + an RLS SELECT policy are eligible;
-- realtime evaluates that policy per subscriber. REPLICA IDENTITY FULL makes
-- DELETE events (and the tenant_id filter) carry the full row, not just the PK.
-- HR tables (employees, contracts, gallery) publish from team-hr.

grant usage on schema module_team to authenticated;

grant select on table module_team.profiles to authenticated;

alter table module_team.profiles replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_team.profiles;
exception
  when duplicate_object then null;
end $$;
