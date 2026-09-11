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

/**
 * Where a module lives in the shell (PLAN-spaces.md Phase 5a).
 *
 * Distinct from {@link PluginCategory}, which groups a module in catalogs and
 * settings; placement answers a different question — is this module a TOOL you
 * carry across every space (`global`), something a space CONTAINS (`space`), or
 * a configuration surface with no rail presence at all (`settings`)?
 *
 * Absent is treated as `"space"`, never `"global"`: an unmigrated module
 * quietly re-appearing on the app rail is the wrong-and-invisible outcome, so
 * the resolver emits a diagnostic naming the plugin instead.
 */
export const PLUGIN_PLACEMENTS = ["global", "space", "settings"] as const;

export type PluginPlacement = (typeof PLUGIN_PLACEMENTS)[number];

/** What a module with no declared placement is treated as. */
export const DEFAULT_PLUGIN_PLACEMENT: PluginPlacement = "space";

export function isPluginPlacement(value: unknown): value is PluginPlacement {
  return (
    typeof value === "string" &&
    (PLUGIN_PLACEMENTS as readonly string[]).includes(value)
  );
}

/** Sort key for category display; unknown / missing sorts last. */
export function pluginCategoryRank(category: string | undefined): number {
  if (!category) {
    return PLUGIN_CATEGORIES.length;
  }
  const index = PLUGIN_CATEGORIES.indexOf(category as PluginCategory);
  return index === -1 ? PLUGIN_CATEGORIES.length : index;
}
