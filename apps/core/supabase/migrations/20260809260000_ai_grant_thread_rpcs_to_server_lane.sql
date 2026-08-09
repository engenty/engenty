-- Phase A follow-up: the ai.* thread RPCs must be callable by the server lane.
--
-- ai.upsert_thread_with_owner and ai.merge_thread_metadata predate the
-- engenty_server role. They were written when apps/ai talked to the database
-- as service_role, so 20260806120000_ai_thread_owner_atomic.sql locked their
-- ACL to `postgres` and `service_role` and revoked the rest. WP6 then moved
-- apps/ai onto tenant-locked handles — which run as engenty_server — and the
-- grant never followed. Reads worked (plain table policies), but creating a
-- chat failed with `agent_threads.createFailed` because PostgREST could not
-- execute the RPC at all.
--
-- Both functions are SECURITY INVOKER, so this grant confers no authority
-- beyond what the caller already has: every statement inside them is still
-- evaluated against the caller's policies, i.e. the tenant wall generated in
-- 20260809200000. This grant makes the function reachable; it does not make
-- it privileged.
--
-- Grants on tenant tables stay untouched. anon/authenticated are deliberately
-- NOT granted: the browser lane reaches these through core, never directly.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'ai'
      and p.proname in ('upsert_thread_with_owner', 'merge_thread_metadata')
  loop
    execute format('grant execute on function %s to engenty_server', fn.signature);
    raise notice 'granted execute on % to engenty_server', fn.signature;
  end loop;
end
$$;
