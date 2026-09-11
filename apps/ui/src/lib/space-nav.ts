/**
 * The space's sections — host-owned Work + Data, then plugin-contributed tabs
 * (PLAN-spaces.md Phase 5a).
 *
 * Work and Data belong to the space itself:
 *
 *  - **Work** is the space root: the copilot composer and the mount list.
 *  - **Data** is the space's own tree (PLAN-space-data.md D1), not a module.
 *
 * Everything after them is a plugin calling `registerSpaceTab`. Tasks registers
 * Plan that way — the strip does not hard-code a module id. A tab only renders
 * when that module is mounted in the space, so a space without Tasks has no
 * Plan tab rather than a door into a module it did not grant.
 *
 * A contributed tab stays at the space LEVEL: its TAB is the navigation, so
 * hiding the tab strip to show the thing the tab points at would take away the
 * control the user just used. A module opened from the Work list is different
 * — it is somewhere you went INTO, so the column follows you there.
 */
import type {
  UiCopilotAppContribution,
  UiSpaceTabContribution,
} from "@engenty/ui-plugin-sdk";

/** `/s/<key>/data` — the space's own page, reserved against module segments. */
export const SPACE_DATA_SEGMENT = "data";

/** Host sections (`work`, `data`) plus any plugin tab `id` (`plan`, …). */
export type SpaceSectionId = string;

export interface SpaceNavLocation {
  /** The module the URL opens, absent on the space's own pages. */
  moduleId?: string | undefined;
  /** The raw first segment after the space key, reserved segments included. */
  segment?: string | undefined;
}

/**
 * Modules that are an ASSISTANT you talk to rather than a place you browse.
 *
 * One definition, read by every surface that has to tell the two apart: the
 * Modules list omits them (Copilot has its own Work row; hired engenties are
 * the roster). Opening one still drills into the module level, same as Contacts
 * — its own sidebar, not mixed into the space column.
 *
 * A copilot app IS that declaration — a module contributes one exactly when it
 * offers a chat surface — and its plugin id is the module id.
 */
export function assistantModuleIds(
  copilotApps: readonly Pick<UiCopilotAppContribution, "pluginId">[]
): ReadonlySet<string> {
  return new Set(copilotApps.map((app) => app.pluginId));
}

/** The module a space tab opens — `moduleId` when set, otherwise the plugin. */
export function spaceTabModuleId(
  tab: Pick<UiSpaceTabContribution, "moduleId" | "pluginId">
): string {
  const override = tab.moduleId?.trim();
  return override || tab.pluginId;
}

/**
 * Which LEVEL the sidebar shows.
 *
 * `"space"` — the tabs, and (under Work) the module list.
 * `"module"` — only the open module's own nav, with a back arrow.
 *
 * Copilot is a module you go INTO, the same as Contacts: mixing its thread list
 * into the space column is the thing the back arrow exists to avoid. A
 * contributed tab (Plan) stays at the space level because its TAB is already
 * the navigation.
 */
export function spaceNavLevel(
  moduleId: string | undefined,
  spaceTabs: readonly Pick<UiSpaceTabContribution, "moduleId" | "pluginId">[]
): "module" | "space" {
  if (!moduleId) {
    return "space";
  }
  if (spaceTabs.some((tab) => spaceTabModuleId(tab) === moduleId)) {
    return "space";
  }
  return "module";
}

/**
 * Which section the URL is in.
 *
 * Work is the fallback: it is the space root, and every module that is not a
 * contributed tab is reached FROM the Work list.
 */
export function spaceSectionFor(
  location: SpaceNavLocation,
  spaceTabs: readonly Pick<
    UiSpaceTabContribution,
    "id" | "moduleId" | "pluginId"
  >[]
): SpaceSectionId {
  if (location.segment === SPACE_DATA_SEGMENT) {
    return "data";
  }
  const tab = spaceTabs.find(
    (entry) => spaceTabModuleId(entry) === location.moduleId
  );
  if (tab) {
    return tab.id;
  }
  return "work";
}
