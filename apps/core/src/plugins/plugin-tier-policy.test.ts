import { describe, expect, it } from "vitest";
import { resolvePluginTier } from "./manifest.js";
import {
  evaluatePluginTierViolations,
  stripTierRestrictedContributions,
} from "./plugin-tier-policy.js";
import type { PluginRegistry } from "./registry.js";

function makeRegistry(overrides: Partial<PluginRegistry>): PluginRegistry {
  return {
    eventFilters: [],
    eventInterceptors: [],
    cliRegistrars: [],
    profilePolicies: [],
    resultPolicies: [],
    ...overrides,
  } as unknown as PluginRegistry;
}

describe("resolvePluginTier", () => {
  it("defaults to module when unset or unrecognized", () => {
    expect(resolvePluginTier(undefined)).toBe("module");
    expect(resolvePluginTier("")).toBe("module");
    expect(resolvePluginTier("nonsense")).toBe("module");
    expect(resolvePluginTier("module")).toBe("module");
  });

  it("recognizes the catalog tier", () => {
    expect(resolvePluginTier("plugin")).toBe("plugin");
  });
});

describe("evaluatePluginTierViolations", () => {
  it("never restricts modules", () => {
    const registry = makeRegistry({
      eventInterceptors: [{ pluginId: "deep" }],
      cliRegistrars: [{ pluginId: "deep" }],
      profilePolicies: [{ pluginId: "deep" }],
    } as Partial<PluginRegistry>);
    expect(
      evaluatePluginTierViolations({
        pluginId: "deep",
        registry,
        tier: "module",
      })
    ).toEqual([]);
  });

  it("allows an adapter-shaped catalog plugin (operations/observers only)", () => {
    // No restricted surfaces registered → catalog plugin is within its ceiling.
    const registry = makeRegistry({
      eventListeners: [{ pluginId: "acme-adapter" }],
    } as Partial<PluginRegistry>);
    expect(
      evaluatePluginTierViolations({
        pluginId: "acme-adapter",
        registry,
        tier: "plugin",
      })
    ).toEqual([]);
  });

  it("blocks event filters, interceptors, CLI, and policies for catalog plugins", () => {
    const registry = makeRegistry({
      eventFilters: [{ pluginId: "acme" }],
      eventInterceptors: [{ pluginId: "acme" }, { pluginId: "acme" }],
      cliRegistrars: [{ pluginId: "acme" }],
      profilePolicies: [{ pluginId: "acme" }],
      resultPolicies: [{ pluginId: "acme" }],
    } as Partial<PluginRegistry>);
    const violations = evaluatePluginTierViolations({
      pluginId: "acme",
      registry,
      tier: "plugin",
    });
    expect(violations).toEqual([
      { surface: "event filters", count: 1 },
      { surface: "event interceptors", count: 2 },
      { surface: "CLI commands", count: 1 },
      { surface: "profile merge policies", count: 1 },
      { surface: "result merge policies", count: 1 },
    ]);
  });

  it("only counts contributions owned by the evaluated plugin", () => {
    const registry = makeRegistry({
      eventInterceptors: [{ pluginId: "other" }, { pluginId: "acme" }],
    } as Partial<PluginRegistry>);
    expect(
      evaluatePluginTierViolations({
        pluginId: "acme",
        registry,
        tier: "plugin",
      })
    ).toEqual([{ surface: "event interceptors", count: 1 }]);
  });
});

describe("stripTierRestrictedContributions", () => {
  it("disposes and removes only the offending plugin's restricted entries", () => {
    const disposed: string[] = [];
    const registry = makeRegistry({
      eventInterceptors: [
        { pluginId: "acme", dispose: () => disposed.push("acme-int") },
        { pluginId: "other", dispose: () => disposed.push("other-int") },
      ],
      profilePolicies: [{ pluginId: "acme" }],
      cliRegistrars: [{ pluginId: "other" }],
    } as unknown as Partial<PluginRegistry>);

    stripTierRestrictedContributions({ pluginId: "acme", registry });

    expect(disposed).toEqual(["acme-int"]);
    expect(registry.eventInterceptors).toEqual([
      expect.objectContaining({ pluginId: "other" }),
    ]);
    expect(registry.profilePolicies).toEqual([]);
    // Untouched: another plugin's CLI registration survives.
    expect(registry.cliRegistrars).toHaveLength(1);
  });
});
