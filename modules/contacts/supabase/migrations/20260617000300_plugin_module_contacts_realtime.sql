-- Realtime: authenticated SELECT + publication + full replica identity for the
-- contacts live-cache signals (see modules/contacts/ui/contacts-live-binding.ts).
-- Only tables with tenant_id + an RLS SELECT policy are eligible; realtime
-- evaluates that policy per subscriber. REPLICA IDENTITY FULL makes DELETE events
-- (and the tenant_id filter) carry the full row, not just the primary key.

grant usage on schema module_contacts to authenticated;

grant select on table module_contacts.contacts to authenticated;
grant select on table module_contacts.contact_relations to authenticated;

alter table module_contacts.contacts replica identity full;
alter table module_contacts.contact_relations replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_contacts.contacts;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table module_contacts.contact_relations;
exception
  when duplicate_object then null;
end $$;
