-- Offers: align lifecycle with engency.
--  * Rename status value 'done' -> 'ready' (label was already "Ready").
--  * Add sent_at (Mark-as-Sent marker; no new status).
--  * Add lead_id for the lead -> offer handoff.

-- Status value rename. The inline column check is named offers_status_check.
alter table module_offers.offers
  drop constraint if exists offers_status_check;

update module_offers.offers
  set status = 'ready'
  where status = 'done';

alter table module_offers.offers
  add constraint offers_status_check
  check (status in ('draft', 'ready', 'accepted'));

-- "Mark as Sent" timestamp marker.
alter table module_offers.offers
  add column if not exists sent_at timestamptz;

-- Lead -> offer handoff linkage. Plain column for now: the leads module is not
-- migrated yet, so the FK to module_leads.leads(id) must ship with the leads
-- module's own migration.
alter table module_offers.offers
  add column if not exists lead_id text;

create index if not exists idx_module_offers_lead_id
  on module_offers.offers (lead_id);
