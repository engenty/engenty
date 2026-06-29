-- Phase 5 — durable HITL run lifecycle states.
-- An action/task run that suspends for human input is neither finished nor a
-- naked "running" — represent it explicitly so the UI (button/admin/reattach)
-- and the audit row reflect a paused-not-done run.
--   requires_action: suspended awaiting human input (approve/reject/answer).
--   paused:          suspended without an outstanding human request.
-- ADD VALUE is not used in the same migration, so it is safe inside the tx.
ALTER TYPE "ai"."agent_run_status" ADD VALUE IF NOT EXISTS 'requires_action';
ALTER TYPE "ai"."agent_run_status" ADD VALUE IF NOT EXISTS 'paused';

-- The per-subject action_request audit/dedup row mirrors the run lifecycle.
ALTER TABLE "ai"."action_request"
  DROP CONSTRAINT "action_request_status_check";

ALTER TABLE "ai"."action_request"
  ADD CONSTRAINT "action_request_status_check" CHECK (
    "status" = ANY (ARRAY[
      'requested'::"text",
      'coalesced'::"text",
      'skipped'::"text",
      'claimed'::"text",
      'converted_to_run'::"text",
      'cancelled'::"text",
      'dispatched'::"text",
      'completed'::"text",
      'failed'::"text",
      'requires_action'::"text",
      'paused'::"text"
    ])
  );
