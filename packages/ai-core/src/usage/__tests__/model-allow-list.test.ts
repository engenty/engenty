import { describe, expect, it } from "vitest";
import {
  canonicalModelId,
  firstAllowedModelId,
  isModelAllowed,
  isUnrestricted,
  providerOfModelId,
} from "../model-allow-list.js";

describe("isUnrestricted", () => {
  it("treats null and empty lists alike", () => {
    expect(isUnrestricted({})).toBe(true);
    expect(
      isUnrestricted({ allowed_models: null, allowed_providers: null })
    ).toBe(true);
    expect(isUnrestricted({ allowed_models: [], allowed_providers: [] })).toBe(
      true
    );
    // A list of nothing but blanks is still no restriction — otherwise a stray
    // empty row in the editor would silently deny every model.
    expect(isUnrestricted({ allowed_models: ["  ", ""] })).toBe(true);
  });

  it("is restricted once either list has a real entry", () => {
    expect(isUnrestricted({ allowed_models: ["openai/gpt-5"] })).toBe(false);
    expect(isUnrestricted({ allowed_providers: ["openai"] })).toBe(false);
  });
});

describe("isModelAllowed", () => {
  it("permits everything when unrestricted", () => {
    expect(isModelAllowed("anything/at-all", {})).toBe(true);
  });

  it("matches an exact model grant", () => {
    const policy = { allowed_models: ["openai/gpt-5"] };
    expect(isModelAllowed("openai/gpt-5", policy)).toBe(true);
    expect(isModelAllowed("openai/gpt-5-mini", policy)).toBe(false);
  });

  it("ignores case and surrounding whitespace on both sides", () => {
    expect(
      isModelAllowed(" OpenAI/GPT-5 ", { allowed_models: ["openai/gpt-5"] })
    ).toBe(true);
    expect(
      isModelAllowed("openai/gpt-5", { allowed_models: [" OPENAI/GPT-5 "] })
    ).toBe(true);
  });

  it("matches a provider grant for any model of that vendor", () => {
    const policy = { allowed_providers: ["anthropic"] };
    expect(isModelAllowed("anthropic/claude-sonnet-5", policy)).toBe(true);
    expect(isModelAllowed("anthropic/claude-haiku-4.5", policy)).toBe(true);
    expect(isModelAllowed("openai/gpt-5", policy)).toBe(false);
  });

  it("prefers the catalog provider over the id prefix when given", () => {
    // The catalog is authoritative: an id whose prefix disagrees with the
    // recorded provider must follow the record.
    expect(
      isModelAllowed(
        "weird-prefix/model",
        { allowed_providers: ["cohere"] },
        "cohere"
      )
    ).toBe(true);
    expect(
      isModelAllowed(
        "cohere/model",
        { allowed_providers: ["cohere"] },
        "openai"
      )
    ).toBe(false);
  });

  it("treats the two lists as additive grants, not an intersection", () => {
    // A per-model exception widens a vendor grant; it must not narrow it.
    const policy = {
      allowed_models: ["anthropic/claude-sonnet-5"],
      allowed_providers: ["openai"],
    };
    expect(isModelAllowed("anthropic/claude-sonnet-5", policy)).toBe(true);
    expect(isModelAllowed("openai/gpt-5-nano", policy)).toBe(true);
    expect(isModelAllowed("google/gemini-3-pro", policy)).toBe(false);
  });

  it("never matches an empty id against a restricted policy", () => {
    expect(isModelAllowed("   ", { allowed_models: ["openai/gpt-5"] })).toBe(
      false
    );
  });

  it("does not equate a routing-prefixed id with the bare one", () => {
    // Same weights, different route and different billing — these are not
    // interchangeable, so no prefix stripping.
    const policy = { allowed_models: ["openai/gpt-oss-safeguard-20b"] };
    expect(
      isModelAllowed("openrouter/openai/gpt-oss-safeguard-20b", policy)
    ).toBe(false);
  });
});

describe("providerOfModelId", () => {
  it("takes the leading segment", () => {
    expect(providerOfModelId("anthropic/claude-sonnet-5")).toBe("anthropic");
    // A routing prefix is the provider: openrouter serves and bills it.
    expect(providerOfModelId("openrouter/openai/gpt-oss-safeguard-20b")).toBe(
      "openrouter"
    );
    expect(providerOfModelId("bare-id")).toBe("bare-id");
  });
});

describe("firstAllowedModelId", () => {
  it("returns the first non-blank grant", () => {
    expect(
      firstAllowedModelId({ allowed_models: ["  ", "openai/gpt-5"] })
    ).toBe("openai/gpt-5");
  });

  it("returns null when only providers are granted", () => {
    // Nothing to name without a catalog lookup — the write boundary has to
    // reject a policy that grants no model for a required purpose.
    expect(firstAllowedModelId({ allowed_providers: ["openai"] })).toBeNull();
    expect(firstAllowedModelId({})).toBeNull();
  });
});

describe("canonicalModelId", () => {
  it("trims and lowercases without touching separators", () => {
    expect(canonicalModelId("  OpenAI/GPT-5  ")).toBe("openai/gpt-5");
  });
});
