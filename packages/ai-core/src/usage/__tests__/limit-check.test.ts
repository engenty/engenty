import { afterEach, describe, expect, it } from "vitest";
import {
  TENANT_AGGREGATE_USER_ID,
  type TenantUsagePolicyRecord,
  type UsagePeriodTotalRecord,
  type UserUsagePolicyRecord,
} from "../contracts.js";
import { checkUsageLimits, formatUsageLimitError } from "../limit-check.js";
import { type AiUsageStore, configureAiUsageStore } from "../store.js";

interface Fixtures {
  /** Per-agent accumulated cost (micros) keyed by agent_id. */
  agentCost?: Map<string, number>;
  tenantPolicy: TenantUsagePolicyRecord | null;
  totals: Map<string, UsagePeriodTotalRecord>;
  userPolicy: UserUsagePolicyRecord | null;
}

function buildStore(fx: Fixtures): AiUsageStore {
  return {
    async getAgentPeriodCostMicros({ agent_id }) {
      return fx.agentCost?.get(agent_id) ?? 0;
    },
    async insertEvent(input) {
      return {
        id: "x",
        created_at: new Date().toISOString(),
        ...input,
      };
    },
    async bumpPeriodTotals() {},
    async getPeriodTotals({ tenant_id, user_id, period_start }) {
      return fx.totals.get(`${tenant_id}|${user_id}|${period_start}`) ?? null;
    },
    async getActiveModelPricing() {
      return null;
    },
    async listModelPricing() {
      return [];
    },
    async listUsedModelPricing() {
      return [];
    },
    async insertModelPricing(record) {
      return {
        id: "p",
        created_at: new Date().toISOString(),
        ...record,
      };
    },
    async getTenantPolicy() {
      return fx.tenantPolicy;
    },
    async upsertTenantPolicy(record) {
      const now = new Date().toISOString();
      return {
        ...record,
        created_at: record.created_at ?? now,
        updated_at: now,
      };
    },
    async getUserPolicy() {
      return fx.userPolicy;
    },
    async upsertUserPolicy(record) {
      const now = new Date().toISOString();
      return {
        ...record,
        created_at: record.created_at ?? now,
        updated_at: now,
      };
    },
    async listUserPolicies() {
      return [];
    },
    async summarizeUsageByModel() {
      return [];
    },
    async summarizeUsageByUser() {
      return [];
    },
    async summarizeUsageByThread() {
      return null;
    },
  };
}

