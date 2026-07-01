-- Add "cheap" to the gateway_model price_tier check constraint.
-- The old constraint only allowed: low, medium, high, expensive.
-- The new 5-tier system adds "cheap" for zero-cost / lowest-quintile models.

ALTER TABLE "ai"."gateway_model"
  DROP CONSTRAINT "gateway_model_price_tier_check";

ALTER TABLE "ai"."gateway_model"
  ADD CONSTRAINT "gateway_model_price_tier_check"
  CHECK (
    ("price_tier" IS NULL)
    OR ("price_tier" = ANY (ARRAY[
      'cheap'::text,
      'low'::text,
      'medium'::text,
      'high'::text,
      'expensive'::text
    ]))
  );
