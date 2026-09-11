import type { PluginCategory } from "@engenty/ui-plugin-sdk";
import type { ComponentType } from "react";

export type SettingsListCategory = PluginCategory | "other";

export type ModuleListFilter = "active" | "all";

export interface ModuleSettingsRow {
  category: SettingsListCategory;
  description?: string;
  enabled: boolean;
  icon: ComponentType<{ className?: string }>;
  id: string;
  label: string;
  mandatory: boolean;
  order: number;
  pluginId: string;
  to?: string;
}

export interface ModulePluginMeta {
  category?: PluginCategory;
  description?: string;
  enabled: boolean;
  id: string;
  kind?: string;
  mandatory: boolean;
  name: string;
  rootDir?: string;
  sourceType?: string;
}

export interface SettingsItemInput {
  category?: PluginCategory;
  id: string;
  label: string;
  order?: number;
  pluginId: string;
  requiresAdmin?: boolean;
  to: string;
}

/** Core settings surfaces that are not module rows (hardcoded elsewhere). */
const NON_MODULE_SETTINGS_PREFIXES = [
  "/settings/profile",
  "/settings/ai",
  "/setup/ai",
  "/settings/connections",
  "/setup/connections",
  "/settings/integration-keys",
  "/setup/integration-keys",
];

const EXCLUDED_PLUGIN_IDS = new Set(["connections"]);

export function isNonModuleSettingsPath(path: string): boolean {
  return NON_MODULE_SETTINGS_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

function isConnectionProvider(plugin: ModulePluginMeta): boolean {
  return (
    plugin.id.startsWith("connections-") ||
    (plugin.rootDir?.includes("/connections/providers/") ?? false)
  );
}

/** Workspace modules (and mandatory host plugins) that belong on Settings → Modules. */
export function isSettingsCatalogPlugin(plugin: ModulePluginMeta): boolean {
  if (EXCLUDED_PLUGIN_IDS.has(plugin.id) || isConnectionProvider(plugin)) {
    return false;
  }
  if (plugin.mandatory) {
    return true;
  }
  if ((plugin.kind ?? "module") !== "module") {
    return false;
  }
  if (plugin.sourceType === "package") {
    return false;
  }
  return true;
}

export function filterModuleRows(
  rows: ModuleSettingsRow[],
  filter: ModuleListFilter
): ModuleSettingsRow[] {
  if (filter === "all") {
    return rows;
  }
  return rows.filter((row) => row.enabled && !row.mandatory);
}

export function buildModuleSettingsRows(input: {
  fallbackIcon: ModuleSettingsRow["icon"];
  isAdmin: boolean;
  plugins: ModulePluginMeta[];
  resolveIcon: (
    item: SettingsItemInput
  ) => ModuleSettingsRow["icon"] | undefined;
  settingsItems: SettingsItemInput[];
}): ModuleSettingsRow[] {
  const pluginById = new Map(
    input.plugins.map((plugin) => [plugin.id, plugin])
  );

  const fromSettings = input.settingsItems
    .filter(
      (item) =>
        !isNonModuleSettingsPath(item.to) &&
        (input.isAdmin || item.requiresAdmin === false)
    )
    .map((item): ModuleSettingsRow => {
      const meta = pluginById.get(item.pluginId);
      const category = item.category ?? meta?.category ?? ("other" as const);
      return {
        id: item.id,
        pluginId: item.pluginId,
        to: item.to,
        label: item.label,
        description: meta?.description,
        enabled: meta?.enabled ?? true,
        mandatory: meta?.mandatory ?? false,
        icon: input.resolveIcon(item) ?? input.fallbackIcon,
        category,
        order: item.order ?? 10_000,
      };
    });

  const represented = new Set(fromSettings.map((row) => row.pluginId));
  const synthesized: ModuleSettingsRow[] = [];

  if (input.isAdmin) {
    for (const plugin of input.plugins) {
      if (represented.has(plugin.id) || !isSettingsCatalogPlugin(plugin)) {
        continue;
      }
      synthesized.push({
        id: `plugin:${plugin.id}`,
        pluginId: plugin.id,
        label: plugin.name || plugin.id,
        description: plugin.description,
        enabled: plugin.enabled,
        mandatory: plugin.mandatory,
        icon: input.fallbackIcon,
        category: plugin.category ?? "other",
        order: 10_000,
      });
    }
  }

  return [...fromSettings, ...synthesized];
}
