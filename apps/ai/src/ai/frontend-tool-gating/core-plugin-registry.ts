import type { PluginCapabilityRegistry } from "@engenty/plugin-sdk";
import type { EngentyPluginListItem } from "../core-http-client.js";

export function buildPluginCapabilityRegistryFromCoreList(
  plugins: EngentyPluginListItem[]
): PluginCapabilityRegistry {
  return {
    diagnostics: [],
    plugins: plugins.map((plugin) => ({
      id: plugin.id,
      loaded: Boolean(plugin.loaded),
      enabled: Boolean(plugin.globalEnabled ?? plugin.enabled),
      requires: plugin.requires ?? [],
      dependencies: plugin.dependencies ?? [],
      provides: plugin.provides ?? [],
    })),
  };
}

export function tenantPluginOverridesFromCoreList(
  plugins: EngentyPluginListItem[]
): Record<string, boolean> {
  const overrides: Record<string, boolean> = {};
  for (const plugin of plugins) {
    if (plugin.tenantOverride === false) {
      overrides[plugin.id] = false;
    }
    if (plugin.tenantOverride === true) {
      overrides[plugin.id] = true;
    }
  }
  return overrides;
}
