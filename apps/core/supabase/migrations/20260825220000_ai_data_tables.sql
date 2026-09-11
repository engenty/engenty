-- Space databases (Ablage tables): a column definition plus rows, not a CSV
-- artifact blob. The Ablage listing is a handle artifact (`type = database`);
-- the rows live here so agents can insert without rewriting a document.

create table if not exists ai.data_table (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  space_id uuid not null references core.spaces(id) on delete cascade,
  title text not null,
  columns jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists data_table_tenant_space_idx
  on ai.data_table (tenant_id, space_id);

create table if not exists ai.data_table_row (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  table_id uuid not null references ai.data_table(id) on delete cascade,
  cells jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists data_table_row_table_idx
  on ai.data_table_row (tenant_id, table_id);

alter table ai.data_table enable row level security;
alter table ai.data_table_row enable row level security;

grant select, insert, update, delete on table ai.data_table to service_role;
grant select, insert, update, delete on table ai.data_table to engenty_server;
grant select, insert, update, delete on table ai.data_table_row to service_role;
grant select, insert, update, delete on table ai.data_table_row to engenty_server;

drop policy if exists srv_tenant_isolation on ai.data_table;
create policy srv_tenant_isolation on ai.data_table
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

drop policy if exists srv_tenant_isolation on ai.data_table_row;
create policy srv_tenant_isolation on ai.data_table_row
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

notify pgrst, 'reload schema';
