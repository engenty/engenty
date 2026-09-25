import type { AiUsageStore, ModelPricingRecord } from "@engenty/ai-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import { createApp } from "../app.js";
import {
  type AiGatewayModelStore,
  deriveGatewayModelPriceTiers,
  type GatewayModelRecord,
  type GatewayModelSyncRunRecord,
  syncGatewayModels,
} from "../gateway-models.js";
import {
  type ModelGateway,
  normalizeGatewayModel,
} from "../model-gateways/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function syncRun(
  overrides: Partial<GatewayModelSyncRunRecord> = {}
): GatewayModelSyncRunRecord {
  return {
    completed_at: null,
    created_at: "2026-05-17T00:00:00.000Z",
    error_text: null,
    id: "00000000-0000-4000-8000-000000000020",
    inserted_pricing_count: 0,
    model_count: 0,
    started_at: "2026-05-17T00:00:00.000Z",
    status: "running",
    trigger: "manual",
    updated_model_count: 0,
    ...overrides,
  };
}

function pricingRow(modelId: string): ModelPricingRecord {
  return {
    cached_input_per_mtok_micros: 0,
    created_at: "2026-05-17T00:00:00.000Z",
    currency: "usd",
    id: "00000000-0000-4000-8000-000000000030",
    input_per_mtok_micros: 1,
    model_id: modelId,
    output_per_mtok_micros: 2,
    reasoning_per_mtok_micros: 0,
    valid_from: "2026-05-17T00:00:00.000Z",
    valid_to: null,
  };
}

function gatewayModel(
  overrides: Partial<GatewayModelRecord> = {}
): GatewayModelRecord {
  return {
    available_for_agent: true,
    available_for_embedding: false,
    available_for_image: false,
    available_for_rerank: false,
    available_for_classification: true,
    available_for_realtime: false,
    available_for_text: false,
    available_for_transcription: false,
    available_for_video: false,
    cached_input_per_mtok_micros: null,
    capabilities: {},
    context_tokens: null,
    created_at: "2026-05-17T00:00:00.000Z",
    description: null,
    display_name: "Example",
    gateway: "vercel",
    input_per_mtok_micros: 1,
    last_seen_at: "2026-05-17T00:00:00.000Z",
    last_sync_change: null,
    last_sync_run_id: null,
    last_synced_at: "2026-05-17T00:00:00.000Z",
    max_output_tokens: null,
    model_id: "openai/gpt-example",
    no_training_supported: null,
    output_per_mtok_micros: 2,
    price_tier: "low",
    provider: "openai",
    providers: ["openai"],
    raw_json: {},
    regions: [],
    released_at: null,
    source_url: "https://ai-gateway.vercel.sh/v1/models",
    tags: [],
    type: "language",
    updated_at: "2026-05-17T00:00:00.000Z",
    use_cases: ["text"],
    web_search_per_query_micros: null,
    zdr_supported: null,
    ...overrides,
  };
}

function makeStore(): AiUsageStore & AiGatewayModelStore {
  return {
    bumpPeriodTotals: vi.fn(),
    getActiveModelPricing: vi.fn(async () => null),
    getGatewayModelSyncSettings: vi.fn(async () => null),
    getPeriodTotals: vi.fn(),
    getTenantPolicy: vi.fn(),
    getUserPolicy: vi.fn(),
    insertEvent: vi.fn(),
    insertGatewayModelSyncRun: vi.fn(async (input) =>
      syncRun({ started_at: input.started_at, status: input.status })
    ),
    insertModelPricing: vi.fn(async (record) => pricingRow(record.model_id)),
    listGatewayModelSyncRuns: vi.fn(async () => []),
    listGatewayModels: vi.fn(async () => []),
    listModelBindings: vi.fn(async () => []),
    listModelPricing: vi.fn(async () => []),
    listUsedModelPricing: vi.fn(async () => []),
    listUserPolicies: vi.fn(),
    markGatewayModelSyncSettingsRun: vi.fn(),
    seedModelBindings: vi.fn(async () => 0),
    summarizeUsageByModel: vi.fn(),
    summarizeUsageByThread: vi.fn(),
    summarizeUsageByUser: vi.fn(),
    updateGatewayModelSyncRun: vi.fn(async (_id, patch) =>
      syncRun({
        completed_at: patch.completed_at ?? null,
        inserted_pricing_count: patch.inserted_pricing_count ?? 0,
        model_count: patch.model_count ?? 0,
        status: patch.status ?? "succeeded",
        updated_model_count: patch.updated_model_count ?? 0,
      })
    ),
    updateGatewayModelAvailability: vi.fn(async (modelId, patch) =>
      gatewayModel({ model_id: modelId, ...patch })
    ),
    upsertGatewayModels: vi.fn(async (models) => ({
      changed: 0,
      inserted: models.length,
      total: models.length,
    })),
    upsertModelBinding: vi.fn(async (row) => ({
      ...row,
      updated_at: "2026-05-17T00:00:00.000Z",
    })),
    upsertTenantPolicy: vi.fn(),
    upsertUserPolicy: vi.fn(),
  };
}

