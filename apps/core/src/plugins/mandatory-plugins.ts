export interface MandatoryPluginDeclaration {
  capabilities: readonly string[];
  hostHealthRelevant: true;
  pluginId: string;
  reason: string;
}

export const ENGENTY_HOST_MANDATORY_PLUGINS = [
  {
    capabilities: ["tenant-settings"],
    hostHealthRelevant: true,
    pluginId: "tenant-settings",
    reason:
      "Tenant-scoped settings KV and HTTP API; required by core, modules, and the UI shell.",
  },
  {
    capabilities: ["user-settings"],
    hostHealthRelevant: true,
    pluginId: "user-settings",
    reason:
      "User-scoped settings KV and HTTP API; required for appearance, copilot layout, and per-user prefs.",
  },
  {
    capabilities: ["module.engenty-copilot", "platform.copilot"],
    hostHealthRelevant: true,
    pluginId: "engenty-copilot",
    reason:
      "The copilot is the core AI assistant surface; apps/ai and the apps/ui shell depend on it.",
  },
] as const satisfies MandatoryPluginDeclaration[];

const MANDATORY_PLUGIN_DECLARATIONS: ReadonlyMap<
  string,
  MandatoryPluginDeclaration
> = new Map(
  ENGENTY_HOST_MANDATORY_PLUGINS.map((declaration) => [
    declaration.pluginId,
    declaration,
  ])
);

export function getMandatoryPluginDeclaration(
  pluginId: string
): MandatoryPluginDeclaration | undefined {
  return MANDATORY_PLUGIN_DECLARATIONS.get(pluginId);
}

export function isMandatoryPlugin(pluginId: string): boolean {
  return MANDATORY_PLUGIN_DECLARATIONS.has(pluginId);
}
