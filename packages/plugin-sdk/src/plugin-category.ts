/**
 * Fixed catalog of plugin categories (one per plugin).
 *
 * - **Category order** = array order below (Settings sidebar + overview).
 * - **Within-category order** = `registerSettingsItem({ order })` / menu order.
 *
 * Distinct from `kind` (module vs package) and `tier` (trust ceiling).
 */
export const PLUGIN_CATEGORIES = [
  "engenty",
  "commercial",
  "work",
  "knowledge",
  "agents",
  "integrations",
  "platform",
] as const;

export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number];

const PLUGIN_CATEGORY_SET = new Set<string>(PLUGIN_CATEGORIES);

export function isPluginCategory(value: unknown): value is PluginCategory {
  return typeof value === "string" && PLUGIN_CATEGORY_SET.has(value);
}

/** Sort key for category display; unknown / missing sorts last. */
export function pluginCategoryRank(category: string | undefined): number {
  if (!category) {
    return PLUGIN_CATEGORIES.length;
  }
  const index = PLUGIN_CATEGORIES.indexOf(category as PluginCategory);
  return index === -1 ? PLUGIN_CATEGORIES.length : index;
}
