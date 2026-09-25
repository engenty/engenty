import { afterEach, describe, expect, it } from "vitest";
import { bindingsFromList } from "../../config/model-roles.js";
import { setPlatformBindings } from "../../config/platform-bindings-snapshot.js";
import { resolvePlatformEmbeddingModelId } from "../embedding-model.js";
import {
  isIndexCompatibleEmbeddingModel,
  supportedEmbeddingModels,
} from "../supported-embeddings.js";

describe("resolvePlatformEmbeddingModelId", () => {
  afterEach(() => setPlatformBindings(undefined));

  it("returns the bound model without its gateway head", () => {
    setPlatformBindings(
      bindingsFromList([
        {
          gateway: "vercel",
          modelId: "openai/text-embedding-3-large",
          role: "embedding",
        },
      ])
    );
    expect(resolvePlatformEmbeddingModelId()).toBe(
      "openai/text-embedding-3-large"
    );
  });

  it("throws when the embedding role is not bound", () => {
    expect(() => resolvePlatformEmbeddingModelId()).toThrow();
  });
});

describe("isIndexCompatibleEmbeddingModel", () => {
  it("accepts 1536-dim models, bare or as a default-gateway ref", () => {
    expect(
      isIndexCompatibleEmbeddingModel("openai/text-embedding-3-small")
    ).toBe(true);
    expect(
      isIndexCompatibleEmbeddingModel("vercel:openai/text-embedding-3-large")
    ).toBe(true);
  });

  it("refuses other widths and non-default gateways", () => {
    expect(isIndexCompatibleEmbeddingModel("mistral/mistral-embed")).toBe(
      false
    );
    expect(isIndexCompatibleEmbeddingModel("google/text-embedding-005")).toBe(
      false
    );
    expect(
      isIndexCompatibleEmbeddingModel(
        "openrouter:openai/text-embedding-3-small"
      )
    ).toBe(false);
  });

  it("every compatible model is in the gateway catalog", () => {
    const catalog = new Set(supportedEmbeddingModels.models.map((m) => m.id));
    const compatible = [...catalog].filter(isIndexCompatibleEmbeddingModel);
    expect(compatible).toContain("openai/text-embedding-3-small");
    expect(compatible.length).toBe(8);
  });
});
