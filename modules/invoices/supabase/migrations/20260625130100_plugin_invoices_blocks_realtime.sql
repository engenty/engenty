-- Realtime: authenticated SELECT + publication + full replica identity for the
-- invoices live-cache signals (see modules/invoices/ui/invoices-live-binding.ts).
-- Mirrors the offers realtime migration. REPLICA IDENTITY FULL makes DELETE
-- events (and the tenant_id filter) carry the full row, not just the primary key.

grant usage on schema module_invoices to authenticated;

grant select on table module_invoices.invoices to authenticated;
grant select on table module_invoices.invoice_blocks to authenticated;

alter table module_invoices.invoices replica identity full;
alter table module_invoices.invoice_blocks replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_invoices.invoices;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table module_invoices.invoice_blocks;
exception
  when duplicate_object then null;
end $$;
