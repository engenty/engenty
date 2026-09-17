-- MCP client grants, durable task handles, and MCP audience claims.
-- Core is the resource server; Supabase Auth remains the authorization server.

create table if not exists core.mcp_client_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  user_id uuid not null references core.users(id) on delete cascade,
  client_id text not null,
  space_ids text[] not null default '{}',
  module_ids text[] not null default '{}',
  write_enabled boolean not null default false,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, client_id)
);

create index if not exists mcp_client_grants_lookup_idx
  on core.mcp_client_grants (tenant_id, user_id, client_id)
  where revoked_at is null;

comment on table core.mcp_client_grants is
  'OAuth MCP client grants: user + client_id bound to tenants, Spaces, modules, and a write ceiling.';

create table if not exists core.mcp_tasks (
  id text primary key,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  user_id uuid not null,
  client_id text not null,
  space_id text,
  operation_id text not null,
  input_hash text not null,
  status text not null,
  result jsonb,
  error jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mcp_tasks_status_check check (
    status = any (array[
      'working'::text,
      'input_required'::text,
      'completed'::text,
      'failed'::text,
      'cancelled'::text
    ])
  )
);

create index if not exists mcp_tasks_owner_idx
  on core.mcp_tasks (tenant_id, user_id, client_id, created_at desc);

comment on table core.mcp_tasks is
  'Durable MCP Tasks handles bound to OAuth client, acting user, tenant, Space, and operation.';

create table if not exists core.mcp_settings (
  id integer primary key default 1 check (id = 1),
  resource_url text not null default 'http://127.0.0.1:8787/mcp',
  audience text not null default 'engenty-mcp'
);

insert into core.mcp_settings (id) values (1)
on conflict (id) do nothing;

alter table core.mcp_client_grants enable row level security;
alter table core.mcp_tasks enable row level security;
alter table core.mcp_settings enable row level security;

create policy mcp_client_grants_select on core.mcp_client_grants
  for select using (tenant_id = core.current_tenant_id());
create policy mcp_client_grants_mutate on core.mcp_client_grants
  for all using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());
create policy srv_mcp_client_grants on core.mcp_client_grants
  to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

create policy mcp_tasks_select on core.mcp_tasks
  for select using (tenant_id = core.current_tenant_id());
create policy mcp_tasks_mutate on core.mcp_tasks
  for all using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());
create policy srv_mcp_tasks on core.mcp_tasks
  to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

create policy mcp_settings_select on core.mcp_settings
  for select using (true);

grant select, insert, delete, update on table core.mcp_client_grants to service_role;
grant select, insert, delete, update on table core.mcp_client_grants to engenty_server;
grant select on table core.mcp_client_grants to authenticated;

grant select, insert, delete, update on table core.mcp_tasks to service_role;
grant select, insert, delete, update on table core.mcp_tasks to engenty_server;
grant select on table core.mcp_tasks to authenticated;

grant select, insert, update on table core.mcp_settings to service_role;
grant select on table core.mcp_settings to engenty_server;
grant select on table core.mcp_settings to authenticated;

create or replace function core.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'core', 'public'
as $$
declare
  claims jsonb;
  v_user_id uuid;
  v_tenant_id uuid;
  v_oauth_client_id text;
  v_mcp_audience text;
begin
  -- Prefix locals with v_ so they never clash with table columns inside
  -- EXISTS/subqueries (PL/pgSQL plans the whole IF expression as SQL).
  v_user_id := coalesce(
    nullif(event ->> 'user_id', '')::uuid,
    nullif(event -> 'claims' ->> 'sub', '')::uuid
  );

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_oauth_client_id := nullif(claims ->> 'client_id', '');

  if v_user_id is not null then
    select u.tenant_id
      into v_tenant_id
      from core.users u
     where u.id = v_user_id
     limit 1;

    if v_tenant_id is not null then
      claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
      claims := jsonb_set(claims, '{scopes}', '["default"]'::jsonb);
    end if;
  end if;

  if v_oauth_client_id is not null
     and v_tenant_id is not null
     and exists (
       select 1
         from core.mcp_client_grants g
        where g.tenant_id = v_tenant_id
          and g.user_id = v_user_id
          and g.client_id = v_oauth_client_id
          and g.revoked_at is null
          and (g.expires_at is null or g.expires_at > now())
     )
  then
    select s.audience into v_mcp_audience from core.mcp_settings s where s.id = 1;
    claims := jsonb_set(
      claims,
      '{aud}',
      to_jsonb(coalesce(v_mcp_audience, 'engenty-mcp'))
    );
    claims := jsonb_set(claims, '{role}', '"agent"'::jsonb);
    claims := jsonb_set(claims, '{acting_for_user_id}', to_jsonb(v_user_id::text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

revoke all on function core.custom_access_token_hook(jsonb) from public;
grant all on function core.custom_access_token_hook(jsonb) to supabase_auth_admin;
