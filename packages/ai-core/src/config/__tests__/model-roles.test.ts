import { describe, expect, it } from "vitest";
import { resolvePurposeModel } from "../model-purposes.js";
import {
  AI_PLATFORM_ROLES,
  bindingsFromList,
  effortOfRole,
  graded,
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
  it("covers every platform role", () => {
    const seeded = seedBindings();
    expect(seeded.map((b) => b.role).sort()).toEqual(
      AI_PLATFORM_ROLES.map((r) => r.role).sort()
    );
    expect(seeded.every((b) => b.modelId.length > 0)).toBe(true);
    expect(seeded.every((b) => b.gateway === "vercel")).toBe(true);
  });

  it("carries legacy env values across the upgrade", () => {
    // The one and only time the env vars are read. A deployment that set
    // AI_CHAT_MODEL must keep running that model after the binding table lands.
    const seeded = seedBindings(undefined, (k) =>
      k === "AI_CHAT_MODEL" ? "anthropic/claude-sonnet-5" : undefined
    );
    const medium = seeded.find((b) => b.role === "model.medium");
    expect(medium?.modelId).toBe("anthropic/claude-sonnet-5");
    // Roles with no env key of their own keep their authored seed.
    expect(seeded.find((b) => b.role === "safeguard")?.modelId).toBe(
      "openai/gpt-oss-safeguard-20b"
    );
  });

  it("ignores blank env values rather than binding an empty model", () => {
    const seeded = seedBindings(undefined, (k) =>
      k === "AI_CHAT_MODEL" ? "   " : undefined
    );
    expect(seeded.find((b) => b.role === "model.medium")?.modelId).toBe(
      "openai/gpt-5-mini"
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
    { gateway: "vercel", modelId: "openai/gpt-5-nano", role: "router" },
  ]);

  it("uses the bound model as the platform layer", () => {
    expect(resolvePurposeModel({ purpose: "chat", bindings })).toEqual({
      purpose: "chat",
      value: "anthropic/claude-sonnet-5",
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

  it("still honours a tenant pin above the binding", () => {
    expect(
      resolvePurposeModel({
        purpose: "chat",
        bindings,
        tenantDefault: "openai/gpt-5",
      })
    ).toEqual({ purpose: "chat", value: "openai/gpt-5", source: "tenant" });
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
