import { describe, expect, it } from "vitest";
import { resolvePluginEffectiveState } from "./capability-resolver.js";
import type { PluginRecord, PluginRegistry } from "./registry.js";
import { makeEmptyRegistry } from "./test-fixtures.js";

function plugin(id: string): PluginRecord {
  return {
    cliCommands: [],
    dependencies: [],
    enabled: true,
    eventFilters: [],
    eventInterceptors: [],
    eventListeners: [],
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    id,
    loaded: true,
    manifestPath: `/modules/${id}/engenty.plugin.json`,
    moduleOperations: [],
    queues: [],
    rootDir: `/modules/${id}`,
    services: [],
    source: `/modules/${id}/src/plugin.ts`,
    sourceType: "module",
    testDataTypes: [],
  };
}

function registry(plugins: PluginRecord[]): PluginRegistry {
  return {
    ...makeEmptyRegistry(),
    cliRegistrars: [],
    diagnostics: [],
    eventFilters: [],
    eventInterceptors: [],
    eventListeners: [],
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    moduleOperations: [],
    plugins,
    queueDefinitions: [],
    queueHandlers: new Map(),
    services: [],
    testDataTypes: [],
  };
}

function resolveLicensed(pluginId: string) {
  return resolvePluginEffectiveState({
    capability: `plugin.${pluginId}`,
    contributionKind: "ui_contribution",
    pluginId,
    registry: registry([plugin(pluginId)]),
    tenantPluginOverrides: {},
    packageAllowedModules: ["contacts", "tasks"],
  });
}

describe("resolvePluginEffectiveState — package module licensing", () => {
  it("blocks a module absent from the package allow-list", () => {
    const state = resolveLicensed("invoices");
    expect(state.allowed).toBe(false);
    expect(state.blockedReasons).toContain("package_module_not_licensed");
  });

  it("allows a module present in the package allow-list", () => {
    expect(resolveLicensed("contacts").allowed).toBe(true);
  });
});