const POLICY_BASE: Omit<TenantUsagePolicyRecord, "tenant_id"> = {
  tier: "team",
  period_mode: "calendar",
  period_unit: "month",
  period_anchor: null,
  included_input_tokens: null,
  included_output_tokens: null,
  included_cost_micros: 100_000_000,
  hard_limit_cost_micros: 100_000_000,
  soft_limit_cost_micros: 80_000_000,
  allowed_efforts: null,
  allowed_models: null,
  allowed_providers: null,
  managed_by: "tenant",
  enforcement_mode: "enforce",
  currency: "usd",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function totalsKey(tenantId: string, userId: string, periodStart: string) {
  return `${tenantId}|${userId}|${periodStart}`;
}

describe("checkUsageLimits", () => {
  afterEach(() => {
    configureAiUsageStore(null);
  });

  it("allows when no policy exists and observe is the implicit default", async () => {
    const store = buildStore({
      totals: new Map(),
      tenantPolicy: null,
      userPolicy: null,
    });
    const result = await checkUsageLimits({
      tenant_id: "tenant-a",
      user_id: "user-1",
      model_id: "openai/gpt-5-mini",
      store,
      now: new Date("2026-03-15T00:00:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.enforcement_mode).toBe("observe");
  });

  it("blocks in enforce mode when the per-agent cost cap is reached", async () => {
    const store = buildStore({
      totals: new Map(),
      tenantPolicy: { ...POLICY_BASE, tenant_id: "tenant-a" },
      userPolicy: null,
      agentCost: new Map([["invoice-agent", 5_000_000]]),
    });
    const result = await checkUsageLimits({
      tenant_id: "tenant-a",
      user_id: "user-1",
      agent_id: "invoice-agent",
      agent_budget_cost_micros: 5_000_000,
      model_id: "openai/gpt-5-mini",
      store,
      now: new Date("2026-03-15T00:00:00Z"),
    });
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe("agent");
    expect(result.limit_type).toBe("cost");
  });

  it("allows under the per-agent cap and ignores it when no budget is set", async () => {
    const store = buildStore({
      totals: new Map(),
      tenantPolicy: { ...POLICY_BASE, tenant_id: "tenant-a" },
      userPolicy: null,
      agentCost: new Map([["invoice-agent", 1_000_000]]),
    });
    const under = await checkUsageLimits({
      tenant_id: "tenant-a",
      user_id: "user-1",
      agent_id: "invoice-agent",
      agent_budget_cost_micros: 5_000_000,
      model_id: "openai/gpt-5-mini",
      store,
      now: new Date("2026-03-15T00:00:00Z"),
    });
    expect(under.allowed).toBe(true);
    const noCap = await checkUsageLimits({
      tenant_id: "tenant-a",
      user_id: "user-1",
      agent_id: "invoice-agent",
      model_id: "openai/gpt-5-mini",
      store,
      now: new Date("2026-03-15T00:00:00Z"),
    });
    expect(noCap.allowed).toBe(true);
  });

  it("blocks in enforce mode when tenant cost cap is reached", async () => {
    const totals = new Map<string, UsagePeriodTotalRecord>();
    const periodStart = "2026-03-01T00:00:00.000Z";
    totals.set(totalsKey("tenant-a", TENANT_AGGREGATE_USER_ID, periodStart), {
      tenant_id: "tenant-a",
      user_id: TENANT_AGGREGATE_USER_ID,
      period_start: periodStart,
      period_end: "2026-04-01T00:00:00.000Z",
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      reasoning_tokens: 0,
      cost_micros: 100_000_000,
      currency: "usd",
      event_count: 1,
      last_event_at: "2026-03-10T00:00:00Z",
      updated_at: "2026-03-10T00:00:00Z",
    });
    const store = buildStore({
      totals,
      tenantPolicy: { ...POLICY_BASE, tenant_id: "tenant-a" },
      userPolicy: null,
    });
    const result = await checkUsageLimits({
      tenant_id: "tenant-a",
      user_id: "user-1",
      model_id: "openai/gpt-5-mini",
      store,
      now: new Date("2026-03-15T00:00:00Z"),
    });
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe("tenant");
    expect(result.limit_type).toBe("cost");
    expect(result.remaining_cost_micros).toBe(0);
    expect(formatUsageLimitError(result).code).toBe("usage_limit_exceeded");
  });

  it("does not block in observe mode even when over the cap", async () => {
    const totals = new Map<string, UsagePeriodTotalRecord>();
    const periodStart = "2026-03-01T00:00:00.000Z";
    totals.set(totalsKey("tenant-a", TENANT_AGGREGATE_USER_ID, periodStart), {
      tenant_id: "tenant-a",
      user_id: TENANT_AGGREGATE_USER_ID,
      period_start: periodStart,
      period_end: "2026-04-01T00:00:00.000Z",
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      reasoning_tokens: 0,
      cost_micros: 999_999_999,
      currency: "usd",
      event_count: 1,
      last_event_at: "2026-03-10T00:00:00Z",
      updated_at: "2026-03-10T00:00:00Z",
    });
    const store = buildStore({
      totals,
      tenantPolicy: {
        ...POLICY_BASE,
        tenant_id: "tenant-a",
        enforcement_mode: "observe",
      },
      userPolicy: null,
    });
    const result = await checkUsageLimits({
      tenant_id: "tenant-a",
      user_id: "user-1",
      model_id: "openai/gpt-5-mini",
      store,
      now: new Date("2026-03-15T00:00:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.scope).toBe("tenant");
    expect(result.limit_type).toBe("cost");
  });

  it("rejects models not on the allow-list", async () => {
    const store = buildStore({
      totals: new Map(),
      tenantPolicy: {
        ...POLICY_BASE,
        tenant_id: "tenant-a",
        allowed_models: ["openai/gpt-5-mini"],
      },
      userPolicy: null,
    });
    const result = await checkUsageLimits({
      tenant_id: "tenant-a",
      user_id: "user-1",
      model_id: "openai/gpt-5",
      store,
      now: new Date("2026-03-15T00:00:00Z"),
    });
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe("model");
    expect(result.limit_type).toBe("model_not_allowed");
  });

  it("user override beats tenant cap", async () => {
    const totals = new Map<string, UsagePeriodTotalRecord>();
    const periodStart = "2026-03-01T00:00:00.000Z";
    totals.set(totalsKey("tenant-a", "user-1", periodStart), {
      tenant_id: "tenant-a",
      user_id: "user-1",
      period_start: periodStart,
      period_end: "2026-04-01T00:00:00.000Z",
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      reasoning_tokens: 0,
      cost_micros: 5_000_000,
      currency: "usd",
      event_count: 1,
      last_event_at: "2026-03-10T00:00:00Z",
      updated_at: "2026-03-10T00:00:00Z",
    });
    const store = buildStore({
      totals,
      tenantPolicy: {
        ...POLICY_BASE,
        tenant_id: "tenant-a",
        hard_limit_cost_micros: 1_000_000_000,
      },
      userPolicy: {
        tenant_id: "tenant-a",
        user_id: "user-1",
        max_cost_micros: 5_000_000,
        max_total_tokens: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    });
    const result = await checkUsageLimits({
      tenant_id: "tenant-a",
      user_id: "user-1",
      model_id: "openai/gpt-5-mini",
      store,
      now: new Date("2026-03-15T00:00:00Z"),
    });
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe("user");
  });

  it("returns soft-limit reason without blocking", async () => {
    const totals = new Map<string, UsagePeriodTotalRecord>();
    const periodStart = "2026-03-01T00:00:00.000Z";
    totals.set(totalsKey("tenant-a", TENANT_AGGREGATE_USER_ID, periodStart), {
      tenant_id: "tenant-a",
      user_id: TENANT_AGGREGATE_USER_ID,
      period_start: periodStart,
      period_end: "2026-04-01T00:00:00.000Z",
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      reasoning_tokens: 0,
      cost_micros: 85_000_000,
      currency: "usd",
      event_count: 1,
      last_event_at: "2026-03-10T00:00:00Z",
      updated_at: "2026-03-10T00:00:00Z",
    });
    const store = buildStore({
      totals,
      tenantPolicy: { ...POLICY_BASE, tenant_id: "tenant-a" },
      userPolicy: null,
    });
    const result = await checkUsageLimits({
      tenant_id: "tenant-a",
      user_id: "user-1",
      model_id: "openai/gpt-5-mini",
      store,
      now: new Date("2026-03-15T00:00:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("soft");
    expect(result.remaining_cost_micros).toBe(15_000_000);
  });
});
