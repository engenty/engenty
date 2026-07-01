-- Consolidated engenty-coordinator baseline (pre-launch).

-- >>> from 20260608230000_plugin_engenty_coordinator.sql
-- Migration: coordinator pg_cron heartbeat setup
-- Registers a pg_cron job that POSTs to /ai/v1/coordinator/run every hour.
-- The call is made with the Supabase pg_net extension.
-- The coordinator system user's JWT is stored as a Supabase Vault secret:
--   select vault.create_secret('<jwt>', 'conductor_service_jwt');
-- Then updated per-tenant by the tenant provisioning flow.
--
-- Per Q3 decision: Coordinator runs as a real tenant user (same RLS model
-- as other users). No service-role bypass. The JWT belongs to a dedicated
-- "coordinator" system account provisioned during tenant setup.

-- Enable pg_net extension if not already present (requires Supabase pg_net enabled in project settings)
create extension if not exists pg_net with schema extensions;

-- Enable pg_cron extension if not already present
create extension if not exists pg_cron with schema extensions;

-- Ensure the private schema exists (not present by default in all Supabase setups)
create schema if not exists private;

-- Helper function: trigger a coordinator heartbeat for a single tenant.
-- Looks up the coordinator JWT from Vault, POSTs to the AI service endpoint.
-- The AI service URL is configured via the coordinator_ai_base_url setting.
create or replace function private.trigger_coordinator_heartbeat(
  p_ai_base_url text
) returns void
language plpgsql
security definer
as $$
begin
  declare
    v_jwt text;
  begin
    select secret into v_jwt from vault.decrypted_secrets where name = 'conductor_service_jwt' limit 1;
    
    if v_jwt is null then
      raise exception 'conductor_service_jwt not found in vault';
    end if;

    perform
      extensions.http_post(
        url := p_ai_base_url || '/ai/v1/conductor/run',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_jwt,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'session_key', null  -- uses default per-tenant stable key
        )::text
      );
  end;
end;
$$;

-- Cron job: fire the coordinator heartbeat every hour.
-- The actual per-tenant dispatch is handled by the application layer
-- (the coordinator route resolves tenant from the JWT).
-- To enable: call from the Supabase dashboard or via your provisioning script:
--
--   select cron.schedule(
--     'engenty-coordinator-heartbeat',
--     '0 * * * *',
--     $$
--       select private.trigger_coordinator_heartbeat(
--         'http://127.0.0.1:8790' -- or current_setting('app.coordinator_ai_base_url', true)
--       );
--     $$
--   );
--
-- The job is NOT auto-registered here because the JWT and base URL must be
-- configured first via Vault/settings. Register it during tenant provisioning
-- or via the Coordinator admin panel once those values are set.

comment on function private.trigger_coordinator_heartbeat(text) is
  'Fires a Coordinator heartbeat POST to the AI service. Called by pg_cron on schedule.';

-- >>> from 20260611180000_plugin_engenty_coordinator_routines_cutover.sql
-- Phase 4 cutover: the coordinator heartbeat now runs through the generic
-- routines tick (private.trigger_engenty_routines_tick → /ai/v1/routines/tick
-- → engenty-coordinator.heartbeat ROUTINE.md). Unschedule the dedicated cron
-- job if it was registered. The private.trigger_coordinator_heartbeat function
-- stays until the routine cycle is verified live (see TRASHBIN.md).
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
