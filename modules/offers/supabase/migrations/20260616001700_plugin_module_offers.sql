-- Consolidated offers baseline (pre-launch).

-- >>> from 20260226183000_plugin_module_offers.sql
-- Squashed offers baseline (pre-launch).

-- >>> from 20260226183000_plugin_module_offers.sql
-- Offers module: schema, tables, RLS.

create schema if not exists module_offers;

create table if not exists module_offers.offers (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  client_id text references module_contacts.contacts(id) on delete set null,
  title text not null,
  offer_number text not null,
  status text not null default 'draft' check (status in ('draft', 'done', 'accepted')),
  reference text,
  offer_date date,
  valid_until date,
  introduction text,
  final_notes text,
  currency text not null default 'EUR',
  recipient_name text,
  recipient_address text,
  recipient_email text,
  recipient_custom_info text,
  show_contact_name boolean not null default true,
  show_contact_email boolean not null default true,
  billing_type text not null default 'fixed_price' check (billing_type in ('fixed_price', 'time_and_materials', 'retainer', 'recurring')),
  billing_interval text check (billing_interval in ('monthly', 'quarterly', 'yearly')),
  retainer_amount numeric(12,2),
  spillover_rules text,
  allows_fixed_positions boolean not null default false,
  usage_based boolean not null default false,
  default_tax_rate numeric(5,2) not null default 20,
  show_tax_per_item boolean not null default false,
  no_tax_reason text,
  phases_enabled boolean not null default false,
  show_phase_index boolean not null default false,
  phase_index_pattern text not null default '1.',
  show_phase_totals boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  settings_json jsonb not null default '{}'::jsonb,
  created_by uuid references core.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_module_offers_scope
  on module_offers.offers (tenant_id, scope_id, updated_at desc);

create index if not exists idx_module_offers_client
  on module_offers.offers (client_id) where client_id is not null;

create table if not exists module_offers.offer_blocks (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  offer_id text not null references module_offers.offers(id) on delete cascade,
  type text not null check (type in ('phase', 'headline', 'subheading', 'text', 'line_item')),
  content_json jsonb not null default '{}'::jsonb,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_offer_blocks_scope
  on module_offers.offer_blocks (tenant_id, scope_id, offer_id, order_index);

grant usage on schema module_offers to service_role;
grant select, insert, update, delete on module_offers.offers to service_role;
grant select, insert, update, delete on module_offers.offer_blocks to service_role;

alter table module_offers.offers enable row level security;
alter table module_offers.offer_blocks enable row level security;

create policy offers_read_own_scope on module_offers.offers
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy offers_insert_own_scope on module_offers.offers
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy offers_update_own_scope on module_offers.offers
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy offers_delete_own_scope on module_offers.offers
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy offer_blocks_read_own_scope on module_offers.offer_blocks
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy offer_blocks_insert_own_scope on module_offers.offer_blocks
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy offer_blocks_update_own_scope on module_offers.offer_blocks
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy offer_blocks_delete_own_scope on module_offers.offer_blocks
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260227133000_plugin_offer_templates.sql
-- Offers module templates and default template wiring.

create table if not exists module_offers.templates (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  template_type text not null default 'offer' check (template_type in ('offer')),
  name text not null,
  is_default boolean not null default false,
  content_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_module_offers_templates_scope
  on module_offers.templates (tenant_id, scope_id, template_type, name);

create unique index if not exists idx_module_offers_templates_default
  on module_offers.templates (tenant_id, scope_id, template_type)
  where is_default = true and deleted_at is null;

alter table module_offers.offers
  add column if not exists template_id text references module_offers.templates(id) on delete set null;

create index if not exists idx_module_offers_template_id
  on module_offers.offers (template_id);

grant select, insert, update, delete on module_offers.templates to service_role;

alter table module_offers.templates enable row level security;

create policy templates_read_own_scope on module_offers.templates
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy templates_insert_own_scope on module_offers.templates
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy templates_update_own_scope on module_offers.templates
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy templates_delete_own_scope on module_offers.templates
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260227182000_plugin_offer_settings.sql
-- Offer module settings (tenant/scope-level defaults).

create table if not exists module_offers.settings (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  offer_id_prefix text not null default 'ang-{year}-',
  offer_id_offset integer not null default 1000,
  offer_id_postfix text not null default '',
  default_intro text not null default '',
  default_final_notes text not null default '',
  valid_until_days integer not null default 30,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, scope_id)
);

create index if not exists idx_module_offers_settings_scope
  on module_offers.settings (tenant_id, scope_id);

grant select, insert, update, delete on module_offers.settings to service_role;

alter table module_offers.settings enable row level security;

create policy settings_read_own_scope on module_offers.settings
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy settings_insert_own_scope on module_offers.settings
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy settings_update_own_scope on module_offers.settings
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy settings_delete_own_scope on module_offers.settings
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260227210500_plugin_offer_number_unique.sql
-- Enforce unique offer numbers per tenant/scope for active offers.
create unique index if not exists idx_module_offers_offer_number_unique
  on module_offers.offers (tenant_id, scope_id, offer_number)
  where deleted_at is null;

-- >>> from 20260320124500_plugin_offer_shared_pdf_templates.sql
alter table module_offers.offers
  drop constraint if exists offers_template_id_fkey;

alter table module_offers.offers
  add constraint offers_template_id_fkey
  foreign key (template_id)
  references module_pdf_templates.templates(id)
  on delete set null;
