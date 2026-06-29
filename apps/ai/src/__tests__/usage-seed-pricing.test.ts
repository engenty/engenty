import type { AiUsageStore, ModelPricingRecord } from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";
import {
  resolveModelPricingSeeds,
  restoreAiUsageModelPricingDefaults,
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

describe("seedAiUsageModelPricing", () => {
  it("inserts default prices for missing models", async () => {
    const seeds = await resolveModelPricingSeeds();
    const { inserted, store } = makeStore();

    const result = await seedAiUsageModelPricing(store);

    expect(result.inserted).toBe(seeds.length);
    expect(inserted.map((row) => row.model_id).sort()).toEqual(
      seeds.map((seed) => seed.model_id).sort()
    );
  });

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

describe("restoreAiUsageModelPricingDefaults", () => {
  it("restores all default prices if database is empty", async () => {
    const seeds = await resolveModelPricingSeeds();
    const { inserted, store } = makeStore();

    const result = await restoreAiUsageModelPricingDefaults(store);

    expect(result.restored).toBe(seeds.length);
    expect(inserted.map((row) => row.model_id).sort()).toEqual(
      seeds.map((seed) => seed.model_id).sort()
    );
  });

  it("skips models whose active pricing matches default pricing", async () => {
    const seeds = await resolveModelPricingSeeds();
    const defaultSeed = seeds[0]!;
    const matchingRow = pricingRow(defaultSeed.model_id, {
      currency: defaultSeed.currency,
      input_per_mtok_micros: defaultSeed.input_per_mtok_micros,
      output_per_mtok_micros: defaultSeed.output_per_mtok_micros,
      cached_input_per_mtok_micros: defaultSeed.cached_input_per_mtok_micros,
      reasoning_per_mtok_micros: defaultSeed.reasoning_per_mtok_micros,
    });

    // listModelPricing returns the matching row — restore should skip it.
    const { inserted, store } = makeStore([matchingRow]);

    const result = await restoreAiUsageModelPricingDefaults(store);

    expect(result.restored).toBe(seeds.length - 1);
    expect(inserted.some((row) => row.model_id === defaultSeed.model_id)).toBe(
      false
    );
  });

  it("updates models whose active pricing differs from default pricing", async () => {
    const seeds = await resolveModelPricingSeeds();
    const defaultSeed = seeds[0]!;
    const differentRow = pricingRow(defaultSeed.model_id, {
      input_per_mtok_micros: 999_999,
    });

    // listModelPricing returns the row with a wrong price — restore should overwrite it.
    const { inserted, store } = makeStore([differentRow]);

    const result = await restoreAiUsageModelPricingDefaults(store);

    expect(result.restored).toBe(seeds.length);
    expect(inserted.some((row) => row.model_id === defaultSeed.model_id)).toBe(
      true
    );
  });
});
