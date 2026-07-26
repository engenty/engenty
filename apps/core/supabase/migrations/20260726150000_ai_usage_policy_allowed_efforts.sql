-- Effort grants: what a plan licenses, expressed as how much thinking a tenant
-- may buy rather than which models they may name.
--
-- A model-id allow-list goes stale the moment a vendor ships anything: every
-- release means re-listing every tenant, and one that was missed silently loses
-- access to the current generation. A tier grant does not — a model bound to
-- `model.high` tomorrow is covered by today's grant, because the grant talks
-- about the job rather than the instrument.
--
-- `allowed_models` and `allowed_providers` stay as the self-hosted / expert
-- escape hatch. NULL or empty means every tier, matching how those two read.
ALTER TABLE "ai"."tenant_usage_policy"
    ADD COLUMN IF NOT EXISTS "allowed_efforts" "text"[];

COMMENT ON COLUMN "ai"."tenant_usage_policy"."allowed_efforts" IS
    'Licensed effort tiers (low/medium/high). NULL/empty = all. Requests above the ceiling degrade to the highest granted tier rather than failing.';
