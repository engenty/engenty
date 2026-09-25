import { describe, expect, it } from "vitest";
import { enforcePluginTier } from "./loader.js";
import type { PluginRegistry } from "./registry.js";
import { makeEmptyRegistry, makePluginRecord } from "./test-fixtures.js";

const silentLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
};

describe("enforcePluginTier", () => {
  it("strips every restricted surface a catalog plugin registered and leaves other plugins alone", () => {
    const disposed: string[] = [];
    const owned = (surface: string) => ({
      dispose: () => disposed.push(surface),
      pluginId: "acme",
    });
    const registry = makeEmptyRegistry({
      cliRegistrars: [owned("cli")],
      eventFilters: [owned("filter")],
      eventInterceptors: [
        owned("interceptor"),
        { dispose: () => disposed.push("other"), pluginId: "other" },
      ],
      profilePolicies: [owned("profile")],
      resultPolicies: [owned("result")],
    } as unknown as Partial<PluginRegistry>);
    const record = makePluginRecord({ id: "acme", tier: "plugin" });
    registry.plugins.push(record);

    enforcePluginTier({ logger: silentLogger, record, registry });

    const surfaces = [
      registry.cliRegistrars,
      registry.eventFilters,
      registry.eventInterceptors,
      registry.profilePolicies,
      registry.resultPolicies,
    ] as Array<Array<{ pluginId?: string }> | undefined>;
    for (const entries of surfaces) {
      expect(entries?.some((entry) => entry.pluginId === "acme")).toBe(false);
    }
    expect(disposed.sort()).toEqual(
      ["cli", "filter", "interceptor", "profile", "result"].sort()
    );
    expect(registry.eventInterceptors).toEqual([
      expect.objectContaining({ pluginId: "other" }),
    ]);
  });
});
