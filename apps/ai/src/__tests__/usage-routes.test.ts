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

describe("apps/ai usage routes", () => {
  it("returns 403 for tenant members", async () => {
    const app = await createApp({
      scopeResolver: scopeResolver(false),
      usageStore: makeUsageStore(),
    });
    const res = await app.request("http://localhost/ai/v1/usage/me", {
      headers: { Authorization: "Bearer token" },
    });

    expect(res.status).toBe(403);
  });

  it("returns current tenant summary for tenant admins", async () => {
    const store = makeUsageStore();
    const app = await createApp({
      scopeResolver: scopeResolver(true),
      usageStore: store,
    });
    const res = await app.request("http://localhost/ai/v1/usage/tenant", {
      headers: { Authorization: "Bearer token" },
    });
    const body = (await res.json()) as {
      breakdown_by_model: unknown[];
      breakdown_by_user: unknown[];
      tenant_totals: { cost_micros: number } | null;
    };

    expect(res.status).toBe(200);
    expect(body.tenant_totals?.cost_micros).toBe(250);
    expect(body.breakdown_by_model).toHaveLength(1);
    expect(body.breakdown_by_user).toHaveLength(1);
    expect(store.summarizeUsageByModel).toHaveBeenCalled();
    expect(store.summarizeUsageByUser).toHaveBeenCalled();
  });

  it("updates allowed tenant policy fields for admins", async () => {
    const store = makeUsageStore();
    const app = await createApp({
      scopeResolver: scopeResolver(true),
      usageStore: store,
    });
    const res = await app.request("http://localhost/ai/v1/usage/policy", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ period_mode: "rolling", period_unit: "week" }),
    });
    const body = (await res.json()) as TenantUsagePolicyRecord;

    expect(res.status).toBe(200);
    expect(body.period_mode).toBe("rolling");
    expect(body.period_unit).toBe("week");
    expect(store.upsertTenantPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: tenantId,
        period_mode: "rolling",
        period_unit: "week",
      })
    );
  });

  it("lists model pricing for superadmins", async () => {
    const store = makeUsageStore({
      listModelPricing: vi.fn(async () => [
        {
          id: "00000000-0000-4000-8000-000000000010",
          model_id: "openai/gpt-5-mini",
          currency: "usd",
          input_per_mtok_micros: 250_000,
          output_per_mtok_micros: 2_000_000,
          cached_input_per_mtok_micros: 25_000,
          reasoning_per_mtok_micros: 2_000_000,
          valid_from: "2026-05-17T00:00:00.000Z",
          valid_to: null,
          created_at: "2026-05-17T00:00:00.000Z",
        },
      ]),
    });
    const app = await createApp({
      scopeResolver: superadminScopeResolver(),
      usageStore: store,
    });

    const res = await app.request(
      "http://localhost/ai/v1/usage/model-pricing",
      {
        headers: { Authorization: "Bearer token" },
      }
    );
    const body = (await res.json()) as { items: unknown[] };

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
  });

  it("lists used historical model pricing for superadmins", async () => {
    const store = makeUsageStore({
      listUsedModelPricing: vi.fn(async () => [
        {
          id: "00000000-0000-4000-8000-000000000010",
          model_id: "openai/gpt-5-mini",
          currency: "usd",
          input_per_mtok_micros: 250_000,
          output_per_mtok_micros: 2_000_000,
          cached_input_per_mtok_micros: 25_000,
          reasoning_per_mtok_micros: 2_000_000,
          valid_from: "2026-05-17T00:00:00.000Z",
          valid_to: null,
          created_at: "2026-05-17T00:00:00.000Z",
        },
      ]),
    });
    const app = await createApp({
      scopeResolver: superadminScopeResolver(),
      usageStore: store,
    });

    const res = await app.request(
      "http://localhost/ai/v1/usage/model-pricing/history",
      {
        headers: { Authorization: "Bearer token" },
      }
    );
    const body = (await res.json()) as { items: unknown[] };

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(store.listUsedModelPricing).toHaveBeenCalled();
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

  it("creates model pricing rows for superadmins", async () => {
    const store = makeUsageStore({
      insertModelPricing: vi.fn(async (record) => ({
        id: "00000000-0000-4000-8000-000000000011",
        model_id: record.model_id,
        currency: record.currency,
        input_per_mtok_micros: record.input_per_mtok_micros,
        output_per_mtok_micros: record.output_per_mtok_micros,
        cached_input_per_mtok_micros: record.cached_input_per_mtok_micros,
        reasoning_per_mtok_micros: record.reasoning_per_mtok_micros,
        valid_from: record.valid_from,
        valid_to: record.valid_to,
        created_at: "2026-05-17T00:00:00.000Z",
      })),
    });
    const app = await createApp({
      scopeResolver: superadminScopeResolver(),
      usageStore: store,
    });

    const res = await app.request(
      "http://localhost/ai/v1/usage/model-pricing",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: "openai/example",
          currency: "usd",
          input_per_mtok_micros: 1,
          output_per_mtok_micros: 2,
        }),
      }
    );

    expect(res.status).toBe(201);
    expect(store.insertModelPricing).toHaveBeenCalledWith(
      expect.objectContaining({
        model_id: "openai/example",
        input_per_mtok_micros: 1,
        output_per_mtok_micros: 2,
      })
    );
  });

  it("syncs default model pricing for superadmins", async () => {
    const store = makeUsageStore();
    const app = await createApp({
      scopeResolver: superadminScopeResolver(),
      usageStore: store,
    });

    const res = await app.request(
      "http://localhost/ai/v1/usage/model-pricing/sync-defaults",
      {
        method: "POST",
        headers: { Authorization: "Bearer token" },
      }
    );
    const body = (await res.json()) as { inserted: number };

    expect(res.status).toBe(200);
    expect(body.inserted).toBeGreaterThan(0);
    expect(store.insertModelPricing).toHaveBeenCalled();
  });

  it("returns superadmin tenant usage summary for manage", async () => {
    const store = makeUsageStore();
    const app = await createApp({
      scopeResolver: superadminScopeResolver(),
      usageStore: store,
    });

    const res = await app.request(
      `http://localhost/ai/v1/usage/admin/tenants/${tenantId}`,
      { headers: { Authorization: "Bearer token" } }
    );
    const body = (await res.json()) as {
      tenant_id: string;
      breakdown_by_user: unknown[];
    };

    expect(res.status).toBe(200);
    expect(body.tenant_id).toBe(tenantId);
    expect(body.breakdown_by_user).toHaveLength(1);
    expect(store.summarizeUsageByUser).toHaveBeenCalled();
  });

  it("returns superadmin tenant policy bundle for manage", async () => {
    const store = makeUsageStore();
    const app = await createApp({
      scopeResolver: superadminScopeResolver(),
      usageStore: store,
    });

    const res = await app.request(
      `http://localhost/ai/v1/usage/admin/tenants/${tenantId}/policy`,
      { headers: { Authorization: "Bearer token" } }
    );
    const body = (await res.json()) as {
      policy: { tenant_id: string };
      user_policies: unknown[];
    };

    expect(res.status).toBe(200);
    expect(body.policy.tenant_id).toBe(tenantId);
    expect(store.listUserPolicies).toHaveBeenCalledWith(tenantId);
  });

  // AUTH-06 parity matrix. The gate moved from `isTenantAdmin` to the
  // `core.ai.usage.read` capability; these four shapes assert the swap changed
  // no outcome — in particular that a service credential is NOT widened.
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

    it("denies a scope core never gave capabilities to", async () => {
      // The skew direction that matters: an older core omits the field, zod
      // defaults it to [], and the gate closes rather than opening.
      const app = await createApp({
        scopeResolver: createStaticAiScopeResolver({
          isTenantAdmin: true,
          tenantId,
          tenantRole: "admin",
          userId,
        }),
        usageStore: makeUsageStore(),
      });
      const res = await app.request("http://localhost/ai/v1/usage/tenant", {
        headers: { Authorization: "Bearer token" },
      });
      expect(res.status).toBe(403);
    });
  });
});