function scopeResolver(isSuperAdmin: boolean) {
  return createStaticAiScopeResolver({
    isSuperAdmin,
    isTenantAdmin: isSuperAdmin,
    tenantId,
    tenantRole: isSuperAdmin ? "admin" : "member",
    userId,
  });
}

describe("Gateway model sync", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("assigns price tiers at the fixed composite-score thresholds", () => {
    // Standard score = input×0.75 + output×0.25; with a cached price,
    // cached×0.5 + input×0.25 + output×0.25. Tier thresholds: 0.5M / 1M / 2M / 4M.
    const tiers = deriveGatewayModelPriceTiers([
      { model_id: "no-price", output_per_mtok_micros: null },
      {
        model_id: "at-cheap-limit",
        input_per_mtok_micros: 500_000,
        output_per_mtok_micros: 500_000,
      },
      {
        model_id: "over-cheap-limit",
        input_per_mtok_micros: 500_000,
        output_per_mtok_micros: 500_004,
      },
      {
        model_id: "at-high-limit",
        input_per_mtok_micros: 4_000_000,
        output_per_mtok_micros: 4_000_000,
      },
      {
        model_id: "over-high-limit",
        input_per_mtok_micros: 4_000_000,
        output_per_mtok_micros: 4_000_004,
      },
      // Standard score 1.3M (medium); cached score 0.8M (low).
      {
        model_id: "cached",
        cached_input_per_mtok_micros: 400_000,
        input_per_mtok_micros: 1_200_000,
        output_per_mtok_micros: 1_600_000,
      },
    ]);

    expect(tiers.has("no-price")).toBe(false);
    expect(tiers.get("at-cheap-limit")).toBe("cheap");
    expect(tiers.get("over-cheap-limit")).toBe("low");
    expect(tiers.get("at-high-limit")).toBe("high");
    expect(tiers.get("over-high-limit")).toBe("expensive");
    expect(tiers.get("cached")).toBe("low");
  });

  it("lets superadmins trigger a Gateway sync", async () => {
    const store = makeStore();
    // Only the Vercel catalog answers with models; every other adapter is empty.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (!url.includes("ai-gateway.vercel.sh")) {
          return Response.json({ data: [] });
        }
        return Response.json({
          data: [
            {
              context_window: 128_000,
              id: "openai/gpt-example",
              name: "GPT Example",
              owned_by: "openai",
              pricing: { input: "0.00000025", output: "0.000002" },
              tags: ["tool-use"],
              type: "language",
            },
          ],
        });
      })
    );
    const app = await createApp({
      scopeResolver: scopeResolver(true),
      usageStore: store,
    });

    const res = await app.request(
      "http://localhost/ai/v1/gateway/models/sync",
      {
        body: JSON.stringify({ update_pricing: true }),
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );
    const body = (await res.json()) as { model_count: number };

    expect(res.status).toBe(200);
    expect(body.model_count).toBe(1);
    expect(store.upsertGatewayModels).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          gateway: "vercel",
          model_id: "openai/gpt-example",
          price_tier: "low", // score = 250k×0.75 + 2M×0.25 = 687.5k > 500k → low
        }),
      ],
      expect.objectContaining({ syncRunId: expect.any(String) })
    );
    expect(store.insertModelPricing).toHaveBeenCalledWith(
      expect.objectContaining({
        input_per_mtok_micros: 250_000,
        model_id: "openai/gpt-example",
      })
    );
  });

  it("tags each adapter's rows with its own gateway and counts them apart", async () => {
    const store = makeStore();
    const stubGateway = (id: string, modelId: string): ModelGateway => ({
      id,
      listModels: async (opts) => [
        normalizeGatewayModel(
          { id: modelId, owned_by: "openai", type: "language" },
          { now: opts.now }
        ),
      ],
      sourceUrl: `https://${id}.example/models`,
    });

    const result = await syncGatewayModels(store, {
      gateways: [
        stubGateway("vercel", "openai/gpt-a"),
        stubGateway("openrouter", "openai/gpt-b"),
      ],
      trigger: "manual",
    });

    expect(result.model_count).toBe(2);
    expect(result.by_gateway).toEqual({
      openrouter: { model_count: 1, updated_model_count: 1 },
      vercel: { model_count: 1, updated_model_count: 1 },
    });
    expect(store.upsertGatewayModels).toHaveBeenNthCalledWith(
      1,
      [
        expect.objectContaining({
          gateway: "vercel",
          model_id: "openai/gpt-a",
        }),
      ],
      expect.objectContaining({ syncRunId: expect.any(String) })
    );
    expect(store.upsertGatewayModels).toHaveBeenNthCalledWith(
      2,
      [
        expect.objectContaining({
          gateway: "openrouter",
          model_id: "openai/gpt-b",
        }),
      ],
      expect.objectContaining({ syncRunId: expect.any(String) })
    );
  });

  it("keeps a healthy gateway's rows when another one is down", async () => {
    const store = makeStore();
    const healthy: ModelGateway = {
      id: "vercel",
      listModels: async (opts) => [
        normalizeGatewayModel(
          { id: "openai/gpt-a", owned_by: "openai", type: "language" },
          { now: opts.now }
        ),
      ],
      sourceUrl: "https://vercel.example/models",
    };
    const down: ModelGateway = {
      id: "openrouter",
      listModels: () => Promise.reject(new Error("503 Service Unavailable")),
      sourceUrl: "https://openrouter.example/models",
    };

    const result = await syncGatewayModels(store, {
      gateways: [healthy, down],
      trigger: "manual",
    });

    expect(result.model_count).toBe(1);
    expect(result.by_gateway).toEqual({
      // Zero rows and RECORDED, so "down" is distinguishable from "empty".
      openrouter: { model_count: 0, updated_model_count: 0 },
      vercel: { model_count: 1, updated_model_count: 1 },
    });
    // The run succeeds but says which half is stale — the sync-runs list is the
    // only place an operator would learn that.
    expect(store.updateGatewayModelSyncRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        error_text: expect.stringContaining("openrouter: 503"),
        status: "succeeded",
      })
    );
  });

  it("fails the run when every gateway is down", async () => {
    const store = makeStore();
    const down = (id: string): ModelGateway => ({
      id,
      listModels: () => Promise.reject(new Error("503")),
      sourceUrl: `https://${id}.example/models`,
    });

    await expect(
      syncGatewayModels(store, {
        gateways: [down("vercel"), down("openrouter")],
        trigger: "manual",
      })
    ).rejects.toThrow(/vercel: 503; openrouter: 503/);
  });

  it("rejects Gateway catalog routes for non-superadmins", async () => {
    const app = await createApp({
      scopeResolver: scopeResolver(false),
      usageStore: makeStore(),
    });

    const res = await app.request("http://localhost/ai/v1/gateway/models", {
      headers: { Authorization: "Bearer token" },
    });

    expect(res.status).toBe(403);
  });
});
