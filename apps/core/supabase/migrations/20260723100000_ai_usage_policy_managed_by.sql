-- AI governance: mark whether a tenant's usage policy is self-served by the
-- tenant admin ("tenant", the open-source default) or centrally governed from
-- the entitlement layer ("entitlement"). When "entitlement", the tenant-facing
-- PATCH /ai/v1/usage/policy route rejects with 409; only the superadmin
-- admin-route (the manage-app path) and the entitlement apply path write it.
ALTER TABLE "ai"."tenant_usage_policy"
    ADD COLUMN IF NOT EXISTS "managed_by" "text" DEFAULT 'tenant'::"text" NOT NULL;

ALTER TABLE "ai"."tenant_usage_policy"
    DROP CONSTRAINT IF EXISTS "tenant_usage_policy_managed_by_check";

ALTER TABLE "ai"."tenant_usage_policy"
    ADD CONSTRAINT "tenant_usage_policy_managed_by_check"
    CHECK (("managed_by" = ANY (ARRAY['tenant'::"text", 'entitlement'::"text"])));
