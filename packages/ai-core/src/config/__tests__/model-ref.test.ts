import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_GATEWAY_ID,
  formatModelRef,
  gatewayOfRef,
  isNonDefaultGatewayRef,
  modelIdOfRef,
  OPENROUTER_GATEWAY_ID,
  parseModelRef,
} from "../model-ref.js";

describe("parseModelRef", () => {
  it("reads a bare catalog id as the default gateway", () => {
    expect(parseModelRef("openai/gpt-5.6-luna")).toEqual({
      gateway: DEFAULT_MODEL_GATEWAY_ID,
      modelId: "openai/gpt-5.6-luna",
    });
  });

  it("splits a gateway head off a ref", () => {
    expect(parseModelRef("openrouter:openai/gpt-4o")).toEqual({
      gateway: OPENROUTER_GATEWAY_ID,
      modelId: "openai/gpt-4o",
    });
  });

  // The reason the head is matched against a known set instead of split on the
  // first colon: OpenRouter's own variant suffixes are colons.
  it.each([
    "meta-llama/llama-3.1-8b-instruct:free",
    "openai/gpt-4o:extended",
    "anthropic/claude-sonnet-4:thinking",
  ])("treats the variant suffix %s as part of the model id", (id) => {
    expect(parseModelRef(id)).toEqual({
      gateway: DEFAULT_MODEL_GATEWAY_ID,
      modelId: id,
    });
  });

  it("keeps a variant suffix when the ref also names a gateway", () => {
    expect(parseModelRef("openrouter:meta-llama/llama-3.1-8b:free")).toEqual({
      gateway: OPENROUTER_GATEWAY_ID,
      modelId: "meta-llama/llama-3.1-8b:free",
    });
  });

  it("does not read an unregistered head as a gateway", () => {
    expect(parseModelRef("somegateway:openai/gpt-4o")).toEqual({
      gateway: DEFAULT_MODEL_GATEWAY_ID,
      modelId: "somegateway:openai/gpt-4o",
    });
  });

  it("accepts a gateway registered by the caller", () => {
    expect(parseModelRef("bedrock:meta/llama", ["bedrock"])).toEqual({
      gateway: "bedrock",
      modelId: "meta/llama",
    });
  });

  it("lowercases the gateway and trims surrounding space", () => {
    expect(parseModelRef("  OpenRouter: openai/gpt-4o  ")).toEqual({
      gateway: OPENROUTER_GATEWAY_ID,
      modelId: "openai/gpt-4o",
    });
  });

  it("does not treat a leading colon as a gateway head", () => {
    expect(parseModelRef(":openai/gpt-4o").modelId).toBe(":openai/gpt-4o");
  });
});

describe("formatModelRef", () => {
  it("leaves the default gateway implicit so stored values do not churn", () => {
    expect(
      formatModelRef({ gateway: "vercel", modelId: "openai/gpt-4o" })
    ).toBe("openai/gpt-4o");
  });

  it("names a non-default gateway", () => {
    expect(
      formatModelRef({ gateway: "openrouter", modelId: "openai/gpt-4o" })
    ).toBe("openrouter:openai/gpt-4o");
  });

  it("round-trips every parse", () => {
    for (const ref of [
      "openai/gpt-4o",
      "openrouter:openai/gpt-4o",
      "openrouter:meta-llama/llama-3.1-8b:free",
      "meta-llama/llama-3.1-8b:free",
    ]) {
      expect(formatModelRef(parseModelRef(ref))).toBe(ref);
    }
  });

  it("yields a bare id when the model id is empty", () => {
    expect(formatModelRef({ gateway: "openrouter", modelId: "" })).toBe("");
  });
});

describe("accessors", () => {
  it("modelIdOfRef strips the gateway", () => {
    expect(modelIdOfRef("openrouter:openai/gpt-4o")).toBe("openai/gpt-4o");
    expect(modelIdOfRef("openai/gpt-4o")).toBe("openai/gpt-4o");
  });

  it("gatewayOfRef defaults rather than returning empty", () => {
    expect(gatewayOfRef("openai/gpt-4o")).toBe(DEFAULT_MODEL_GATEWAY_ID);
    expect(gatewayOfRef("openrouter:openai/gpt-4o")).toBe(
      OPENROUTER_GATEWAY_ID
    );
  });

  it("isNonDefaultGatewayRef distinguishes the two", () => {
    expect(isNonDefaultGatewayRef("openai/gpt-4o")).toBe(false);
    expect(isNonDefaultGatewayRef("openrouter:openai/gpt-4o")).toBe(true);
  });
});
