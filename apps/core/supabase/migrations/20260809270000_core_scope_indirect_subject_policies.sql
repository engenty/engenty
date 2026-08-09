-- Phase A follow-up 2: the same fix as 20260809250000, for the INDIRECT case.
--
-- 20260809250000 scoped per-user policies that cast the JWT subject to uuid
-- *in their own expression text*. That missed the far more common shape,
-- because our own module-migration guidance tells authors to write
--
--     using (user_id = core.current_user_id())
--
-- rather than digging the claim out by hand — and core.current_user_id() is
-- `nullif(core.current_jwt() ->> 'sub','')::uuid`. The cast is one level down,
-- so those policies contain neither 'sub' nor ::uuid, were left applying to
-- PUBLIC, and would take their tables down for engenty_server exactly like
-- ai.thread and core.user_settings did. Following the documented advice is
-- what made them invisible.
--
-- Same reasoning as before: these policies express per-USER ownership and only
-- mean anything for a role carrying a real user subject, so they belong to
-- `authenticated`. Tenant confinement for the server lane keeps coming from
-- the srv_tenant_isolation pair.
--
-- Safety: a policy is only re-scoped when its table ALSO has
-- srv_tenant_isolation, so this can never be the change that leaves the lane
-- with no way in.

do $$
declare
  pol record;
  scoped int := 0;
begin
  for pol in
    with subject_casting_fns as (
      -- any helper whose body turns the subject claim into a uuid
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('core','ai','search','context_graph','public')
        and p.prosrc like '%''sub''%'
        and p.prosrc like '%::uuid%'
    )
    select
      n.nspname as schema_name,
      c.relname as table_name,
      p.polname as policy_name
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.polroles = '{0}'::oid[]
      and p.polname <> 'srv_tenant_isolation'
      and (
        -- inline cast (already handled by 20260809250000; kept so this
        -- migration is complete on its own on a fresh database)
        coalesce(pg_get_expr(p.polqual, p.polrelid), '')
          || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
          like '%''sub''%::uuid%'
        -- or the cast reached through a helper function
        or exists (
          select 1 from subject_casting_fns f
          where coalesce(pg_get_expr(p.polqual, p.polrelid), '')
             || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
             like '%' || f.proname || '(%'
        )
      )
      -- never strand the lane: only touch tables that keep their own policy
      and exists (
        select 1 from pg_policy sp
        where sp.polrelid = p.polrelid
          and sp.polname = 'srv_tenant_isolation'
      )
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      pol.policy_name, pol.schema_name, pol.table_name
    );
    scoped := scoped + 1;
    raise notice 'scoped %.%.% to authenticated',
      pol.schema_name, pol.table_name, pol.policy_name;
  end loop;
  raise notice 'indirect-subject policy scoping complete: % policies', scoped;
end
$$;
