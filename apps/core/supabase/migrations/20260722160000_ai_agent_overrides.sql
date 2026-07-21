-- Per-agent overrides (AI settings redesign, Phase 4). All nullable/additive so
-- existing agents keep inheriting tenant defaults until an operator pins a value.
--
--   model_override  explicit model id; beats the tenant/purpose default.
--   purpose         which tenant model tier the agent inherits when not pinned
--                   (chat | routing | research | planning_coding | safeguard).
--                   NULL = structural default (supervisors route, leaves chat).
--   max_steps       per-agent iteration cap; clamped to the platform max at runtime.
--   budget          per-agent spend cap, e.g. { "maxCostMicrosPerPeriod": 5000000 }.
--
-- Per-agent spend is metered by summing ai.usage_event (which already carries
-- agent_id) over the tenant period — no usage-table change needed.

ALTER TABLE "ai"."engenty_ai_agents"
  ADD COLUMN IF NOT EXISTS "model_override" text,
  ADD COLUMN IF NOT EXISTS "purpose" text,
  ADD COLUMN IF NOT EXISTS "max_steps" integer,
  ADD COLUMN IF NOT EXISTS "budget" jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'engenty_ai_agents_purpose_check'
  ) THEN
    ALTER TABLE "ai"."engenty_ai_agents"
      ADD CONSTRAINT "engenty_ai_agents_purpose_check"
      CHECK (
        "purpose" IS NULL OR "purpose" IN (
          'chat', 'routing', 'research', 'planning_coding', 'safeguard'
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'engenty_ai_agents_max_steps_check'
  ) THEN
    ALTER TABLE "ai"."engenty_ai_agents"
      ADD CONSTRAINT "engenty_ai_agents_max_steps_check"
      CHECK ("max_steps" IS NULL OR ("max_steps" >= 1 AND "max_steps" <= 60));
  END IF;
END $$;
