import { describe, expect, it } from "vitest";
import {
  normalizeOpenRouterModel,
  OPENROUTER_MODELS_URL,
  openRouterGateway,
  openRouterTags,
} from "../openrouter-gateway.js";

const NOW = new Date("2026-08-22T10:00:00.000Z");

/** A trimmed row in the shape `https://openrouter.ai/api/v1/models` returns. */
function apiModel(overrides: Record<string, unknown> = {}) {
  return {
    architecture: {
      input_modalities: ["text", "image", "file"],
      modality: "text+image->text",
      output_modalities: ["text"],
    },
    context_length: 128_000,
    created: 1_715_558_400,
    description: "A general purpose model.",
    id: "openai/gpt-4o",
    name: "OpenAI: GPT-4o",
    pricing: {
      completion: "0.00001",
      input_cache_read: "0.00000125",
      prompt: "0.0000025",
      request: "0",
      web_search: "0",
    },
    supported_parameters: ["tools", "tool_choice", "reasoning", "max_tokens"],
    top_provider: { context_length: 128_000, max_completion_tokens: 16_384 },
    ...overrides,
  };
}

describe("openRouterTags", () => {
  // The whole point of the adapter: OpenRouter states capabilities as a
  // `supported_parameters` list, but `isCapableAgentModel` and the model-options
  // route both ask `tags.includes("tool-use")`. Untranslated, every OpenRouter
  // model would look incapable of tool calling and vanish from agent pickers.
  it("maps supported_parameters onto the platform tag vocabulary", () => {
    expect(openRouterTags(apiModel())).toEqual(
      expect.arrayContaining(["tool-use", "reasoning", "vision", "file-input"])
    );
  });

  it("omits tool-use when the model cannot call tools", () => {
    const tags = openRouterTags(
      apiModel({ supported_parameters: ["max_tokens", "temperature"] })
    );
    expect(tags).not.toContain("tool-use");
    expect(tags).not.toContain("reasoning");
  });

  it("reads vision and file-input off the input modalities", () => {
    const tags = openRouterTags(
      apiModel({
        architecture: {
          input_modalities: ["text"],
          output_modalities: ["text"],
        },
      })
    );
    expect(tags).not.toContain("vision");
    expect(tags).not.toContain("file-input");
  });

  it("infers caching support from a cache-read price", () => {
    expect(openRouterTags(apiModel())).toContain("implicit-caching");
    expect(
      openRouterTags(apiModel({ pricing: { prompt: "0.000001" } }))
    ).not.toContain("implicit-caching");
  });

  it("only claims web-search when it is actually priced", () => {
    // "0" means the model does not offer it, not that it is free.
    expect(openRouterTags(apiModel())).not.toContain("web-search");
    expect(
      openRouterTags(apiModel({ pricing: { web_search: "0.004" } }))
    ).toContain("web-search");
  });
});

describe("normalizeOpenRouterModel", () => {
  it("keeps the id verbatim and derives the provider from it", () => {
    const row = normalizeOpenRouterModel(apiModel(), { now: NOW });
    expect(row.model_id).toBe("openai/gpt-4o");
    expect(row.provider).toBe("openai");
    expect(row.providers).toEqual(["openai"]);
  });

  it("drops the vendor prefix OpenRouter puts in the display name", () => {
    // `provider` is already its own column; repeating it would make every
    // picker row start with the same word.
    expect(
      normalizeOpenRouterModel(apiModel(), { now: NOW }).display_name
    ).toBe("GPT-4o");
  });

  it("converts per-token USD strings to micros per Mtok", () => {
    const row = normalizeOpenRouterModel(apiModel(), { now: NOW });
    expect(row.input_per_mtok_micros).toBe(2_500_000);
    expect(row.output_per_mtok_micros).toBe(10_000_000);
    expect(row.cached_input_per_mtok_micros).toBe(1_250_000);
  });

  it("stores a negative (variable) price as unknown rather than as a number", () => {
    const row = normalizeOpenRouterModel(
      apiModel({ id: "openrouter/auto", pricing: { prompt: "-1" } }),
      { now: NOW }
    );
    expect(row.input_per_mtok_micros).toBeNull();
  });

  it("never marks a model available for embedding — OpenRouter serves chat only", () => {
    const row = normalizeOpenRouterModel(apiModel(), { now: NOW });
    expect(row.available_for_embedding).toBe(false);
    expect(row.available_for_rerank).toBe(false);
    expect(row.available_for_chat).toBe(true);
    expect(row.available_for_routing).toBe(true);
  });

  it("classifies an image-output model as image, not text", () => {
    const row = normalizeOpenRouterModel(
      apiModel({
        architecture: {
          input_modalities: ["text"],
          output_modalities: ["image"],
        },
      }),
      { now: NOW }
    );
    expect(row.use_cases).toContain("image");
    expect(row.available_for_image).toBe(true);
    expect(row.type).toBe("image");
  });

  it("falls back to the arrow modality when the arrays are absent", () => {
    const row = normalizeOpenRouterModel(
      apiModel({ architecture: { modality: "text+image->text" } }),
      { now: NOW }
    );
    expect(row.use_cases).toEqual(["text"]);
    expect(row.tags).toContain("vision");
  });

  it("records provenance so a row's origin is visible in the catalog", () => {
    const row = normalizeOpenRouterModel(apiModel(), { now: NOW });
    expect(row.source_url).toBe(OPENROUTER_MODELS_URL);
    expect(row.last_synced_at).toBe(NOW.toISOString());
    expect(row.released_at).toBe("2024-05-13T00:00:00.000Z");
  });
});

describe("openRouterGateway.listModels", () => {
  it("normalizes every row the endpoint returns", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          data: [apiModel(), apiModel({ id: "anthropic/claude-sonnet-4" })],
        }),
        { status: 200 }
      )) as unknown as typeof fetch;

    const rows = await openRouterGateway.listModels({ fetchImpl, now: NOW });
    expect(rows.map((r) => r.model_id)).toEqual([
      "openai/gpt-4o",
      "anthropic/claude-sonnet-4",
    ]);
  });

  it("skips rows with no id rather than writing a nameless catalog entry", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: [apiModel(), { name: "junk" }] }), {
        status: 200,
      })) as unknown as typeof fetch;

    const rows = await openRouterGateway.listModels({ fetchImpl, now: NOW });
    expect(rows).toHaveLength(1);
  });

  it("fails loudly on a non-OK response", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 503 })) as unknown as typeof fetch;

    await expect(
      openRouterGateway.listModels({ fetchImpl, now: NOW })
    ).rejects.toThrow("503");
  });
});
