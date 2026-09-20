-- The public.pgmq_* wrappers are SECURITY DEFINER and meant for service_role
-- only. The initial schema revokes them FROM PUBLIC, but on a fresh Supabase
-- database the default privileges for schema public grant EXECUTE on new
-- functions directly to anon and authenticated, and a PUBLIC revoke does not
-- touch those direct grants — so on CI's fresh database the browser lane
-- could call the queue. Revoke explicitly; no-op on databases that never had
-- the grant. Found by scripts/check-server-lane-coverage.mjs (rule 3).
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.pgmq_archive(text, bigint)',
    'public.pgmq_delete(text, bigint)',
    'public.pgmq_list_queues()',
    'public.pgmq_metrics(text)',
    'public.pgmq_peek(text, integer)',
    'public.pgmq_pop(text)',
    'public.pgmq_read(text, integer, integer)',
    'public.pgmq_send(text, jsonb, integer)',
    'public.pgmq_send_batch(text, jsonb[], integer)'
  ] loop
    if to_regprocedure(fn) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', fn);
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end $$;
