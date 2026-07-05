-- Offers: richer ready/accepted lifecycle detail (parity with engency).
--  * Internal notes, approval/acceptance timestamps.
--  * Contract status (signed marker, notes, uploaded file path).
--  * Linked project + version chain (parent/version number).
--  * Billing plan (Abrechnungsplan) stored as jsonb.

alter table module_offers.offers
  add column if not exists internal_notes text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_name text,
  add column if not exists accepted_at timestamptz,
  add column if not exists project_id text,
  add column if not exists contract_signed_at timestamptz,
  add column if not exists contract_notes text,
  add column if not exists contract_file_path text,
  add column if not exists version_number integer not null default 1,
  add column if not exists parent_offer_id text,
  add column if not exists billing_plan jsonb;

create index if not exists idx_module_offers_parent_offer_id
  on module_offers.offers (parent_offer_id);
