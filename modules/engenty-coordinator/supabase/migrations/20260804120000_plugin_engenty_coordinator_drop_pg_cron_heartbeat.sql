-- Drop the pg_cron coordinator heartbeat: it is the third generation of a
-- mechanism that has moved on twice, and it can no longer work.
--
-- Generation 1 (20260608230000): pg_cron job 'engenty-coordinator-heartbeat'
--   → private.trigger_coordinator_heartbeat() → POST /ai/v1/conductor/run,
--   authenticated with the 'conductor_service_jwt' Vault secret.
-- Generation 2 (20260611180000): the routines cutover unscheduled that job and
--   routed the heartbeat through private.trigger_engenty_routines_tick()
--   → POST /ai/v1/routines/tick. The function below was kept only "until the
--   routine cycle is verified live".
-- Generation 3 (20260702000200): the Triggers cutover dropped the routines tick
--   function and its tables outright. The heartbeat now runs as a scheduled
--   Trigger driven by the apps/ai Mastra scheduler (see apps/ai/src/scheduler/),
--   which is what materializes the "Coordinator heartbeat" trigger row today.
--
-- What was left behind: a SECURITY DEFINER function with no cron job pointing
-- at it, POSTing to /ai/v1/conductor/run — a route apps/ai no longer serves —
-- and reading a Vault secret that nothing can produce since the static service
-- JWT and its mint script were deleted in v0.1.93 (ENGENTY_AI_SERVICE_SECRET is
-- now the only service credential, exchanged for short-lived tokens over HTTP).
--
-- Nothing reads 'conductor_service_jwt' after this migration. If a deployment
-- still has that Vault secret, it is inert and can be removed:
--   select vault.delete_secret(id) from vault.secrets
--    where name = 'conductor_service_jwt';
-- It is deliberately NOT deleted here: dropping another deployment's secret
-- from a migration is not this migration's call to make.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'engenty-coordinator-heartbeat'
  ) THEN
    PERFORM cron.unschedule('engenty-coordinator-heartbeat');
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- pg_cron not installed in this environment; nothing to unschedule.
    NULL;
END;
$$;

DROP FUNCTION IF EXISTS private.trigger_coordinator_heartbeat(text);
