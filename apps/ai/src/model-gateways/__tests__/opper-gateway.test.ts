import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isOpperCatalogModel,
  normalizeOpperModel,
  OPPER_MODELS_URL,
  opperGateway,
  opperTags,
} from "../opper-gateway.js";

const NOW = new Date("2026-09-13T10:00:00.000Z");
const ORIGINAL = { ...process.env };

/** A trimmed row in the shape `GET /v3/compat/models` returns. */
function apiModel(overrides: Record<string, unknown> = {}) {
  return {
    context_length: 200_000,
    created: 1_727_568_000,
    id: "anthropic/claude-sonnet-4.5",
    object: "model",
    opper: {
      capabilities: ["text", "tools", "vision", "pdf", "structured_output"],
      kind: "model",
      maker: "anthropic",
      max_output_tokens: 64_000,
      type: "llm",
    },
    pricing: {
      completion: "0.000015",
      input_cache_read: "0.0000003",
      prompt: "0.000003",
    },
    ...overrides,
  };
}

beforeEach(() => {
  delete process.env.OPPER_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("isOpperCatalogModel", () => {
  // Pools are bare names with no `provider/model` shape and routes report
  // neither capabilities nor a price; only concrete rows become catalog rows.
  it("keeps concrete language models only", () => {
    expect(isOpperCatalogModel(apiModel())).toBe(true);
    expect(
      isOpperCatalogModel(
        apiModel({ id: "claude-sonnet-4.5", opper: { kind: "pool" } })
      )
    ).toBe(false);
    expect(
      isOpperCatalogModel(
        apiModel({ id: "dynamic/support", opper: { kind: "dynamic_route" } })
      )
    ).toBe(false);
    expect(
      isOpperCatalogModel(
        apiModel({
          id: "openai/text-embedding-3-large",
          opper: { kind: "model", type: "embedding" },
        })
      )
    ).toBe(false);
  });
});

describe("opperTags", () => {
  it("maps Opper's capability names onto the platform tag vocabulary", () => {
    expect(opperTags(apiModel())).toEqual(
      expect.arrayContaining([
        "tool-use",
        "vision",
        "file-input",
        "structured-outputs",
        "implicit-caching",
      ])
    );
  });

  it("omits tool-use when the model cannot call tools", () => {
    expect(
      opperTags(apiModel({ opper: { capabilities: ["text"], kind: "model" } }))
    ).not.toContain("tool-use");
  });
});

describe("normalizeOpperModel", () => {
  it("keeps the id verbatim and converts the OpenRouter-shaped prices", () => {
    const row = normalizeOpperModel(apiModel(), { now: NOW });
    expect(row.model_id).toBe("anthropic/claude-sonnet-4.5");
    expect(row.provider).toBe("anthropic");
    expect(row.display_name).toBe("claude-sonnet-4.5");
    expect(row.input_per_mtok_micros).toBe(3_000_000);
    expect(row.output_per_mtok_micros).toBe(15_000_000);
    expect(row.cached_input_per_mtok_micros).toBe(300_000);
    expect(row.context_tokens).toBe(200_000);
    expect(row.max_output_tokens).toBe(64_000);
    expect(row.capabilities).toMatchObject({ tool_use: true, vision: true });
    expect(row.available_for_embedding).toBe(false);
  });
});

describe("opperGateway.listModels", () => {
  it("lists nothing, rather than failing, when the key is unset", async () => {
    const fetchImpl = vi.fn();
    await expect(
      opperGateway.listModels({ fetchImpl, now: NOW })
    ).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the key as a bearer and drops pools and routes", async () => {
    process.env.OPPER_API_KEY = "op-test";
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              apiModel(),
              apiModel({ id: "claude-sonnet-4.5", opper: { kind: "pool" } }),
            ],
          }),
          { headers: { "content-type": "application/json" }, status: 200 }
        )
    );
    const rows = await opperGateway.listModels({ fetchImpl, now: NOW });
    expect(rows.map((r) => r.model_id)).toEqual([
      "anthropic/claude-sonnet-4.5",
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(OPPER_MODELS_URL);
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer op-test"
    );
  });
});
