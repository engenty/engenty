import {
  AI_PLATFORM_ROLES,
  type AiUsageStore,
  type ModelPricingRecord,
} from "@engenty/ai-core";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import { registerModelDefaultsRoutes } from "../api/model-defaults-routes.js";
import type {
  AiGatewayModelStore,
  GatewayModelRecord,
  ModelBindingRecord,
} from "../gateway-models.js";
import {
  applyModelDefaultsIfFresh,
  exportAvailableModels,
  type ModelDefaults,
} from "../model-defaults.js";

const ROLE = AI_PLATFORM_ROLES[0]?.role ?? "";

function catalogRow(
  gateway: string,
  modelId: string,
  overrides: Partial<GatewayModelRecord> = {}
): GatewayModelRecord {
  return {
    available_for_agent: false,
    available_for_embedding: false,
    available_for_image: false,
    available_for_rerank: false,
    available_for_classification: false,
    available_for_realtime: false,
    available_for_text: false,
    available_for_transcription: false,
    available_for_video: false,
    cached_input_per_mtok_micros: 10,
    capabilities: {},
    context_tokens: null,
    created_at: "2026-09-01T00:00:00.000Z",
    description: null,
    display_name: null,
    gateway,
    input_per_mtok_micros: 100,
    last_seen_at: "2026-09-01T00:00:00.000Z",
    last_sync_change: null,
    last_sync_run_id: null,
    last_synced_at: "2026-09-01T00:00:00.000Z",
    max_output_tokens: null,
    model_id: modelId,
    no_training_supported: null,
    output_per_mtok_micros: 200,
    price_tier: null,
    provider: modelId.split("/")[0] ?? "",
    providers: [],
    raw_json: {},
    regions: [],
    released_at: null,
    source_url: "",
    tags: [],
    type: null,
    updated_at: "2026-09-01T00:00:00.000Z",
    use_cases: [],
    web_search_per_query_micros: null,
    zdr_supported: null,
    ...overrides,
  };
}

/** In-memory catalog + bindings — only the methods model-defaults touches. */
function fakeGatewayStore(
  catalog: GatewayModelRecord[],
  bindings: Omit<ModelBindingRecord, "updated_at">[] = []
) {
  const rows = catalog.map((row) => ({ ...row }));
  const bound = new Map(bindings.map((row) => [row.role, { ...row }]));
  const store = {
    listGatewayModels: async () => rows.map((row) => ({ ...row })),
    listModelBindings: async () =>
      [...bound.values()].map((row) => ({ ...row, updated_at: "" })),
    updateGatewayModelAvailability: async (
      modelId: string,
      patch: Partial<GatewayModelRecord>,
      gateway?: string
    ) => {
      const row = rows.find(
        (r) => r.model_id === modelId && r.gateway === gateway
      );
      if (!row) {
        throw new Error(`gateway model not found: ${modelId}`);
      }
      Object.assign(row, patch);
      return row;
    },
    upsertGatewayModels: async (models: GatewayModelRecord[]) => {
      rows.push(...models.map((row) => ({ ...row })));
      return { changed: 0, inserted: models.length, total: models.length };
    },
    upsertModelBinding: async (row: Omit<ModelBindingRecord, "updated_at">) => {
      bound.set(row.role, { ...row });
      return { ...row, updated_at: "" };
    },
  } as unknown as AiGatewayModelStore;
  return { bound, rows, store };
}

function pricingStore(rows: ModelPricingRecord[]): AiUsageStore {
  return { listModelPricing: async () => rows } as unknown as AiUsageStore;
}

function flags(chat: boolean) {
  return {
    available_for_agent: chat,
    available_for_embedding: false,
    available_for_image: false,
    available_for_rerank: false,
    available_for_classification: chat,
    available_for_realtime: false,
    available_for_text: chat,
    available_for_transcription: false,
    available_for_video: false,
  };
}

/** The catalog part of a file entry — what the models table shows. */
function described(gateway: string, modelId: string) {
  const {
    available_for_agent: _agent,
    available_for_embedding: _embedding,
    available_for_image: _image,
    available_for_rerank: _rerank,
    available_for_classification: _classification,
    available_for_realtime: _realtime,
    available_for_text: _text,
    available_for_transcription: _transcription,
    available_for_video: _video,
    cached_input_per_mtok_micros: _cached,
    created_at: _created,
    input_per_mtok_micros: _input,
    last_seen_at: _seen,
    last_sync_change: _syncChange,
    last_sync_run_id: _syncRunId,
    last_synced_at: _synced,
    output_per_mtok_micros: _output,
    raw_json: _raw,
    updated_at: _updated,
    ...rest
  } = catalogRow(gateway, modelId);
  return rest;
}

function defaults(): ModelDefaults {
  return {
    models: [
      {
        ...described("vercel", "openai/gpt-a"),
        currency: "usd",
        input_per_mtok_micros: 1,
        output_per_mtok_micros: 2,
        cached_input_per_mtok_micros: 0,
        reasoning_per_mtok_micros: 2,
        ...flags(true),
      },
      {
        ...described("vercel", "new/model"),
        currency: "usd",
        input_per_mtok_micros: 1,
        output_per_mtok_micros: 2,
        cached_input_per_mtok_micros: 0,
        reasoning_per_mtok_micros: 0,
        ...flags(true),
      },
    ],
    bindings: [
      { role: ROLE, gateway: "vercel", model_id: "openai/gpt-a" },
      { role: "not_a_role", gateway: "vercel", model_id: "openai/gpt-a" },
    ],
  };
}

