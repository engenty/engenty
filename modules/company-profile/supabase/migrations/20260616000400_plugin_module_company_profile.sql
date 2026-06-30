-- Consolidated company-profile baseline (pre-launch).

-- >>> from 20260228120000_plugin_module_company_profile.sql
-- Squashed company-profile baseline (pre-launch).

-- >>> from 20260228120000_plugin_module_company_profile.sql
-- Company profile settings per tenant/scope (v1: one legal entity per tenant)
create schema if not exists module_company_profile;

create table if not exists module_company_profile.settings (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  logo_url text,
  brand_name text,
  name text,
  owner text,
  managing_director text,
  address_street text,
  address_zip text,
  address_city text,
  address_country text,
  phone text,
  email text,
  website text,
  imprint_url text,
  company_registration_number text,
  tax_number text,
  vat_id text,
  bank_name text,
  bank_iban text,
  bank_bic text,
  bank_account_name text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, scope_id)
);

grant usage on schema module_company_profile to service_role;
grant select, insert, update, delete on module_company_profile.settings to service_role;
alter table module_company_profile.settings enable row level security;

create policy company_profile_settings_read_own_scope on module_company_profile.settings
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy company_profile_settings_insert_own_scope on module_company_profile.settings
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy company_profile_settings_update_own_scope on module_company_profile.settings
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260304120000_plugin_company_profile_tagline_type.sql
-- Tag line (brand) and company type for conditional field display
alter table module_company_profile.settings
  add column if not exists tag_line text,
  add column if not exists company_type text;

comment on column module_company_profile.settings.tag_line is 'Short brand tagline shown with brand name';
comment on column module_company_profile.settings.company_type is 'One of: sole_proprietorship, company, association, public';

-- >>> from 20260304140000_plugin_company_profile_address_street2.sql
-- Optional second address line (c/o, apartment, etc.)
alter table module_company_profile.settings
  add column if not exists address_street_2 text;
