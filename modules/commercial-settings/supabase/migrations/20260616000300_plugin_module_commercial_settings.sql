-- Consolidated commercial-settings baseline (pre-launch).

-- >>> from 20260228120100_plugin_module_commercial_settings.sql
-- Squashed commercial-settings baseline (pre-launch).

-- >>> from 20260228120100_plugin_module_commercial_settings.sql
-- Commercial settings per tenant/scope (currency, tax, units, disciplines)
create schema if not exists module_commercial_settings;

create table if not exists module_commercial_settings.settings (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  default_locale text,
  number_locale text,
  currency text,
  currency_symbol text,
  tax_rates_json text,
  no_tax_reason text,
  units_json text,
  disciplines_json text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, scope_id)
);

grant usage on schema module_commercial_settings to service_role;
grant select, insert, update, delete on module_commercial_settings.settings to service_role;
alter table module_commercial_settings.settings enable row level security;

create policy commercial_settings_read_own_scope on module_commercial_settings.settings
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy commercial_settings_insert_own_scope on module_commercial_settings.settings
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy commercial_settings_update_own_scope on module_commercial_settings.settings
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260320200000_plugin_commercial_settings_expense_categories.sql
-- Add expense categories and tax deduction rules to commercial settings
alter table module_commercial_settings.settings
  add column if not exists expense_categories_json text,
  add column if not exists tax_deduction_rules_json text;