describe("applyModelDefaultsIfFresh", () => {
  it("activates listed models and binds roles on a fresh catalog", async () => {
    const { bound, rows, store } = fakeGatewayStore([
      catalogRow("vercel", "openai/gpt-a"),
      catalogRow("openrouter", "openai/gpt-a"),
    ]);

    const result = await applyModelDefaultsIfFresh(store, defaults());

    expect(result.availability).toEqual({
      applied: 1,
      deactivated: 0,
      inserted: 1,
    });
    // Only the listed gateway — the same id on another gateway stays off; the
    // model the catalog did not carry yet is added, activated, from the file.
    expect(
      rows.map((row) => [row.gateway, row.model_id, row.available_for_agent])
    ).toEqual([
      ["vercel", "openai/gpt-a", true],
      ["openrouter", "openai/gpt-a", false],
      ["vercel", "new/model", true],
    ]);
    expect(result.bindings?.applied).toBe(1);
    expect(result.bindings?.skipped).toEqual([
      "not_a_role → vercel:openai/gpt-a",
    ]);
    expect(bound.get(ROLE)).toEqual({
      gateway: "vercel",
      model_id: "openai/gpt-a",
      role: ROLE,
      scope: "platform",
    });
  });

  it("leaves an operator-configured catalog and bindings alone", async () => {
    const { bound, rows, store } = fakeGatewayStore(
      [
        catalogRow("vercel", "openai/gpt-a"),
        catalogRow("vercel", "openai/gpt-b", flags(true)),
      ],
      [
        {
          gateway: "vercel",
          model_id: "openai/gpt-b",
          role: ROLE,
          scope: "platform",
        },
      ]
    );

    const result = await applyModelDefaultsIfFresh(store, defaults());

    expect(result).toEqual({ availability: null, bindings: null });
    expect(rows[0]?.available_for_agent).toBe(false);
    expect(bound.get(ROLE)?.model_id).toBe("openai/gpt-b");
  });
});

describe("exportAvailableModels", () => {
  it("exports activated models with their active pricing", async () => {
    const { store } = fakeGatewayStore(
      [
        catalogRow("vercel", "openai/gpt-b", flags(true)),
        catalogRow("vercel", "openai/gpt-off"),
        catalogRow("vercel", "openai/gpt-a", flags(true)),
      ],
      [
        {
          gateway: "vercel",
          model_id: "openai/gpt-a",
          role: ROLE,
          scope: "platform",
        },
      ]
    );
    const usage = pricingStore([
      {
        cached_input_per_mtok_micros: 3,
        created_at: "2026-09-01T00:00:00.000Z",
        currency: "usd",
        id: "p1",
        input_per_mtok_micros: 30,
        model_id: "openai/gpt-a",
        output_per_mtok_micros: 60,
        reasoning_per_mtok_micros: 45,
        valid_from: "2026-09-01T00:00:00.000Z",
        valid_to: null,
      },
    ]);

    const exported = await exportAvailableModels(
      usage,
      store,
      new Date("2026-09-23T00:00:00.000Z")
    );

    expect(exported.models.map((model) => model.model_id)).toEqual([
      "openai/gpt-a",
      "openai/gpt-b",
    ]);
    // Pricing row wins, including its own reasoning price.
    expect(exported.models[0]).toMatchObject({
      input_per_mtok_micros: 30,
      output_per_mtok_micros: 60,
      reasoning_per_mtok_micros: 45,
    });
    // No pricing row: catalog prices, no reasoning price invented.
    expect(exported.models[1]).toMatchObject({
      input_per_mtok_micros: 100,
      output_per_mtok_micros: 200,
      reasoning_per_mtok_micros: 0,
    });
  });

  it("round-trips: export → fresh catalog → same activation", async () => {
    const configured = fakeGatewayStore(
      [
        catalogRow("vercel", "openai/gpt-a", flags(true)),
        catalogRow("vercel", "openai/gpt-b"),
      ],
      [
        {
          gateway: "vercel",
          model_id: "openai/gpt-a",
          role: ROLE,
          scope: "platform",
        },
      ]
    );
    const exported = await exportAvailableModels(
      pricingStore([]),
      configured.store
    );

    const fresh = fakeGatewayStore([
      catalogRow("vercel", "openai/gpt-a"),
      catalogRow("vercel", "openai/gpt-b"),
    ]);
    await applyModelDefaultsIfFresh(fresh.store, {
      ...exported,
      bindings: [],
    });

    expect(fresh.rows).toEqual(configured.rows);
  });
});

describe("model defaults routes", () => {
  it("refuses non-superadmins", async () => {
    const app = new Hono();
    registerModelDefaultsRoutes(app as never, {
      getGatewayModelStore: () => fakeGatewayStore([]).store,
      getUsageStore: () => pricingStore([]),
      scopeResolver: createStaticAiScopeResolver({
        isSuperAdmin: false,
        isTenantAdmin: false,
        tenantId: "00000000-0000-4000-8000-000000000001",
        tenantRole: "member",
        userId: "00000000-0000-4000-8000-000000000002",
      }),
    });
    const res = await app.request("http://localhost/ai/v1/models/defaults", {
      headers: { Authorization: "Bearer token" },
    });
    expect(res.status).toBe(403);
  });
});
