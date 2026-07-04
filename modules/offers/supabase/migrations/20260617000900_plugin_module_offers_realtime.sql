-- Realtime: authenticated SELECT + publication + full replica identity for the
-- offers live-cache signals (see modules/offers/ui/offers-live-binding.ts).
-- Only tables with tenant_id + an RLS SELECT policy are eligible; realtime
-- evaluates that policy per subscriber. REPLICA IDENTITY FULL makes DELETE events
-- (and the tenant_id filter) carry the full row, not just the primary key.

grant usage on schema module_offers to authenticated;

grant select on table module_offers.offers to authenticated;
grant select on table module_offers.offer_blocks to authenticated;

alter table module_offers.offers replica identity full;
alter table module_offers.offer_blocks replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_offers.offers;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table module_offers.offer_blocks;
exception
  when duplicate_object then null;
end $$;
