import type { AiUsageStore, ModelPricingRecord } from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";
import {
  resolveModelPricingSeeds,
  seedAiUsageModelPricing,
} from "../dal/usage/index.js";

function pricingRow(
  modelId: string,
  overrides: Partial<ModelPricingRecord> = {}
): ModelPricingRecord {
  const cleanOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([_, v]) => v !== undefined)
  );
  return {
    id: crypto.randomUUID(),
    model_id: modelId,
    currency: "usd",
    input_per_mtok_micros: 1,
    output_per_mtok_micros: 2,
    cached_input_per_mtok_micros: 0,
    reasoning_per_mtok_micros: 0,
    valid_from: "2026-05-17T00:00:00.000Z",
    valid_to: null,
    created_at: "2026-05-17T00:00:00.000Z",
    ...cleanOverrides,
  };
}

function makeStore(existing: ModelPricingRecord[] = []) {
  const inserted: ModelPricingRecord[] = [];
  const store: AiUsageStore = {
    bumpPeriodTotals: vi.fn(),
    getActiveModelPricing: vi.fn(),
    getPeriodTotals: vi.fn(),
    getTenantPolicy: vi.fn(),
    getUserPolicy: vi.fn(),
    insertEvent: vi.fn(),
    insertModelPricing: vi.fn(async (record) => {
      const row = pricingRow(record.model_id, record);
      inserted.push(row);
      return row;
    }),
    listModelPricing: vi.fn(async () => existing),
    listUsedModelPricing: vi.fn(async () => []),
    listUserPolicies: vi.fn(),
    summarizeUsageByModel: vi.fn(),
    summarizeUsageByThread: vi.fn(),
    summarizeUsageByUser: vi.fn(),
    upsertTenantPolicy: vi.fn(),
    upsertUserPolicy: vi.fn(),
  };
  return { inserted, store };
}

// Seeding runs on every boot; operator-managed prices must survive it.
describe("seedAiUsageModelPricing", () => {
  it("skips models that already have pricing rows", async () => {
    const seeds = await resolveModelPricingSeeds();
    const existingModel = seeds[0]?.model_id;
    expect(existingModel).toBeTruthy();
    const { inserted, store } = makeStore([pricingRow(existingModel ?? "")]);

    const result = await seedAiUsageModelPricing(store);

    expect(result.inserted).toBe(seeds.length - 1);
    expect(inserted.some((row) => row.model_id === existingModel)).toBe(false);
  });
});
