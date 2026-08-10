import { createContributionRegistry } from "@engenty/ui-plugin-sdk";

/** Context for a settings tab's visibility predicate, evaluated at render time. */
export interface TeamGlobalSettingsTabContext {
  featureFlags: Record<string, unknown> | null | undefined;
}

/**
 * One tab in team's tenant settings (`/settings/team/*`) beyond the built-in
 * fields + taxonomies tabs. Extensions (team-hr, …) register their own tab here
 * instead of core team hardcoding a union, so a tab appears only when that
 * extension is installed and its flag is on. Each tab owns a standalone route.
 */
export interface TeamGlobalSettingsTab {
  id: string;
  isVisible?: (ctx: TeamGlobalSettingsTabContext) => boolean;
  labelDefault: string;
  labelKey: string;
  order: number;
  /** Absolute route path under `/settings/team` (e.g. "/settings/team/holidays"). */
  path: string;
}

/**
 * The team settings tab registry. Observable — subscribe via
 * `useVisibleTeamGlobalSettingsTabs` so late plugin registrations re-render the nav.
 */
export const teamGlobalSettingsTabRegistry =
  createContributionRegistry<TeamGlobalSettingsTab>();

/** Register (or replace, by id) a team settings tab. Idempotent across reloads. */
export function registerTeamGlobalSettingsTab(
  tab: TeamGlobalSettingsTab
): void {
  teamGlobalSettingsTabRegistry.register(tab);
}

/** All registered settings tabs, sorted by `order`. */
export function getTeamGlobalSettingsTabs(): TeamGlobalSettingsTab[] {
  return teamGlobalSettingsTabRegistry.getAll();
}
