-- Consolidated invoices baseline (pre-launch).

-- >>> from 20260223105000_plugin_module_invoices.sql
-- Squashed invoices baseline (pre-launch).

-- >>> from 20260223105000_plugin_module_invoices.sql
-- Invoices module baseline schema, table, and storage bucket.

create schema if not exists module_invoices;

create table if not exists module_invoices.invoices (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  number text not null,
  date date not null,
  due_date date not null,
  content text not null,
  sum_netto numeric(12,2) not null,
  tax numeric(12,2) not null,
  sum_brutto numeric(12,2) not null,
  client_id text,
  recipient_snapshot jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  unique (tenant_id, scope_id, number)
);

create index if not exists idx_module_invoices_scope
  on module_invoices.invoices (tenant_id, scope_id, date desc);

grant usage on schema module_invoices to service_role;
grant select, insert, update, delete on all tables in schema module_invoices to service_role;

alter table module_invoices.invoices enable row level security;

create policy invoices_read_own_scope on module_invoices.invoices
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'module-invoices-pdfs',
  'module-invoices-pdfs',
  false,
  52428800,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- >>> from 20260408120100_plugin_invoices_count_by_clients.sql
-- Batched invoice counts per client_id for contacts list (avoids N+1 listByClient).
-- Function lives in public so PostgREST can invoke it via rpc(); implementation reads module_invoices.invoices.

create or replace function public.module_invoices_count_invoices_by_client_ids(
  p_tenant_id uuid,
  p_scope_id text,
  p_client_ids text[]
)
returns table (client_id text, invoice_count bigint)
language sql
stable
as $$
  select u.cid, coalesce(agg.cnt, 0)::bigint as invoice_count
  from unnest(p_client_ids) as u(cid)
  left join (
    select inv.client_id, count(*)::bigint as cnt
    from module_invoices.invoices inv
    where inv.tenant_id = p_tenant_id
      and inv.scope_id = p_scope_id
      and inv.deleted_at is null
    group by inv.client_id
  ) agg on agg.client_id = u.cid;
$$;

revoke all on function public.module_invoices_count_invoices_by_client_ids(uuid, text, text[]) from public;
grant execute on function public.module_invoices_count_invoices_by_client_ids(uuid, text, text[]) to service_role;
