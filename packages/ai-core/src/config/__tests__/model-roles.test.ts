import { describe, expect, it } from "vitest";
import { DEFAULT_AI_CLASSIFIER_MODEL_ID } from "../model-defaults.js";
import { resolvePurposeModel } from "../model-purposes.js";
import {
  AI_PLATFORM_ROLES,
  bindingsFromList,
  effortOfRole,
  graded,
  mergeDeclaredRoles,
  seedBindings,
} from "../model-roles.js";

describe("graded roles", () => {
  it("round-trips effort through the role id", () => {
    for (const effort of ["low", "medium", "high"] as const) {
      expect(effortOfRole(graded(effort))).toBe(effort);
    }
  });

  it("returns null for fixed roles and near-misses", () => {
    expect(effortOfRole("router")).toBeNull();
    expect(effortOfRole("model.extreme")).toBeNull();
    // A module role that merely starts with the prefix is not graded.
    expect(effortOfRole("model.low.extra")).toBeNull();
  });
});

describe("seedBindings", () => {
  it("seeds cheap capable chat and an open-weight router on Vercel", () => {
    const seeded = seedBindings();
    expect(seeded.find((b) => b.role === "model.low")).toMatchObject({
      gateway: "vercel",
      modelId: "openai/gpt-5-nano",
    });
    expect(seeded.find((b) => b.role === "router")?.modelId).toBe(
      "openai/gpt-oss-20b"
    );
  });

  it("seeds OpenRouter with a free router and cheap capable chat", () => {
    const seeded = seedBindings(undefined, (k) =>
      k === "OPENROUTER_API_KEY" ? "sk-or-test" : undefined
    );
    expect(seeded.find((b) => b.role === "router")).toMatchObject({
      gateway: "openrouter",
      modelId: "openai/gpt-oss-20b:free",
    });
    expect(seeded.find((b) => b.role === "model.low")?.modelId).toBe(
      "z-ai/glm-5.3-flash"
    );
  });

  it("honours AI_CHAT_MODEL when seeding", () => {
    const seeded = seedBindings(undefined, (k) =>
      k === "AI_CHAT_MODEL" ? "anthropic/claude-sonnet-5" : undefined
    );
    expect(seeded.find((b) => b.role === "model.medium")?.modelId).toBe(
      "anthropic/claude-sonnet-5"
    );
  });
});

