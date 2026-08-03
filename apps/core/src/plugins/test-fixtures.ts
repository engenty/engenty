// Shared test doubles for the plugin registry.
//
// `PluginRegistry` and `PluginRecord` are broad interfaces that grow as the
// plugin surface does. A dozen test files each carried their own private
// `makeEmptyRegistry()` object literal, so every field added to the real
// interface silently left twelve fixtures behind — which is most of what
// apps/core's typecheck backlog turned out to be. One factory here means the
// next added field breaks in exactly one place, with a compiler error that
// says so.

import type { PluginRecord, PluginRegistry } from "./registry.js";

/** A registry with every required collection present and empty. */
export function makeEmptyRegistry(
  overrides: Partial<PluginRegistry> = {}
): PluginRegistry {
  return {
    aiRegistrations: [],
    cliRegistrars: [],
    diagnostics: [],
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    moduleOperations: [],
    plugins: [],
    queueDefinitions: [],
    queueHandlers: new Map(),
    services: [],
    testDataTypes: [],
    ...overrides,
  };
}

/** A loaded, enabled plugin record. Pass whatever the case under test cares about. */
export function makePluginRecord(
  overrides: Partial<PluginRecord> & Pick<PluginRecord, "id">
): PluginRecord {
  return {
    cliCommands: [],
    dependencies: [],
    enabled: true,
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    loaded: true,
    manifestPath: `/plugins/${overrides.id}/engenty.plugin.json`,
    moduleOperations: [],
    name: overrides.id,
    provides: [`module.${overrides.id}`],
    queues: [],
    rootDir: `/plugins/${overrides.id}`,
    services: [],
    source: "workspace",
    sourceType: "workspace",
    testDataTypes: [],
    ...overrides,
  } as PluginRecord;
}
