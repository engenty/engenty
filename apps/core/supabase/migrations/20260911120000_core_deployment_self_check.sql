-- One RPC that answers "is this database wired up for engenty?" over PostgREST,
-- so an operator can check a hosted install with nothing but SUPABASE_URL and
-- the service-role key — no Postgres driver, no shell on the database host.
--
-- It reports the two facts that are otherwise invisible until something fails
-- much later: whether the access-token hook exists, and whether GoTrue can
-- actually reach it. A missing grant here is the cause of "valid login returns
-- Unauthorized" and of realtime silently never starting.
--
-- security definer, because service_role has no rights on supabase_migrations
-- and we want the applied-migration count in the same answer. It reads
-- catalogs and the migration ledger only, and is granted to service_role alone.

create or replace function core.deployment_self_check()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'hook_function_exists', exists (
      select 1
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'core'
         and p.proname = 'custom_access_token_hook'
    ),
    'hook_executable_by_auth', coalesce(
      (
        select pg_catalog.has_function_privilege(
          'supabase_auth_admin',
          p.oid,
          'EXECUTE'
        )
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'core'
           and p.proname = 'custom_access_token_hook'
         limit 1
      ),
      false
    ),
    'auth_can_use_core_schema',
      pg_catalog.has_schema_privilege('supabase_auth_admin', 'core', 'USAGE'),
    'auth_can_read_users',
      pg_catalog.has_table_privilege(
        'supabase_auth_admin', 'core.users', 'SELECT'
      ),
    'auth_can_read_tenant_settings',
      pg_catalog.has_table_privilege(
        'supabase_auth_admin', 'core.tenant_settings', 'SELECT'
      ),
    'schemas', coalesce(
      (
        select pg_catalog.jsonb_agg(n.nspname order by n.nspname)
          from pg_catalog.pg_namespace n
         where n.nspname not like 'pg\_%'
           and n.nspname <> 'information_schema'
      ),
      '[]'::jsonb
    ),
    'applied_migrations', (
      select pg_catalog.count(*) from supabase_migrations.schema_migrations
    ),
    'latest_migration', (
      select pg_catalog.max(version) from supabase_migrations.schema_migrations
    )
  );
$$;

-- Operator-only: the reply names grants and migration state, which is not
-- something an anon or signed-in caller has any business reading.
revoke all on function core.deployment_self_check() from public;
grant execute on function core.deployment_self_check() to service_role;
