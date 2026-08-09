-- Phase A follow-up: keep per-USER policies out of the server lane's way.
--
-- Policies are OR-combined per table AND evaluated for every role they apply
-- to. A pile of pre-existing per-user policies read the JWT subject as
-- `(core.current_jwt() ->> 'sub')::uuid`, and they were all created without a
-- role list — i.e. TO PUBLIC — so they also applied to `engenty_server`. The
-- server lane acts for a tenant rather than a user, so its subject claim is
-- not a user id; the cast then throws
--
--   invalid input syntax for type uuid: "server-lane:<tenant>"
--
-- at plan time and takes the ENTIRE table down for the role — ai.thread and
-- friends meant every chat and agent run failed, core.user_settings meant no
-- setting could be saved. This is the same OR-combination trap that the
-- auth.jwt() rewrite in 20260809200000 fixed, in a new costume: there the
-- offending policy referenced an unreachable schema, here it performs an
-- impossible cast.
--
-- Two independent guards, because either alone would have prevented the
-- outage and we want both:
--   1. the minted server-lane subject is now the nil UUID (see
--      apps/core/src/infra/tenant-db.ts) — it parses, and matches no row;
--   2. this migration scopes the per-user policies to `authenticated`, the
--      only role that both holds grants on these tables and carries a real
--      user subject. service_role bypasses RLS; anon holds no grants here; so
--      this narrows evaluation without changing behaviour for anyone.
--
-- Tenant confinement for the server lane continues to come from the
-- srv_tenant_isolation pair generated in 20260809200000.

do $$
declare
  pol record;
begin
  for pol in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      p.polname as policy_name
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where
      -- policies that read the JWT subject as a uuid ...
      (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%''sub''%::uuid%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%''sub''%::uuid%'
      )
      -- ... and currently apply to PUBLIC (pg_policy stores that as role 0).
      and p.polroles = '{0}'::oid[]
      -- never touch the generated server-lane pair itself
      and p.polname <> 'srv_tenant_isolation'
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      pol.policy_name,
      pol.schema_name,
      pol.table_name
    );
    raise notice 'scoped policy %.%.% to authenticated',
      pol.schema_name, pol.table_name, pol.policy_name;
  end loop;
end
$$;