describe("resolvePurposeModel with bindings", () => {
  const bindings = bindingsFromList([
    {
      gateway: "vercel",
      modelId: "anthropic/claude-sonnet-5",
      role: "model.medium",
    },
    { gateway: "vercel", modelId: "vendor/fixture-router", role: "router" },
  ]);

  it("uses the bound model as the platform layer", () => {
    expect(resolvePurposeModel({ purpose: "chat", bindings })).toEqual({
      gateway: "vercel",
      purpose: "chat",
      value: "anthropic/claude-sonnet-5",
      source: "platform",
    });
  });

  // The gateway is the half that used to be dropped: it was read from the
  // binding row, carried in `ModelBindings`, and then thrown away by the
  // resolver, so a role bound to OpenRouter still ran on Vercel.
  it("carries a non-default gateway from the binding into the ref", () => {
    const openRouterBindings = bindingsFromList([
      {
        gateway: "openrouter",
        modelId: "meta-llama/llama-3.1-70b-instruct",
        role: "model.medium",
      },
    ]);
    expect(
      resolvePurposeModel({ purpose: "chat", bindings: openRouterBindings })
    ).toEqual({
      gateway: "openrouter",
      purpose: "chat",
      value: "openrouter:meta-llama/llama-3.1-70b-instruct",
      source: "platform",
    });
  });

  it("leaves the default gateway implicit in the ref", () => {
    // A Vercel-bound role must resolve to the exact string it always did, or
    // every stored value and usage row shifts under an unrelated feature.
    expect(resolvePurposeModel({ purpose: "chat", bindings }).value).toBe(
      "anthropic/claude-sonnet-5"
    );
  });

  it("keeps an OpenRouter variant suffix intact through resolution", () => {
    const freeTier = bindingsFromList([
      {
        gateway: "openrouter",
        modelId: "meta-llama/llama-3.1-8b-instruct:free",
        role: "model.medium",
      },
    ]);
    expect(
      resolvePurposeModel({ purpose: "chat", bindings: freeTier })
    ).toEqual({
      gateway: "openrouter",
      purpose: "chat",
      value: "openrouter:meta-llama/llama-3.1-8b-instruct:free",
      source: "platform",
    });
  });

  it("ignores env once a role is bound", () => {
    // The binding IS the platform layer. Leaving env as a silent override would
    // reintroduce the two-places-to-look problem the table exists to remove.
    expect(
      resolvePurposeModel({
        purpose: "chat",
        bindings,
        readEnv: (k) => (k === "AI_CHAT_MODEL" ? "openai/gpt-5" : undefined),
      }).value
    ).toBe("anthropic/claude-sonnet-5");
  });

  it("falls back to the authored default for an unbound role", () => {
    expect(resolvePurposeModel({ purpose: "safeguard", bindings }).source).toBe(
      "default"
    );
  });

  it("classifier uses the classifier binding, not model.low", () => {
    const withLowAndClassifier = bindingsFromList([
      {
        gateway: "vercel",
        modelId: "deepseek/deepseek-v4-flash",
        role: "model.low",
      },
      {
        gateway: "vercel",
        modelId: "openai/gpt-5-nano",
        role: "classifier",
      },
    ]);
    expect(
      resolvePurposeModel({
        purpose: "classifier",
        bindings: withLowAndClassifier,
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "classifier",
      value: "openai/gpt-5-nano",
      source: "platform",
    });
  });

  it("classifier ignores model.low when no classifier binding exists", () => {
    const onlyLow = bindingsFromList([
      {
        gateway: "vercel",
        modelId: "deepseek/deepseek-v4-flash",
        role: "model.low",
      },
    ]);
    // Unbound classifier role → env, then package default — never model.low.
    expect(
      resolvePurposeModel({
        purpose: "classifier",
        bindings: onlyLow,
        readEnv: () => undefined,
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "classifier",
      value: DEFAULT_AI_CLASSIFIER_MODEL_ID,
      source: "default",
    });
  });

  it("still honours a tenant pin above the binding", () => {
    expect(
      resolvePurposeModel({
        purpose: "chat",
        bindings,
        tenantDefault: "openai/gpt-5",
      })
    ).toEqual({
      gateway: "vercel",
      purpose: "chat",
      value: "openai/gpt-5",
      source: "tenant",
    });
  });

  it("still filters a bound model against the allow-list", () => {
    // Binding is an admin decision; the allow-list is a commercial one. The
    // second still constrains the first.
    const resolved = resolvePurposeModel({
      purpose: "chat",
      bindings,
      allowedModels: ["openai/gpt-5-mini"],
    });
    expect(resolved.value).toBe("openai/gpt-5-mini");
  });

  it("dev mode bypasses the allow-list entirely", () => {
    const resolved = resolvePurposeModel({
      purpose: "chat",
      bindings,
      allowedModels: ["openai/gpt-5-mini"],
      devMode: true,
    });
    expect(resolved.value).toBe("anthropic/claude-sonnet-5");
  });
});

describe("mergeDeclaredRoles", () => {
  const declared = [
    {
      default_model_id: "openai/gpt-5",
      label: "Coder · plan",
      module_id: "engenty-coder",
      role: "coder.plan",
    },
  ];

  it("appends a module role and records who declared it", () => {
    const merged = mergeDeclaredRoles(declared);
    const added = merged.find((r) => r.role === "coder.plan");
    expect(added?.declaredBy).toBe("engenty-coder");
    expect(added?.surface).toBe("fixed");
    expect(merged.length).toBe(AI_PLATFORM_ROLES.length + 1);
  });

  it("refuses to let a module redefine a platform role", () => {
    // A module shipping `router` would silently retarget every routing call in
    // the product.
    const merged = mergeDeclaredRoles([
      {
        default_model_id: "evil/model",
        label: "Hijacked",
        module_id: "engenty-coder",
        role: "router",
      },
    ]);
    expect(merged.find((r) => r.role === "router")?.declaredBy).toBeNull();
    expect(merged.length).toBe(AI_PLATFORM_ROLES.length);
  });

  it("is deterministic when two modules claim the same role", () => {
    const merged = mergeDeclaredRoles([
      ...declared,
      { ...declared[0], module_id: "other-module" },
    ]);
    expect(merged.filter((r) => r.role === "coder.plan")).toHaveLength(1);
    expect(merged.find((r) => r.role === "coder.plan")?.declaredBy).toBe(
      "engenty-coder"
    );
  });

  it("seeds bindings for merged module roles", () => {
    const seeded = seedBindings(mergeDeclaredRoles(declared));
    expect(seeded.find((b) => b.role === "coder.plan")?.modelId).toBe(
      "openai/gpt-5"
    );
  });
});
