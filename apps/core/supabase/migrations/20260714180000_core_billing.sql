-- Billing invoices (docs/internal/manage-app.md §8). An invoice is generated for a
-- tenant + period from its package pricing and metered usage (seats now;
-- box-seconds / storage later). Line items carry the breakdown. Costs in
-- `_micros`. Stripe/dunning automation is deferred; status supports the manual
-- lifecycle (draft -> open -> paid / void) and the dunning -> suspend action.

create table if not exists core.invoices (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  package_id text,
  period_start date not null,
  period_end date not null,
  currency text not null default 'usd',
  total_micros bigint not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'paid', 'void')),
  created_at timestamptz not null default now()
);

create index if not exists invoices_tenant_idx
  on core.invoices(tenant_id, period_start desc);

create table if not exists core.invoice_line_items (
  id uuid primary key default public.uuidv7(),
  invoice_id uuid not null references core.invoices(id) on delete cascade,
  kind text not null,
  description text not null,
  quantity numeric not null default 1,
  unit_price_micros bigint not null default 0,
  amount_micros bigint not null default 0
);

create index if not exists invoice_line_items_invoice_idx
  on core.invoice_line_items(invoice_id);

grant select, insert, update, delete on table core.invoices to service_role;
grant select, insert, update, delete on table core.invoice_line_items to service_role;
