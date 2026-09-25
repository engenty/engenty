import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_MODELS_URL,
  anthropicGateway,
  anthropicTags,
  normalizeAnthropicModel,
} from "../anthropic-gateway.js";
import {
  isOpenAiChatModel,
  normalizeOpenAiModel,
  OPENAI_MODELS_URL,
  openAiGateway,
} from "../openai-gateway.js";

const NOW = new Date("2026-09-13T10:00:00.000Z");
const ORIGINAL = { ...process.env };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("isOpenAiChatModel", () => {
  // The inventory is mostly not chat models; a chat-only gateway must not
  // offer an embedding or a TTS voice as something an agent could run on.
  it("keeps the conversational families and drops the rest", () => {
    expect(isOpenAiChatModel("gpt-4o")).toBe(true);
    expect(isOpenAiChatModel("gpt-5")).toBe(true);
    expect(isOpenAiChatModel("o3-mini")).toBe(true);
    expect(isOpenAiChatModel("text-embedding-3-small")).toBe(false);
    expect(isOpenAiChatModel("gpt-4o-mini-tts")).toBe(false);
    expect(isOpenAiChatModel("gpt-4o-realtime-preview")).toBe(false);
    expect(isOpenAiChatModel("whisper-1")).toBe(false);
    expect(isOpenAiChatModel("dall-e-3")).toBe(false);
  });

  it("drops dated snapshots, which duplicate their alias", () => {
    expect(isOpenAiChatModel("gpt-4o-2024-08-06")).toBe(false);
    expect(isOpenAiChatModel("gpt-4o-mini")).toBe(true);
  });
});

describe("normalizeOpenAiModel", () => {
  // Same id as the Vercel/OpenRouter rows for the same weights: pricing is
  // keyed by id alone, and a provider grant for `openai` must cover it.
  it("stores the provider/model id and marks the row tool-capable", () => {
    const row = normalizeOpenAiModel(
      { created: 1_715_558_400, id: "gpt-4o", owned_by: "openai" },
      { now: NOW }
    );
    expect(row.model_id).toBe("openai/gpt-4o");
    expect(row.provider).toBe("openai");
    expect(row.tags).toContain("tool-use");
    expect(row.tags).toContain("vision");
    expect(row.available_for_agent).toBe(true);
    expect(row.available_for_embedding).toBe(false);
    expect(row.input_per_mtok_micros).toBeNull();
    expect(row.released_at).toBe("2024-05-13T00:00:00.000Z");
  });

  it("tags the reasoning families", () => {
    expect(normalizeOpenAiModel({ id: "o3" }, { now: NOW }).tags).toContain(
      "reasoning"
    );
    expect(
      normalizeOpenAiModel({ id: "gpt-4o-mini" }, { now: NOW }).tags
    ).not.toContain("reasoning");
  });
});

describe("openAiGateway.listModels", () => {
  it("lists nothing, rather than failing, when the key is unset", async () => {
    const fetchImpl = vi.fn();
    await expect(
      openAiGateway.listModels({ fetchImpl, now: NOW })
    ).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the key as a bearer and filters to chat models", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: "gpt-4o", object: "model" },
          { id: "text-embedding-3-small", object: "model" },
        ],
      })
    );
    const rows = await openAiGateway.listModels({ fetchImpl, now: NOW });
    expect(rows.map((r) => r.model_id)).toEqual(["openai/gpt-4o"]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(OPENAI_MODELS_URL);
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer sk-test"
    );
  });

  it("throws on a non-2xx so the sync records the gateway as failed", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchImpl = vi.fn(async () => jsonResponse({}, 401));
    await expect(
      openAiGateway.listModels({ fetchImpl, now: NOW })
    ).rejects.toThrow(/401/);
  });
});

describe("anthropicTags", () => {
  it("marks extended thinking on 3.7 and later only", () => {
    expect(anthropicTags("claude-sonnet-4-5")).toContain("reasoning");
    expect(anthropicTags("claude-3-7-sonnet-latest")).toContain("reasoning");
    expect(anthropicTags("claude-3-5-haiku-latest")).not.toContain("reasoning");
    expect(anthropicTags("claude-3-5-haiku-latest")).toContain("tool-use");
  });
});

describe("normalizeAnthropicModel", () => {
  it("prefixes the vendor and keeps the display name", () => {
    const row = normalizeAnthropicModel(
      {
        created_at: "2025-09-29T00:00:00Z",
        display_name: "Claude Sonnet 4.5",
        id: "claude-sonnet-4-5",
        type: "model",
      },
      { now: NOW }
    );
    expect(row.model_id).toBe("anthropic/claude-sonnet-4-5");
    expect(row.display_name).toBe("Claude Sonnet 4.5");
    expect(row.provider).toBe("anthropic");
    expect(row.released_at).toBe("2025-09-29T00:00:00.000Z");
    expect(row.capabilities).toMatchObject({ tool_use: true, vision: true });
  });
});

describe("anthropicGateway.listModels", () => {
  it("lists nothing when the key is unset", async () => {
    const fetchImpl = vi.fn();
    await expect(
      anthropicGateway.listModels({ fetchImpl, now: NOW })
    ).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // Anthropic does not take a bearer: the key goes in `x-api-key` next to a
  // version header, or the request is a 401 regardless of the key.
  it("authenticates with x-api-key and the version header", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [{ display_name: "Claude Sonnet 4.5", id: "claude-sonnet-4-5" }],
        has_more: false,
      })
    );
    const rows = await anthropicGateway.listModels({ fetchImpl, now: NOW });
    expect(rows.map((r) => r.model_id)).toEqual([
      "anthropic/claude-sonnet-4-5",
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(ANTHROPIC_MODELS_URL);
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers.authorization).toBeUndefined();
  });
});
