import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installGatewayAwareDefaultProvider,
  openRouterLanguageModel,
  resetGatewayAwareDefaultProviderForTests,
  UnconfiguredModelGatewayError,
} from "../gateway-provider.js";

const ORIGINAL = { ...process.env };

/** `LanguageModel` is a union with `string`; every case here is an instance. */
function modelIdOf(model: unknown): string | undefined {
  return (model as { modelId?: string }).modelId;
}

function defaultProvider() {
  return (
    globalThis as {
      AI_SDK_DEFAULT_PROVIDER?: {
        embeddingModel(id: string): unknown;
        languageModel(id: string): unknown;
      };
    }
  ).AI_SDK_DEFAULT_PROVIDER;
}

beforeEach(() => {
  process.env.AI_GATEWAY_API_KEY = "vercel-test-key";
  delete process.env.OPENROUTER_API_KEY;
  resetGatewayAwareDefaultProviderForTests();
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  resetGatewayAwareDefaultProviderForTests();
});

describe("openRouterLanguageModel", () => {
  it("builds a chat model when the key is present", () => {
    process.env.OPENROUTER_API_KEY = "or-test-key";
    expect(modelIdOf(openRouterLanguageModel("openai/gpt-4o"))).toBe(
      "openai/gpt-4o"
    );
  });

  it("keeps an OpenRouter variant suffix on the model id", () => {
    process.env.OPENROUTER_API_KEY = "or-test-key";
    expect(
      modelIdOf(
        openRouterLanguageModel("meta-llama/llama-3.1-8b-instruct:free")
      )
    ).toBe("meta-llama/llama-3.1-8b-instruct:free");
  });

  // Falling through to Vercel would send an OpenRouter-only id to the wrong
  // gateway and surface as an unrelated "unknown model" deep in the run.
  it("names the missing credential instead of falling back", () => {
    expect(() => openRouterLanguageModel("openai/gpt-4o")).toThrow(
      UnconfiguredModelGatewayError
    );
    expect(() => openRouterLanguageModel("openai/gpt-4o")).toThrow(
      /OPENROUTER_API_KEY/
    );
  });
});

describe("installGatewayAwareDefaultProvider", () => {
  it("installs a provider on globalThis", () => {
    expect(defaultProvider()).toBeUndefined();
    installGatewayAwareDefaultProvider();
    expect(defaultProvider()).toBeDefined();
  });

  it("is idempotent, so a second host boot does not wrap the wrapper", () => {
    installGatewayAwareDefaultProvider();
    const first = defaultProvider();
    installGatewayAwareDefaultProvider();
    expect(defaultProvider()).toBe(first);
  });

  it("routes a ref with a gateway head to that gateway", () => {
    process.env.OPENROUTER_API_KEY = "or-test-key";
    installGatewayAwareDefaultProvider();
    const model = defaultProvider()?.languageModel(
      "openrouter:openai/gpt-4o"
    ) as { modelId?: string };
    expect(model.modelId).toBe("openai/gpt-4o");
  });

  it("leaves a bare id on the default gateway, exactly as before", () => {
    installGatewayAwareDefaultProvider();
    const model = defaultProvider()?.languageModel("openai/gpt-4o") as {
      modelId?: string;
    };
    expect(model.modelId).toBe("openai/gpt-4o");
  });

  // OpenRouter serves no embedding models. Routing there would break search for
  // an install that merely moved its chat roles across.
  it("keeps embeddings on the default gateway even for an openrouter ref", () => {
    installGatewayAwareDefaultProvider();
    const model = defaultProvider()?.embeddingModel(
      "openrouter:openai/text-embedding-3-small"
    ) as { modelId?: string };
    expect(model.modelId).toBe("openai/text-embedding-3-small");
  });
});
