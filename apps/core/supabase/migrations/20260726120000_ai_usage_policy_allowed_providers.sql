-- AI governance: a provider-level allow-list alongside the per-model one.
--
-- `allowed_models` enumerates exact gateway model ids, so it goes stale the
-- moment a vendor ships a new model — a tenant licensed for "Anthropic" had to
-- be re-listed on every release. `allowed_providers` matches the `provider`
-- column of `ai.gateway_model` instead, so new models from a permitted vendor
-- are legal on day one.
--
-- Semantics (matching `allowed_models`): NULL or empty = unrestricted. When
-- both lists are set a model is legal if it satisfies EITHER — the lists are
-- additive grants, not intersecting filters, so a per-model exception can widen
-- a vendor grant without duplicating the whole vendor list.
ALTER TABLE "ai"."tenant_usage_policy"
    ADD COLUMN IF NOT EXISTS "allowed_providers" "text"[];

COMMENT ON COLUMN "ai"."tenant_usage_policy"."allowed_providers" IS
    'Provider allow-list matched against ai.gateway_model.provider. NULL/empty = unrestricted. Additive with allowed_models: a model is permitted if it matches either list.';
