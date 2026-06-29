import type { PluginTier } from "./manifest.js";
import type { PluginRegistry } from "./registry.js";

/**
 * Capability ceiling for catalog-tier plugins (`tier: "plugin"`).
 *
 * See docs/content/dev/plugins/plugin-tiers.md. Modules (`tier: "module"`) have
 * no ceiling. Catalog plugins are runtime-installed, lower-trust code: they may
 * observe events and contribute operations/routes/AI/queues, but may NOT mutate
 * or veto other modules' flows (event filters/interceptors, profile/result
 * merge policies) or reach the host process surface (CLI). Surfaces not listed
 * here are allowed for both tiers.
 *
 * Enforcement is evaluated against registered registry state (not the manifest)
 * so it reflects what the plugin actually contributed at load time.
 */
interface TierRestrictedSurface {
  label: string;
  select: (
    registry: PluginRegistry
  ) => Array<{ pluginId?: string }> | undefined;
}

const PLUGIN_TIER_RESTRICTED_SURFACES: TierRestrictedSurface[] = [
  { label: "event filters", select: (r) => r.eventFilters },
  { label: "event interceptors", select: (r) => r.eventInterceptors },
  { label: "CLI commands", select: (r) => r.cliRegistrars },
  { label: "profile merge policies", select: (r) => r.profilePolicies },
  { label: "result merge policies", select: (r) => r.resultPolicies },
];

export interface PluginTierViolation {
  count: number;
  surface: string;
}

function countOwned(
  entries: Array<{ pluginId?: string }> | undefined,
  pluginId: string
): number {
  if (!entries) {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    if (entry.pluginId === pluginId) {
      count += 1;
    }
  }
  return count;
}

/**
 * Returns the restricted surfaces a `tier: "plugin"` plugin has contributed.
 * Empty for modules and for catalog plugins that stay within the ceiling.
 */
export function evaluatePluginTierViolations(params: {
  pluginId: string;
  registry: PluginRegistry;
  tier: PluginTier;
}): PluginTierViolation[] {
  if (params.tier !== "plugin") {
    return [];
  }
  const violations: PluginTierViolation[] = [];
  for (const surface of PLUGIN_TIER_RESTRICTED_SURFACES) {
    const count = countOwned(surface.select(params.registry), params.pluginId);
    if (count > 0) {
      violations.push({ count, surface: surface.label });
    }
  }
  return violations;
}

function disposeAndRemoveOwned(
  entries: Array<{ pluginId?: string; dispose?: () => unknown }> | undefined,
  pluginId: string
): void {
  if (!entries) {
    return;
  }
  let write = 0;
  for (const entry of entries) {
    if (entry.pluginId === pluginId) {
      // Event-registration receipts remove their handler from the events
      // runtime synchronously (before the first await), so the contribution is
      // disabled immediately. Other surfaces have no runtime side effect.
      try {
        entry.dispose?.();
      } catch {
        // Best-effort: a failing disposer must not block enforcement.
      }
      continue;
    }
    entries[write] = entry;
    write += 1;
  }
  entries.length = write;
}

/**
 * Hard-enforces the catalog-tier ceiling by disposing and removing the
 * restricted contributions a `tier: "plugin"` plugin registered. Allowed
 * contributions (operations, routes, AI, queues, …) are left intact.
 */
export function stripTierRestrictedContributions(params: {
  pluginId: string;
  registry: PluginRegistry;
}): void {
  for (const surface of PLUGIN_TIER_RESTRICTED_SURFACES) {
    disposeAndRemoveOwned(
      surface.select(params.registry) as
        | Array<{ pluginId?: string; dispose?: () => unknown }>
        | undefined,
      params.pluginId
    );
  }
}
