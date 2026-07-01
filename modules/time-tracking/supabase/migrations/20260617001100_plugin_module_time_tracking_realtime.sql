-- Realtime: authenticated SELECT + publication + full replica identity for the
-- time-tracking live-cache signal (see
-- modules/time-tracking/ui/time-tracking-live-binding.ts). time_entries has
-- tenant_id + an RLS SELECT policy; realtime evaluates that policy per subscriber.

grant usage on schema module_time_tracking to authenticated;
grant select on table module_time_tracking.time_entries to authenticated;

alter table module_time_tracking.time_entries replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_time_tracking.time_entries;
exception
  when duplicate_object then null;
end $$;
