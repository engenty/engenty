-- Agent-registry governance: lets agents (coordinator) PROPOSE new agents or
-- revisions to existing ones, with a human approve/reject gate — mirroring the
-- memory module's proposed→active pattern.
--
--   status           whole-row lifecycle. 'proposed' rows never load into the
--                    runtime registry (DatabaseProvider filters to 'active').
--   proposed_config  a pending full-config revision for an ACTIVE agent, so an
--                    agent under evolution stays online until a human approves.
--   created_by_agent agent_type_key of the proposing agent; NULL = human.

ALTER TABLE "ai"."engenty_ai_agents"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "proposed_config" jsonb,
  ADD COLUMN IF NOT EXISTS "created_by_agent" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'engenty_ai_agents_status_check'
  ) THEN
    ALTER TABLE "ai"."engenty_ai_agents"
      ADD CONSTRAINT "engenty_ai_agents_status_check"
      CHECK ("status" IN ('proposed', 'active', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "engenty_ai_agents_status_idx"
  ON "ai"."engenty_ai_agents" ("tenant_id", "status");
