import { moduleTenantDefault, type PluginStage } from "@engenty/plugin-sdk";
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

describe("resolvePluginEffectiveState — module stage", () => {
  // A normal install offers beta and up (ENGENTY_MODULE_STAGE unset).
  function staged(
    id: string,
    stage: PluginStage | undefined,
    requires: string[] = []
  ): PluginRecord {
    return {
      ...plugin(id),
      requires,
      tenantDefault: moduleTenantDefault(stage, "beta"),
    };
  }

  function resolve(
    plugins: PluginRecord[],
    pluginId: string,
    overrides: Record<string, boolean> = {}
  ) {
    return resolvePluginEffectiveState({
      capability: `plugin.${pluginId}`,
      contributionKind: "ui_contribution",
      pluginId,
      registry: registry(plugins),
      tenantPluginOverrides: overrides,
    });
  }

  it("keeps released and beta modules on until the tenant turns them off", () => {
    const plugins = [staged("contacts", undefined), staged("offers", "beta")];
    expect(resolve(plugins, "contacts").allowed).toBe(true);
    expect(resolve(plugins, "offers").allowed).toBe(true);
    expect(resolve(plugins, "offers", { offers: false }).allowed).toBe(false);
  });

  it("keeps an alpha module off until a superadmin turns it on for the tenant", () => {
    const plugins = [staged("tasks", "alpha")];
    expect(resolve(plugins, "tasks").allowed).toBe(false);
    expect(resolve(plugins, "tasks", { tasks: true }).allowed).toBe(true);
  });

  it("blocks an opted-in alpha module whose alpha dependency is still off", () => {
    const plugins = [
      staged("tasks", "alpha"),
      staged("time-tracking", "alpha", ["tasks"]),
    ];
    const state = resolve(plugins, "time-tracking", { "time-tracking": true });
    expect(state.allowed).toBe(false);
    expect(state.blockedReasons).toContain("dependency_disabled");
    expect(
      resolve(plugins, "time-tracking", { tasks: true, "time-tracking": true })
        .allowed
    ).toBe(true);
  });

  it("offers every stage on an install set to dev", () => {
    const record = {
      ...plugin("banking"),
      tenantDefault: moduleTenantDefault("dev", "dev"),
    };
    expect(resolve([record], "banking").allowed).toBe(true);
  });
});
