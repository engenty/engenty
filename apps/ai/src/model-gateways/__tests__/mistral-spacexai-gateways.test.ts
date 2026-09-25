import { vendorModelId } from "@engenty/ai-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MISTRAL_MODELS_URL,
  mistralGateway,
  normalizeMistralModel,
} from "../mistral-gateway.js";
import {
  isSpaceXAiChatModel,
  SPACEXAI_MODELS_URL,
  spaceXAiGateway,
  spaceXAiTags,
} from "../spacexai-gateway.js";

const NOW = new Date("2026-09-23T10:00:00.000Z");
const ORIGINAL = { ...process.env };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

beforeEach(() => {
  delete process.env.MISTRAL_API_KEY;
  delete process.env.XAI_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("mistralGateway", () => {
  it("lists nothing when the key is unset", async () => {
    const fetchImpl = vi.fn();
    expect(await mistralGateway.listModels({ fetchImpl, now: NOW })).toEqual(
      []
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps live chat models and maps their stated capabilities", async () => {
    process.env.MISTRAL_API_KEY = "m-key";
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            capabilities: {
              completion_chat: true,
              function_calling: true,
              vision: true,
            },
            id: "mistral-large-latest",
            max_context_length: 131_072,
            name: "Mistral Large",
          },
          { capabilities: { completion_chat: false }, id: "mistral-embed" },
          {
            capabilities: { completion_chat: true },
            deprecation: "2026-01-01",
            id: "open-mistral-7b",
          },
        ],
      })
    );

    const rows = await mistralGateway.listModels({ fetchImpl, now: NOW });

    expect(fetchImpl).toHaveBeenCalledWith(MISTRAL_MODELS_URL, {
      headers: { authorization: "Bearer m-key" },
    });
    expect(rows.map((row) => row.model_id)).toEqual([
      "mistral/mistral-large-latest",
    ]);
    expect(rows[0]).toMatchObject({
      context_tokens: 131_072,
      display_name: "Mistral Large",
      tags: ["structured-outputs", "tool-use", "vision"],
    });
  });

  it("strips the vendor prefix on the wire", () => {
    const row = normalizeMistralModel({ id: "codestral-latest" }, { now: NOW });
    expect(vendorModelId("mistral", row.model_id)).toBe("codestral-latest");
  });
});

describe("spaceXAiGateway", () => {
  it("keeps Grok chat models only", () => {
    expect(isSpaceXAiChatModel("grok-4.7")).toBe(true);
    expect(isSpaceXAiChatModel("grok-2-image-1212")).toBe(false);
    expect(isSpaceXAiChatModel("grok-imagine-video")).toBe(false);
  });

  it("tags reasoning and vision from the id", () => {
    expect(spaceXAiTags("grok-4.7")).toEqual([
      "tool-use",
      "structured-outputs",
      "reasoning",
      "vision",
    ]);
    expect(spaceXAiTags("grok-3")).toEqual(["tool-use", "structured-outputs"]);
  });

  it("lists with the key as bearer under the spacexai prefix", async () => {
    process.env.XAI_API_KEY = "x-key";
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [{ id: "grok-4.7" }, { id: "grok-2-image-1212" }],
      })
    );

    const rows = await spaceXAiGateway.listModels({ fetchImpl, now: NOW });

    expect(fetchImpl).toHaveBeenCalledWith(SPACEXAI_MODELS_URL, {
      headers: { authorization: "Bearer x-key" },
    });
    expect(rows.map((row) => row.model_id)).toEqual(["spacexai/grok-4.7"]);
    expect(vendorModelId("spacexai", "spacexai/grok-4.7")).toBe("grok-4.7");
  });
});
