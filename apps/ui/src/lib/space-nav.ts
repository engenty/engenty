/**
 * The space's sections — host-owned Work + Data, then plugin-contributed tabs
 * (PLAN-spaces.md Phase 5a).
 *
 * Work and Data belong to the space itself:
 *
 *  - **Work** is the space root: the conversations and the mount list.
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
import type { UiSpaceTabContribution } from "@engenty/ui-plugin-sdk";

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
 * A module (Contacts) is somewhere you go INTO, so the column follows. A
 * contributed tab (Plan) stays at the space level because its TAB is already
 * the navigation. The copilot's page (`/s/<key>/copilot`) is the SPACE's — a
 * reserved segment, no module id — so it never reaches this question.
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
