import type { AiUsageStore, TenantUsagePolicyRecord } from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import { createApp } from "../app.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function makePolicy(
  overrides: Partial<TenantUsagePolicyRecord> = {}
): TenantUsagePolicyRecord {
  return {
    tenant_id: tenantId,
    tier: "free",
    period_mode: "calendar",
    period_unit: "month",
    period_anchor: null,
    included_input_tokens: null,
    included_output_tokens: null,
    included_cost_micros: null,
    hard_limit_cost_micros: 1000,
    soft_limit_cost_micros: null,
    allowed_models: null,
    allowed_providers: null,
    allowed_efforts: null,
    enforcement_mode: "observe",
    currency: "usd",
    managed_by: "tenant",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeUsageStore(overrides: Partial<AiUsageStore> = {}): AiUsageStore {
  const policy = makePolicy();
  return {
    bumpPeriodTotals: vi.fn(async () => undefined),
    getActiveModelPricing: vi.fn(async () => null),
    getPeriodTotals: vi.fn(async (params) => ({
      tenant_id: params.tenant_id,
      user_id: params.user_id,
      period_start: params.period_start,
      period_end: "2026-06-01T00:00:00.000Z",
      input_tokens: 20,
      output_tokens: 10,
      cached_tokens: 2,
      reasoning_tokens: 1,
      compute_ms: 0,
      cost_micros: 250,
      currency: "usd",
      event_count: 2,
      last_event_at: "2026-05-17T00:00:00.000Z",
      updated_at: "2026-05-17T00:00:00.000Z",
    })),
    getTenantPolicy: vi.fn(async () => policy),
    getUserPolicy: vi.fn(async () => null),
    insertEvent: vi.fn(),
    insertModelPricing: vi.fn(),
    listModelPricing: vi.fn(async () => []),
    listUsedModelPricing: vi.fn(async () => []),
    listUserPolicies: vi.fn(async () => []),
    summarizeUsageByModel: vi.fn(async () => [
      {
        model_id: "openai/gpt-5-mini",
        feature: "copilot",
        input_tokens: 20,
        output_tokens: 10,
        cached_tokens: 2,
        reasoning_tokens: 1,
        cost_micros: 250,
        event_count: 2,
      },
    ]),
    summarizeUsageByThread: vi.fn(async () => null),
    summarizeUsageByUser: vi.fn(async () => [
      {
        user_id: userId,
        user_display_name: "Ada",
        user_email: "ada@example.com",
        input_tokens: 20,
        output_tokens: 10,
        cached_tokens: 2,
        reasoning_tokens: 1,
        cost_micros: 250,
        event_count: 2,
      },
    ]),
    upsertTenantPolicy: vi.fn(async (record) =>
      makePolicy({
        ...record,
        created_at: record.created_at ?? policy.created_at,
        updated_at: record.updated_at ?? "2026-05-17T00:00:00.000Z",
      })
    ),
    upsertUserPolicy: vi.fn(),
    ...overrides,
  };
}

// The bundles core actually hands back for these roles (CORE_ROLE_PROFILES in
// apps/core/src/security/role-profiles.ts). Members are module-tier only, which
// is precisely why a `core.ai.*` gate excludes them.
const TENANT_ADMIN_CAPABILITIES = ["core.credentials.manage", "*"];
const TENANT_MEMBER_CAPABILITIES = [
  "module.*",
  "tenant-settings.read",
  "tenant-settings.write",
  "user-settings.read",
  "user-settings.write",
];
const SERVICE_CAPABILITIES = ["module.read", "module.write", "module.execute"];

function scopeResolver(isAdmin: boolean) {
  return createStaticAiScopeResolver({
    capabilities: isAdmin
      ? TENANT_ADMIN_CAPABILITIES
      : TENANT_MEMBER_CAPABILITIES,
    isTenantAdmin: isAdmin,
    tenantId,
    tenantRole: isAdmin ? "admin" : "member",
    userId,
  });
}

function serviceScopeResolver() {
  return createStaticAiScopeResolver({
    capabilities: SERVICE_CAPABILITIES,
    tenantId,
    tenantRole: "service",
    userId,
  });
}

function superadminScopeResolver() {
  return createStaticAiScopeResolver({
    capabilities: ["core.superadmin", "*"],
    isSuperAdmin: true,
    isTenantAdmin: true,
    tenantId,
    tenantRole: "admin",
    userId,
  });
}

function patchPolicy(
  app: Awaited<ReturnType<typeof createApp>>,
  body: Record<string, unknown>
) {
  return app.request("http://localhost/ai/v1/usage/policy", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("apps/ai usage routes", () => {
  it("keeps a plan-managed policy read-only to tenant admins", async () => {
    const store = makeUsageStore({
      getTenantPolicy: vi.fn(async () =>
        makePolicy({ managed_by: "entitlement" })
      ),
    });
    const app = await createApp({
      scopeResolver: scopeResolver(true),
      usageStore: store,
    });
    const res = await patchPolicy(app, { hard_limit_cost_micros: 999_999 });

    expect(res.status).toBe(409);
    expect(store.upsertTenantPolicy).not.toHaveBeenCalled();
  });

  it("writes a tenant admin's policy edit to the caller's own tenant", async () => {
    const store = makeUsageStore();
    const app = await createApp({
      scopeResolver: scopeResolver(true),
      usageStore: store,
    });
    const res = await patchPolicy(app, { period_mode: "rolling" });

    expect(res.status).toBe(200);
    expect(store.upsertTenantPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ period_mode: "rolling", tenant_id: tenantId })
    );
  });

  it("rejects model pricing access for tenant admins", async () => {
    const app = await createApp({
      scopeResolver: scopeResolver(true),
      usageStore: makeUsageStore(),
    });

    const res = await app.request(
      "http://localhost/ai/v1/usage/model-pricing",
      {
        headers: { Authorization: "Bearer token" },
      }
    );

    expect(res.status).toBe(403);
  });

  // Tenant usage exposes every user's cost; a service credential must not be
  // widened into it.
  describe("core.ai.usage.read parity", () => {
    const cases: Array<{
      expected: number;
      resolver: () => ReturnType<typeof createStaticAiScopeResolver>;
      who: string;
    }> = [
      { expected: 200, resolver: superadminScopeResolver, who: "superadmin" },
      {
        expected: 200,
        resolver: () => scopeResolver(true),
        who: "tenant admin",
      },
      { expected: 403, resolver: () => scopeResolver(false), who: "member" },
      { expected: 403, resolver: serviceScopeResolver, who: "service" },
    ];

    for (const { expected, resolver, who } of cases) {
      it(`answers ${expected} for a ${who}`, async () => {
        const app = await createApp({
          scopeResolver: resolver(),
          usageStore: makeUsageStore(),
        });
        const res = await app.request("http://localhost/ai/v1/usage/tenant", {
          headers: { Authorization: "Bearer token" },
        });
        expect(res.status).toBe(expected);
      });
    }
  });
});
