-- Per-agent model overrides (AI settings redesign, Phase 4). Nullable/additive.
-- Iteration cap and spend budget live in the `limits` jsonb column added by
-- 20260722150000_ai_agent_limits (limits.max_steps, limits.budget); this migration
-- only adds the model-routing overrides.
--
--   model_override  explicit model id; beats the tenant/purpose default.
--   purpose         which tenant model tier the agent inherits when not pinned
--                   (chat | routing | research | planning_coding | safeguard).
--                   NULL = structural default (supervisors route, leaves chat).

ALTER TABLE "ai"."engenty_ai_agents"
  ADD COLUMN IF NOT EXISTS "model_override" text,
  ADD COLUMN IF NOT EXISTS "purpose" text;

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
END $$;
