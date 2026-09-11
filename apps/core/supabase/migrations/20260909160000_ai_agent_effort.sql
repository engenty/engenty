-- Per-agent default thinking tier. Nullable/additive.
--
--   effort  the tier an agent's turns run at whenever nobody chose one: the
--           person left the composer on Auto, or the turn is a hand-off, a
--           delegation or a routine. An explicit pick on the person's own desk
--           still wins. NULL = sized from the turn (an agent holding a coding
--           tool defaults to high regardless — see agentDefaultEffort).

ALTER TABLE "ai"."engenty_ai_agents"
  ADD COLUMN IF NOT EXISTS "effort" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'engenty_ai_agents_effort_check'
  ) THEN
    ALTER TABLE "ai"."engenty_ai_agents"
      ADD CONSTRAINT "engenty_ai_agents_effort_check"
      CHECK ("effort" IS NULL OR "effort" IN ('low', 'medium', 'high'));
  END IF;
END $$;
