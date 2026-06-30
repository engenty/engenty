import { createContributionRegistry } from "@engenty/ui-plugin-sdk";
import type { ComponentType } from "react";
import type { TeamMemberListItem } from "./api.js";

/** Context for a tab's visibility predicate, evaluated at render time. */
export interface TeamMemberDetailTabContext {
  featureFlags: Record<string, unknown> | null | undefined;
  pluginsApi: { isPluginEnabled: (id: string) => boolean } | null;
}

/**
 * One member-detail tab beyond the built-in `profile` tab. Modules (tasks,
 * team-hr, …) register their own tab here instead of core team hardcoding a
 * union, so an extension's tab appears only when that extension is installed.
 * A tab either renders inline `content` inside the shared detail page, or — when
 * `content` is omitted — owns a standalone route at `/mdl/team/:id/<urlSuffix>`.
 */
export interface TeamMemberDetailTab {
  content?: ComponentType<{ member: TeamMemberListItem }>;
  id: string;
  isVisible?: (ctx: TeamMemberDetailTabContext) => boolean;
  labelDefault: string;
  labelKey: string;
  order: number;
  /** URL segment under `/mdl/team/:id` (e.g. "tasks", "hr", "time"). */
  urlSuffix: string;
}

/**
 * The member-detail tab registry. Observable — subscribe via
 * `useTeamMemberDetailTabs` so late plugin registrations re-render consumers.
 */
export const teamMemberDetailTabRegistry =
  createContributionRegistry<TeamMemberDetailTab>();

/** Register (or replace, by id) a member-detail tab. Idempotent across reloads. */
export function registerTeamMemberDetailTab(tab: TeamMemberDetailTab): void {
  teamMemberDetailTabRegistry.register(tab);
}

/** All registered tabs, sorted by `order`. */
export function getTeamMemberDetailTabs(): TeamMemberDetailTab[] {
  return teamMemberDetailTabRegistry.getAll();
}

/** Registered tabs whose visibility predicate passes for the given context. */
export function getVisibleTeamMemberDetailTabs(
  ctx: TeamMemberDetailTabContext
): TeamMemberDetailTab[] {
  return getTeamMemberDetailTabs().filter((tab) =>
    tab.isVisible ? tab.isVisible(ctx) : true
  );
}
