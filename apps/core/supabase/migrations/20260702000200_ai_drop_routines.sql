-- Routines cutover: the homegrown routine scheduler (pg_cron tick +
-- ai.routine_state / ai.custom_routine) is replaced by the Trigger domain
-- (module_tasks.triggers + task_templates) backed by Mastra heartbeats.
-- See modules/tasks migration 20260702000100_plugin_tasks_triggers.sql and
-- apps/ai src/scheduler/.
--
-- Existing custom routines were already interpreted as task templates at read
-- time (name → title, prompt → description, agent_id → assignee); recreate any
-- still needed as Triggers via the management UI before applying in
-- production. Dev/local: the tables carried per-tenant toggle state only.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('engenty-routines-tick');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Job was never registered in this environment.
  NULL;
END $$;

DROP FUNCTION IF EXISTS private.trigger_engenty_routines_tick(text);

DROP TABLE IF EXISTS "ai"."custom_routine";
DROP TABLE IF EXISTS "ai"."routine_state";
