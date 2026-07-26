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
    available_for_chat: true,
    available_for_embedding: false,
    available_for_image: false,
    available_for_rerank: false,
    available_for_routing: true,
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
    last_synced_at: "2026-05-17T00:00:00.000Z",
    max_output_tokens: null,
    model_id: "openai/gpt-example",
    no_training_supported: null,
    output_per_mtok_micros: 2,
    price_tier: "low",
    provider: "openai",
    providers: ["openai"],
    raw_json: {},
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
    upsertGatewayModels: vi.fn(async (models) => models.length),
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

  it("normalizes stable Gateway API metadata", () => {
    const model = normalizeGatewayModel(
      {
        context_window: 128_000,
        description: "A coding and reasoning model with web search.",
        id: "openai/gpt-example-code",
        max_tokens: 16_384,
        name: "GPT Example Code",
        owned_by: "openai",
        pricing: {
          input: "0.00000025",
          input_cache_read: "0.000000025",
          output: "0.000002",
          web_search: "0.01",
        },
        released: 1_768_694_400,
        tags: ["reasoning", "tool-use", "web-search"],
        type: "language",
      },
      { now: new Date("2026-05-17T00:00:00.000Z") }
    );

    expect(model.model_id).toBe("openai/gpt-example-code");
    expect(model.use_cases).toEqual(["text", "code"]);
    expect(model.input_per_mtok_micros).toBe(250_000);
    expect(model.output_per_mtok_micros).toBe(2_000_000);
    expect(model.available_for_chat).toBe(true);
    expect(model.available_for_routing).toBe(true);
    expect(model.web_search_per_query_micros).toBe(10_000_000_000);
    expect(model.capabilities).toMatchObject({
      reasoning: true,
      tool_use: true,
      web_search: true,
    });
  });

  it("assigns tiers by composite price score with fixed thresholds", () => {
    const tiers = deriveGatewayModelPriceTiers([
      // null price → no tier
      { model_id: "no-price", output_per_mtok_micros: null },
      // free → cheap
      { model_id: "free", output_per_mtok_micros: 0, input_per_mtok_micros: 0 },
      // score = input*0.75 + output*0.25 = 300k*0.75 + 400k*0.25 = 325k → cheap (≤ 500k)
      {
        model_id: "cheap-model",
        output_per_mtok_micros: 400_000,
        input_per_mtok_micros: 300_000,
      },
      // score = 600k*0.75 + 800k*0.25 = 650k → low (> 500k, ≤ 1M)
      {
        model_id: "low-model",
        output_per_mtok_micros: 800_000,
        input_per_mtok_micros: 600_000,
      },
      // score = 1.2M*0.75 + 1.6M*0.25 = 1.3M → medium (> 1M, ≤ 2M)
      {
        model_id: "medium-model",
        output_per_mtok_micros: 1_600_000,
        input_per_mtok_micros: 1_200_000,
      },
      // score = 2.4M*0.75 + 3.2M*0.25 = 2.6M → high (> 2M, ≤ 3M)
      {
        model_id: "high-model",
        output_per_mtok_micros: 3_200_000,
        input_per_mtok_micros: 2_400_000,
      },
      // score = 6M*0.75 + 8M*0.25 = 6.5M → expensive (> 3M)
      {
        model_id: "expensive-model",
        output_per_mtok_micros: 8_000_000,
        input_per_mtok_micros: 6_000_000,
      },
      // cached formula: cached*0.5 + input*0.25 + output*0.25 = 200k*0.5 + 400k*0.25 + 800k*0.25 = 400k → cheap
      {
        model_id: "cached-cheap",
        output_per_mtok_micros: 800_000,
        input_per_mtok_micros: 400_000,
        cached_input_per_mtok_micros: 200_000,
      },
      // cached formula: 400k*0.5 + 800k*0.25 + 1.6M*0.25 = 200k+200k+400k = 800k → low (> 500k)
      {
        model_id: "cached-low",
        output_per_mtok_micros: 1_600_000,
        input_per_mtok_micros: 800_000,
        cached_input_per_mtok_micros: 400_000,
      },
    ]);

    expect(tiers.has("no-price")).toBe(false);
    expect(tiers.get("free")).toBe("cheap");
    expect(tiers.get("cheap-model")).toBe("cheap");
    expect(tiers.get("low-model")).toBe("low");
    expect(tiers.get("medium-model")).toBe("medium");
    expect(tiers.get("high-model")).toBe("high");
    expect(tiers.get("expensive-model")).toBe("expensive");
    expect(tiers.get("cached-cheap")).toBe("cheap");
    expect(tiers.get("cached-low")).toBe("low");
  });

  it("lets superadmins trigger a Gateway sync", async () => {
    const store = makeStore();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
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
        })
      )
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
    expect(store.upsertGatewayModels).toHaveBeenCalledWith([
      expect.objectContaining({
        gateway: "vercel",
        model_id: "openai/gpt-example",
        price_tier: "low", // score = 250k×0.75 + 2M×0.25 = 687.5k > 500k → low
      }),
    ]);
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
    expect(store.upsertGatewayModels).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({ gateway: "vercel", model_id: "openai/gpt-a" }),
    ]);
    expect(store.upsertGatewayModels).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({
        gateway: "openrouter",
        model_id: "openai/gpt-b",
      }),
    ]);
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

  it("passes Gateway catalog filters through for superadmins", async () => {
    const store = makeStore();
    const app = await createApp({
      scopeResolver: scopeResolver(true),
      usageStore: store,
    });

    const res = await app.request(
      "http://localhost/ai/v1/gateway/models?use_case=text&max_price_tier=medium&max_output_per_mtok_micros=2000000&availability_purpose=chat",
      {
        headers: { Authorization: "Bearer token" },
      }
    );

    expect(res.status).toBe(200);
    expect(store.listGatewayModels).toHaveBeenCalledWith(
      expect.objectContaining({
        availability_purpose: "chat",
        max_output_per_mtok_micros: 2_000_000,
        max_price_tier: "medium",
        use_case: "text",
        web_search: null,
      })
    );
  });

  it("lets superadmins update Gateway model availability", async () => {
    const store = makeStore();
    const app = await createApp({
      scopeResolver: scopeResolver(true),
      usageStore: store,
    });

    const res = await app.request(
      "http://localhost/ai/v1/gateway/models/availability",
      {
        body: JSON.stringify({
          available_for_chat: false,
          model_id: "openai/gpt-example",
        }),
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        method: "PATCH",
      }
    );
    const body = (await res.json()) as GatewayModelRecord;

    expect(res.status).toBe(200);
    expect(body.available_for_chat).toBe(false);
    expect(store.updateGatewayModelAvailability).toHaveBeenCalledWith(
      "openai/gpt-example",
      { available_for_chat: false },
      undefined
    );
  });

  it("returns filtered Gateway model options for authenticated users", async () => {
    const store = makeStore();
    vi.mocked(store.listGatewayModels).mockResolvedValueOnce([
      gatewayModel({
        display_name: "GPT Example",
        model_id: "openai/gpt-example",
        price_tier: "medium",
      }),
    ]);
    const app = await createApp({
      scopeResolver: scopeResolver(false),
      usageStore: store,
    });

    const res = await app.request(
      "http://localhost/ai/v1/gateway/model-options?use_case=text&max_price_tier=medium&availability_purpose=chat",
      {
        headers: { Authorization: "Bearer token" },
      }
    );
    const body = (await res.json()) as {
      items: Array<{ label: string; model_id: string; price_tier: string }>;
    };

    expect(res.status).toBe(200);
    expect(store.listGatewayModels).toHaveBeenCalledWith(
      expect.objectContaining({
        availability_purpose: "chat",
        max_price_tier: "medium",
        use_case: "text",
      })
    );
    expect(body.items).toEqual([
      expect.objectContaining({
        label: "GPT Example (openai/gpt-example)",
        model_id: "openai/gpt-example",
        price_tier: "medium",
      }),
    ]);
  });
});
