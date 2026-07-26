-- The model catalog becomes `ai.model`, and the gateway serving a model becomes
-- a column on it instead of a prefix baked into the identifier.
--
-- A catalog id names a model: `provider/model`, exactly one slash, always. The
-- route to it is a different fact, and it was being smuggled into the id --
-- DEFAULT_AI_SAFEGUARD_MODEL_ID shipped as
-- `openrouter/openai/gpt-oss-safeguard-20b`, a two-slash id that no catalog row
-- could ever match because no catalog row is written that way. With the route
-- in its own column that entire class of bug is gone, and one model served by
-- two gateways is two rows rather than two naming conventions.
--
-- `provider` stays what it was: the vendor (anthropic). `gateway` is who serves
-- it (vercel). They are not the same thing and neither can be derived from the
-- other.
--
-- No compatibility view is left behind under the old name. The only reader of
-- this table is the AI service's store, which moves with this migration, so a
-- shim would buy nothing and cost the next reader a "which name do I write to?"
-- question -- an upsert against a view cannot use ON CONFLICT anyway.
--
-- `ai.gateway_model_sync_run` / `ai.gateway_model_sync_settings` keep their
-- names: they record runs of the gateway sync, which is still what they are.
ALTER TABLE IF EXISTS "ai"."gateway_model" RENAME TO "model";

-- Every existing row came from the Vercel AI Gateway, so the default backfills
-- them correctly and the column can be NOT NULL from the start.
ALTER TABLE "ai"."model"
    ADD COLUMN IF NOT EXISTS "gateway" "text" DEFAULT 'vercel'::"text" NOT NULL;

-- The row identity is (gateway, model_id): the same model id may legitimately
-- appear once per gateway, with its own pricing and availability.
ALTER TABLE "ai"."model" DROP CONSTRAINT IF EXISTS "gateway_model_pkey";

-- Guarded so the whole migration is re-runnable. Postgres has no
-- `ADD CONSTRAINT IF NOT EXISTS` and no `RENAME CONSTRAINT IF EXISTS`, so a
-- failure in any later statement would otherwise leave this file permanently
-- unrunnable: the retry dies on the constraint the first attempt already
-- created. That is a bad place to be on a production database at 3am.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conrelid" = 'ai.model'::"regclass" AND "conname" = 'model_pkey'
    ) THEN
        ALTER TABLE "ai"."model"
            ADD CONSTRAINT "model_pkey" PRIMARY KEY ("gateway", "model_id");
    END IF;
END
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conrelid" = 'ai.model'::"regclass"
          AND "conname" = 'gateway_model_price_tier_check'
    ) THEN
        ALTER TABLE "ai"."model"
            RENAME CONSTRAINT "gateway_model_price_tier_check" TO "model_price_tier_check";
    END IF;
    IF EXISTS (
        SELECT 1 FROM "pg_constraint"
        WHERE "conrelid" = 'ai.model'::"regclass"
          AND "conname" = 'gateway_model_use_cases_check'
    ) THEN
        ALTER TABLE "ai"."model"
            RENAME CONSTRAINT "gateway_model_use_cases_check" TO "model_use_cases_check";
    END IF;
END
$$;

ALTER INDEX IF EXISTS "ai"."gateway_model_available_chat_idx" RENAME TO "model_available_chat_idx";

ALTER INDEX IF EXISTS "ai"."gateway_model_available_embedding_idx" RENAME TO "model_available_embedding_idx";

ALTER INDEX IF EXISTS "ai"."gateway_model_available_image_idx" RENAME TO "model_available_image_idx";

ALTER INDEX IF EXISTS "ai"."gateway_model_available_rerank_idx" RENAME TO "model_available_rerank_idx";

ALTER INDEX IF EXISTS "ai"."gateway_model_available_routing_idx" RENAME TO "model_available_routing_idx";

ALTER INDEX IF EXISTS "ai"."gateway_model_available_video_idx" RENAME TO "model_available_video_idx";

ALTER INDEX IF EXISTS "ai"."gateway_model_output_price_idx" RENAME TO "model_output_price_idx";

ALTER INDEX IF EXISTS "ai"."gateway_model_price_tier_idx" RENAME TO "model_price_tier_idx";

ALTER INDEX IF EXISTS "ai"."gateway_model_provider_idx" RENAME TO "model_provider_idx";

ALTER INDEX IF EXISTS "ai"."gateway_model_tags_idx" RENAME TO "model_tags_idx";

ALTER INDEX IF EXISTS "ai"."gateway_model_use_cases_idx" RENAME TO "model_use_cases_idx";

COMMENT ON TABLE "ai"."model" IS
    'Model catalog, one row per (gateway, model). Synced from each registered gateway adapter in apps/ai; availability flags are operator state and survive syncs.';

COMMENT ON COLUMN "ai"."model"."gateway" IS
    'Which gateway serves this row (vercel, and later openrouter or a direct vendor API). Never part of model_id: the id names the model, this names the route.';

-- Renaming a table changes what PostgREST exposes, and its schema cache is only
-- rebuilt on notify or restart.
NOTIFY pgrst, 'reload schema';
