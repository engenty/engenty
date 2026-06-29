import { afterEach, describe, expect, it } from "vitest";
import type {
  ModelPricingRecord,
  TenantUsagePolicyRecord,
  UsageEventRecord,
  UsagePeriodTotalRecord,
  UserUsagePolicyRecord,
} from "../contracts.js";
import { TENANT_AGGREGATE_USER_ID } from "../contracts.js";
import { computeUsageCost, recordAiUsage } from "../record.js";
import {
  type AiUsageStore,
  configureAiUsageStore,
  type PeriodTotalsBumpInput,
  type UsageEventInsert,
} from "../store.js";

interface StoreFixtures {
  bumps: PeriodTotalsBumpInput[];
  events: UsageEventRecord[];
  policies: Map<string, TenantUsagePolicyRecord>;
  pricing: ModelPricingRecord[];
}

function buildStore(): AiUsageStore & StoreFixtures {
  const fixtures: StoreFixtures = {
    events: [],
    bumps: [],
    pricing: [],
    policies: new Map(),
  };

  const store: AiUsageStore = {
    async insertEvent(input: UsageEventInsert): Promise<UsageEventRecord> {
      const record: UsageEventRecord = {
        id: input.id ?? `event-${fixtures.events.length + 1}`,
        created_at: input.created_at ?? new Date().toISOString(),
        ...input,
      };
      fixtures.events.push(record);
      return record;
    },
    async bumpPeriodTotals(input) {
      fixtures.bumps.push(input);
    },
    async getPeriodTotals(): Promise<UsagePeriodTotalRecord | null> {
      return null;
    },
    async getActiveModelPricing({ model_id }) {
      return fixtures.pricing.find((row) => row.model_id === model_id) ?? null;
    },
    async listModelPricing() {
      return fixtures.pricing;
    },
    async listUsedModelPricing() {
      return fixtures.pricing.filter((pricing) =>
        fixtures.events.some((event) => event.pricing_version_id === pricing.id)
      );
    },
    async insertModelPricing(record) {
      const created: ModelPricingRecord = {
        id: record.id ?? `pricing-${fixtures.pricing.length + 1}`,
        created_at: record.created_at ?? new Date().toISOString(),
        ...record,
      };
      fixtures.pricing.unshift(created);
      return created;
    },
    async getTenantPolicy(tenantId) {
      return fixtures.policies.get(tenantId) ?? null;
    },
    async upsertTenantPolicy(record): Promise<TenantUsagePolicyRecord> {
      const now = new Date().toISOString();
      const merged: TenantUsagePolicyRecord = {
        ...record,
        created_at: record.created_at ?? now,
        updated_at: now,
      };
      fixtures.policies.set(record.tenant_id, merged);
      return merged;
    },
    async getUserPolicy(): Promise<UserUsagePolicyRecord | null> {
      return null;
    },
    async upsertUserPolicy(record): Promise<UserUsagePolicyRecord> {
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

  return Object.assign(store, fixtures);
}

describe("computeUsageCost", () => {
  it("uses the provided pricing snapshot and floors per-dimension cost", () => {
    const cost = computeUsageCost({
      tokens: { input: 1000, output: 500, cached: 200, reasoning: 0 },
      pricing: {
        id: "p1",
        model_id: "m",
        currency: "usd",
        input_per_mtok_micros: 1_000_000,
        output_per_mtok_micros: 4_000_000,
        cached_input_per_mtok_micros: 100_000,
        reasoning_per_mtok_micros: 4_000_000,
        valid_from: "2026-01-01T00:00:00Z",
        valid_to: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    });
    // 1000 * 1_000_000 / 1_000_000 = 1000 ; 500 * 4_000_000 / 1_000_000 = 2000 ;
    // 200 * 100_000 / 1_000_000 = 20 ; total = 3020.
    expect(cost.cost_micros).toBe(3020);
    expect(cost.pricing_version_id).toBe("p1");
    expect(cost.currency).toBe("usd");
  });

  it("falls back to conservative rates when no pricing row is provided", () => {
    const cost = computeUsageCost({
      tokens: { input: 100, output: 100, cached: 0, reasoning: 0 },
      pricing: null,
    });
    expect(cost.pricing_version_id).toBeNull();
    expect(cost.cost_micros).toBeGreaterThan(0);
  });
});

describe("recordAiUsage", () => {
  afterEach(() => {
    configureAiUsageStore(null);
  });

  it("inserts an event and bumps both user and tenant aggregate rows", async () => {
    const store = buildStore();
    store.pricing.push({
      id: "p1",
      model_id: "openai/gpt-5-mini",
      currency: "usd",
      input_per_mtok_micros: 250_000,
      output_per_mtok_micros: 2_000_000,
      cached_input_per_mtok_micros: 25_000,
      reasoning_per_mtok_micros: 2_000_000,
      valid_from: "2026-01-01T00:00:00Z",
      valid_to: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    configureAiUsageStore(store);

    await recordAiUsage({
      tenant_id: "tenant-a",
      user_id: "user-1",
      run_id: "run-1",
      thread_id: null,
      agent_id: "engenty.copilot",
      action_id: null,
      feature: "copilot",
      model_id: "openai/gpt-5-mini",
      usage: { input: 1000, output: 500 },
      occurred_at: "2026-03-15T12:00:00Z",
    });

    expect(store.events).toHaveLength(1);
    const event = store.events[0];
    expect(event.cost_micros).toBe(1250); // 1000*0.25 + 500*2 = 1250
    expect(event.pricing_version_id).toBe("p1");
    expect(event.input_per_mtok_micros).toBe(250_000);

    expect(store.bumps).toHaveLength(2);
    const tenantBump = store.bumps.find(
      (b) => b.user_id === TENANT_AGGREGATE_USER_ID
    );
    const userBump = store.bumps.find((b) => b.user_id === "user-1");
    expect(tenantBump).toBeDefined();
    expect(userBump).toBeDefined();
    expect(tenantBump?.cost_micros).toBe(1250);
    expect(userBump?.cost_micros).toBe(1250);
  });

  it("skips recording when tenant id is missing", async () => {
    const store = buildStore();
    configureAiUsageStore(store);
    const result = await recordAiUsage({
      tenant_id: null,
      user_id: "user-1",
      feature: "copilot",
      model_id: "openai/gpt-5-mini",
      usage: { input: 100, output: 100 },
    });
    expect(result).toBeNull();
    expect(store.events).toHaveLength(0);
    expect(store.bumps).toHaveLength(0);
  });

  it("skips recording when no tokens were consumed", async () => {
    const store = buildStore();
    configureAiUsageStore(store);
    const result = await recordAiUsage({
      tenant_id: "tenant-a",
      user_id: "user-1",
      feature: "copilot",
      model_id: "openai/gpt-5-mini",
      usage: { input: 0, output: 0 },
    });
    expect(result).toBeNull();
    expect(store.events).toHaveLength(0);
  });

  it("only bumps the tenant aggregate when user_id is missing", async () => {
    const store = buildStore();
    configureAiUsageStore(store);
    await recordAiUsage({
      tenant_id: "tenant-a",
      user_id: null,
      feature: "inbound",
      model_id: "openai/gpt-5-mini",
      usage: { input: 100, output: 50 },
    });
    expect(store.bumps).toHaveLength(1);
    expect(store.bumps[0].user_id).toBe(TENANT_AGGREGATE_USER_ID);
  });
});
