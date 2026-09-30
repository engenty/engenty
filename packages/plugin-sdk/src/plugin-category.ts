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

/**
 * How finished a module is. An install sets its stage with
 * `ENGENTY_MODULE_STAGE` (default `beta`):
 *
 * - `dev`: in development. Installed only where the stage is `dev`;
 *   everywhere else it is not loaded and not in the UI bundle.
 * - `alpha`: usable for pilots. Always installed; below the install's stage
 *   it is off until a superadmin turns it on for a tenant.
 * - `beta`: public, may still change.
 * - `stable`: released. Absent means `stable`.
 */
export const PLUGIN_STAGES = ["dev", "alpha", "beta", "stable"] as const;

export type PluginStage = (typeof PLUGIN_STAGES)[number];

/** What an install uses when `ENGENTY_MODULE_STAGE` is unset. */
export const DEFAULT_MODULE_STAGE: PluginStage = "beta";

export function isPluginStage(value: unknown): value is PluginStage {
  return (
    typeof value === "string" &&
    (PLUGIN_STAGES as readonly string[]).includes(value)
  );
}

function isStageAtLeast(stage: PluginStage, floor: PluginStage): boolean {
  return PLUGIN_STAGES.indexOf(stage) >= PLUGIN_STAGES.indexOf(floor);
}

/**
 * Whether an install at `installStage` has the module at all. A module at or
 * above the install's stage is installed, and so is every `alpha` module (a
 * superadmin can turn it on per tenant). Anything else is left out. The twin
 * in scripts/lib/engenty-modules.mjs decides the UI bundle the same way.
 */
export function isModuleStageInstalled(
  stage: PluginStage | undefined,
  installStage: PluginStage
): boolean {
  const resolved = stage ?? "stable";
  return resolved === "alpha" || isStageAtLeast(resolved, installStage);
}

/**
 * Whether a tenant has an installed module before any per-tenant override:
 * `on` (the tenant may turn it off) or `opt_in` (off until a superadmin turns
 * it on for the tenant).
 */
export type PluginTenantDefault = "on" | "opt_in";

/** At or above the install's stage a module is `on`; below it, `opt_in`. */
export function moduleTenantDefault(
  stage: PluginStage | undefined,
  installStage: PluginStage
): PluginTenantDefault {
  return isStageAtLeast(stage ?? "stable", installStage) ? "on" : "opt_in";
}

/** A tenant's module state from its default and the tenant's override. */
export function isPluginOnForTenant(
  tenantDefault: PluginTenantDefault | undefined,
  override: boolean | undefined
): boolean {
  return (tenantDefault ?? "on") === "on"
    ? override !== false
    : override === true;
}

/** Sort key for category display; unknown / missing sorts last. */
export function pluginCategoryRank(category: string | undefined): number {
  if (!category) {
    return PLUGIN_CATEGORIES.length;
  }
  const index = PLUGIN_CATEGORIES.indexOf(category as PluginCategory);
  return index === -1 ? PLUGIN_CATEGORIES.length : index;
}
