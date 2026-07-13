import { describe, expect, it } from "vitest";
import {
  resolvePluginCapability,
  resolvePluginEffectiveState,
} from "./capability-resolver.js";
import type { PluginRecord, PluginRegistry } from "./registry.js";

function plugin(
  id: string,
  overrides: Partial<PluginRecord> = {}
): PluginRecord {
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
    ...overrides,
  };
}

function registry(plugins: PluginRecord[]): PluginRegistry {
  return {
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

describe("resolvePluginEffectiveState", () => {
  it("reports allowed effective state for loaded enabled plugins", () => {
    const state = resolvePluginEffectiveState({
      capability: "plugin.contacts",
      contributionKind: "ui_contribution",
      pluginId: "contacts",
      registry: registry([plugin("contacts")]),
      tenantPluginOverrides: {},
    });

    expect(state).toMatchObject({
      allowed: true,
      blockedReasons: [],
      dependencySatisfied: true,
      globallyEnabled: true,
      loaded: true,
      state: "capability_enabled",
      tenantEnabled: true,
    });
  });

  it("includes dependency blocked reasons and dependency state", () => {
    const state = resolvePluginEffectiveState({
      capability: "plugin.invoices",
      contributionKind: "ui_contribution",
      pluginId: "invoices",
      registry: registry([
        plugin("contacts", { provides: ["module.contacts"] }),
        plugin("invoices", { requires: ["module.contacts"] }),
      ]),
      tenantPluginOverrides: { contacts: false },
    });

    expect(state.allowed).toBe(false);
    expect(state.blockedReasons).toContain("dependency_disabled");
    expect(state.dependencies).toEqual([
      {
        dependency: "module.contacts",
        pluginId: "contacts",
        reason: "dependency_disabled",
        satisfied: false,
      },
    ]);
  });

  it("preserves stable capability deny reason for operation callers", () => {
    const resolution = resolvePluginCapability({
      capability: "operation.contacts.list",
      contributionKind: "operation",
      pluginId: "contacts",
      registry: registry([plugin("contacts")]),
      tenantPluginOverrides: { contacts: false },
    });

    expect(resolution).toMatchObject({
      allowed: false,
      reason: "plugin_tenant_disabled",
    });
  });
});

describe("resolvePluginEffectiveState — package module licensing", () => {
  it("allows any module when the package allow-list is null (no restriction)", () => {
    const state = resolvePluginEffectiveState({
      capability: "plugin.invoices",
      contributionKind: "ui_contribution",
      pluginId: "invoices",
      registry: registry([plugin("invoices")]),
      tenantPluginOverrides: {},
      packageAllowedModules: null,
    });
    expect(state.allowed).toBe(true);
    expect(state.blockedReasons).not.toContain("package_module_not_licensed");
  });

  it("blocks a module absent from the package allow-list", () => {
    const state = resolvePluginEffectiveState({
      capability: "plugin.invoices",
      contributionKind: "ui_contribution",
      pluginId: "invoices",
      registry: registry([plugin("invoices")]),
      tenantPluginOverrides: {},
      packageAllowedModules: ["contacts", "tasks"],
    });
    expect(state.allowed).toBe(false);
    expect(state.blockedReasons).toContain("package_module_not_licensed");
    expect(state.state).toBe("blocked");
  });

  it("permits a module present in the package allow-list", () => {
    const state = resolvePluginEffectiveState({
      capability: "plugin.contacts",
      contributionKind: "ui_contribution",
      pluginId: "contacts",
      registry: registry([plugin("contacts")]),
      tenantPluginOverrides: {},
      packageAllowedModules: ["contacts", "tasks"],
    });
    expect(state.allowed).toBe(true);
    expect(state.blockedReasons).not.toContain("package_module_not_licensed");
  });
});
