import { describe, expect, it } from "vitest";
import { AI_MODEL_PURPOSES, resolvePurposeModel } from "../model-purposes.js";
import { bindingsFromList } from "../model-roles.js";

function bound(modelId: string, role = "model.medium") {
  return bindingsFromList([{ gateway: "vercel", modelId, role }]);
}

describe("resolvePurposeModel provenance", () => {
  it("prefers session > agent > tenant > platform binding", () => {
    const layered = {
      agentOverride: "a/model",
      bindings: bound("b/model"),
      purpose: "chat" as const,
      sessionOverride: "s/model",
      tenantDefault: "t/model",
    };
    expect(resolvePurposeModel(layered)).toEqual({
      gateway: "vercel",
      purpose: "chat",
      source: "session",
      value: "s/model",
    });
    expect(resolvePurposeModel({ ...layered, sessionOverride: null })).toEqual({
      gateway: "vercel",
      purpose: "chat",
      source: "agent",
      value: "a/model",
    });
    expect(
      resolvePurposeModel({
        ...layered,
        agentOverride: null,
        sessionOverride: null,
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "chat",
      source: "tenant",
      value: "t/model",
    });
    expect(
      resolvePurposeModel({ bindings: bound("b/model"), purpose: "chat" })
    ).toEqual({
      gateway: "vercel",
      purpose: "chat",
      source: "platform",
      value: "b/model",
    });
  });

  it("resolves each purpose through its own role", () => {
    const bindings = bindingsFromList([
      { gateway: "vercel", modelId: "chat/m", role: "model.medium" },
      { gateway: "vercel", modelId: "typesafe-ai/jev", role: "classifier" },
      { gateway: "vercel", modelId: "fast/m", role: "fast_text" },
    ]);
    expect(resolvePurposeModel({ bindings, purpose: "chat" }).value).toBe(
      "chat/m"
    );
    expect(resolvePurposeModel({ bindings, purpose: "classifier" }).value).toBe(
      "typesafe-ai/jev"
    );
    expect(resolvePurposeModel({ bindings, purpose: "fast_text" }).value).toBe(
      "fast/m"
    );
  });

  it("throws for an unbound role instead of inventing a model", () => {
    expect(() =>
      resolvePurposeModel({ bindings: bound("x"), purpose: "fast_text" })
    ).toThrow('Model role "fast_text" is not bound');
  });

  it("exposes the tunable purposes in a stable order", () => {
    expect([...AI_MODEL_PURPOSES]).toEqual(["chat", "classifier", "fast_text"]);
  });
});

describe("resolvePurposeModel governance allow-list", () => {
  it("keeps a tenant pin that is on the allow-list", () => {
    expect(
      resolvePurposeModel({
        allowedModels: ["openai/gpt-5", "openai/gpt-5-mini"],
        bindings: bound("openai/gpt-5-mini"),
        purpose: "chat",
        tenantDefault: "openai/gpt-5",
      }).source
    ).toBe("tenant");
  });

  it("demotes a tenant pin outside the allow-list to the binding", () => {
    expect(
      resolvePurposeModel({
        allowedModels: ["openai/gpt-5-mini"],
        bindings: bound("openai/gpt-5-mini"),
        purpose: "chat",
        tenantDefault: "anthropic/claude-opus-4-8",
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "chat",
      source: "platform",
      value: "openai/gpt-5-mini",
    });
  });

  it("substitutes a granted model when the binding is disallowed too", () => {
    // Returning an id the preflight rejects would brick the tenant with no way
    // out from the picker — land on the first granted model instead.
    expect(
      resolvePurposeModel({
        allowedModels: ["anthropic/claude-sonnet-5"],
        bindings: bound("openai/gpt-5"),
        purpose: "chat",
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "chat",
      source: "governance",
      value: "anthropic/claude-sonnet-5",
    });
  });

  it("honours a provider grant without any model listed", () => {
    expect(
      resolvePurposeModel({
        allowedProviders: ["openai"],
        bindings: bound("openai/gpt-5"),
        purpose: "chat",
      }).source
    ).toBe("platform");
  });

  it("ignores case and stray whitespace in the allow-list", () => {
    expect(
      resolvePurposeModel({
        allowedModels: [" OpenAI/GPT-5 "],
        bindings: bound("openai/gpt-5"),
        purpose: "chat",
      }).value
    ).toBe("openai/gpt-5");
  });

  it("treats an empty allow-list as no restriction", () => {
    expect(
      resolvePurposeModel({
        allowedModels: [],
        bindings: bound("x"),
        purpose: "chat",
        tenantDefault: "openai/gpt-5",
      }).value
    ).toBe("openai/gpt-5");
  });
});
