-- Invoices: commercial block structure (parity with offers).
-- Plan 008. Adds block-based content (phases + line items), commercial settings
-- columns, a legal status lifecycle, and the invoice_blocks + settings tables.

-- 1. Commercial columns on invoices ------------------------------------------
alter table module_invoices.invoices
  add column if not exists title text,
  add column if not exists reference text,
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'issued', 'sent', 'paid', 'cancelled')),
  add column if not exists issued_at timestamptz,
  add column if not exists corrects_invoice_id text
    references module_invoices.invoices(id) on delete set null,
  add column if not exists currency text not null default 'EUR',
  add column if not exists introduction text,
  add column if not exists final_notes text,
  add column if not exists recipient_name text,
  add column if not exists recipient_address text,
  add column if not exists recipient_email text,
  add column if not exists recipient_custom_info text,
  add column if not exists show_contact_name boolean not null default true,
  add column if not exists show_contact_email boolean not null default true,
  add column if not exists billing_type text not null default 'fixed_price'
    check (billing_type in ('fixed_price', 'time_and_materials', 'retainer', 'recurring')),
  add column if not exists billing_interval text
    check (billing_interval in ('monthly', 'quarterly', 'yearly')),
  add column if not exists retainer_amount numeric(12,2),
  add column if not exists spillover_rules text,
  add column if not exists allows_fixed_positions boolean not null default false,
  add column if not exists usage_based boolean not null default false,
  add column if not exists default_tax_rate numeric(5,2) not null default 20,
  add column if not exists show_tax_per_item boolean not null default false,
  add column if not exists no_tax_reason text,
  add column if not exists phases_enabled boolean not null default false,
  add column if not exists show_phase_index boolean not null default false,
  add column if not exists phase_index_pattern text not null default '1.',
  add column if not exists show_phase_totals boolean not null default false,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists settings_json jsonb not null default '{}'::jsonb,
  add column if not exists template_id text
    references module_pdf_templates.templates(id) on delete set null;

-- Block-based invoices no longer require the legacy free-text content column.
alter table module_invoices.invoices alter column content drop not null;

create index if not exists idx_module_invoices_status
  on module_invoices.invoices (tenant_id, scope_id, status);

create index if not exists idx_module_invoices_template_id
  on module_invoices.invoices (template_id);

-- 2. Write RLS policies (baseline only had read) -----------------------------
drop policy if exists invoices_insert_own_scope on module_invoices.invoices;
create policy invoices_insert_own_scope on module_invoices.invoices
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

drop policy if exists invoices_update_own_scope on module_invoices.invoices;
create policy invoices_update_own_scope on module_invoices.invoices
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

drop policy if exists invoices_delete_own_scope on module_invoices.invoices;
create policy invoices_delete_own_scope on module_invoices.invoices
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- 3. invoice_blocks (clone of offer_blocks) ----------------------------------
create table if not exists module_invoices.invoice_blocks (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  invoice_id text not null references module_invoices.invoices(id) on delete cascade,
  type text not null check (type in ('phase', 'headline', 'subheading', 'text', 'line_item')),
  content_json jsonb not null default '{}'::jsonb,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_invoice_blocks_scope
  on module_invoices.invoice_blocks (tenant_id, scope_id, invoice_id, order_index);

grant select, insert, update, delete on module_invoices.invoice_blocks to service_role;

alter table module_invoices.invoice_blocks enable row level security;

create policy invoice_blocks_read_own_scope on module_invoices.invoice_blocks
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy invoice_blocks_insert_own_scope on module_invoices.invoice_blocks
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy invoice_blocks_update_own_scope on module_invoices.invoice_blocks
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy invoice_blocks_delete_own_scope on module_invoices.invoice_blocks
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- 4. settings (tenant/scope-level defaults) ----------------------------------
create table if not exists module_invoices.settings (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  invoice_id_prefix text not null default 're-{year}-',
  invoice_id_offset integer not null default 1000,
  invoice_id_postfix text not null default '',
  default_intro text not null default '',
  default_final_notes text not null default '',
  due_in_days integer not null default 14,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, scope_id)
);

create index if not exists idx_module_invoices_settings_scope
  on module_invoices.settings (tenant_id, scope_id);

grant select, insert, update, delete on module_invoices.settings to service_role;

alter table module_invoices.settings enable row level security;

create policy invoice_settings_read_own_scope on module_invoices.settings
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy invoice_settings_insert_own_scope on module_invoices.settings
for insert with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy invoice_settings_update_own_scope on module_invoices.settings
for update using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy invoice_settings_delete_own_scope on module_invoices.settings
for delete using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);
