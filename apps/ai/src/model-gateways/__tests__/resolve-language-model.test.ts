import { UnconfiguredModelGatewayError } from "@engenty/ai-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveLanguageModel } from "../resolve-language-model.js";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.AI_GATEWAY_API_KEY = "vercel-test-key";
  delete process.env.OPENROUTER_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("resolveLanguageModel", () => {
  it("builds a Vercel gateway model for a bare catalog id", () => {
    const model = resolveLanguageModel("openai/gpt-5.6-luna");
    expect(typeof model).not.toBe("string");
  });

  it("passes a non-catalog id through for Mastra to resolve", () => {
    // No `provider/model` shape: not a gateway id at all. Mastra's own provider
    // registry owns these, and wrapping one would break it.
    expect(resolveLanguageModel("some-local-model")).toBe("some-local-model");
  });

  it("builds an OpenRouter model when the key is present", () => {
    process.env.OPENROUTER_API_KEY = "or-test-key";
    const model = resolveLanguageModel("openrouter:openai/gpt-4o");
    expect(typeof model).not.toBe("string");
    expect((model as { modelId?: string }).modelId).toBe("openai/gpt-4o");
  });

  it("keeps an OpenRouter variant suffix on the model id", () => {
    process.env.OPENROUTER_API_KEY = "or-test-key";
    const model = resolveLanguageModel(
      "openrouter:meta-llama/llama-3.1-8b-instruct:free"
    );
    expect((model as { modelId?: string }).modelId).toBe(
      "meta-llama/llama-3.1-8b-instruct:free"
    );
  });

  // Falling through to the default gateway would send an OpenRouter-only model
  // id to Vercel and surface as an unrelated "unknown model" deep in the run.
  it("refuses a gateway with no credential instead of falling back", () => {
    expect(() => resolveLanguageModel("openrouter:openai/gpt-4o")).toThrow(
      UnconfiguredModelGatewayError
    );
    expect(() => resolveLanguageModel("openrouter:openai/gpt-4o")).toThrow(
      /OPENROUTER_API_KEY/
    );
  });

  it("names the offending gateway on the error", () => {
    try {
      resolveLanguageModel("openrouter:openai/gpt-4o");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnconfiguredModelGatewayError);
      expect((err as UnconfiguredModelGatewayError).gateway).toBe("openrouter");
    }
  });
});
