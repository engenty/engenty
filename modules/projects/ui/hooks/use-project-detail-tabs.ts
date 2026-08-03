import { useUiContributions } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import {
  NATIVE_PROJECT_TABS,
  PROJECTS_DETAIL_SURFACE,
  type ProjectTabMeta,
} from "./use-project-tabs.js";

/**
 * The project-detail tab set = this module's native tabs plus every tab another
 * installed module contributes to the `projects.detail` surface. A contributed
 * tab only exists while its owning plugin is enabled, so a parked module (e.g.
 * `files`) simply has no tab — no feature flag or availability check needed.
 *
 * `timeplanEnabled` is the project's own switch: a lean project has no time
 * planning at all, so the tab is dropped from the set rather than hidden.
 */
export function useProjectDetailTabs(
  timeplanEnabled: boolean
): ProjectTabMeta[] {
  const { contributions } = useUiContributions();

  return useMemo(() => {
    const native = timeplanEnabled
      ? NATIVE_PROJECT_TABS
      : NATIVE_PROJECT_TABS.filter((tab) => tab.id !== "timeplan");
    const contributed: ProjectTabMeta[] = contributions.tabs
      .filter((tab) => tab.surface === PROJECTS_DETAIL_SURFACE)
      .map((tab) => ({
        id: tab.id,
        label: tab.label,
        labelKey: tab.labelKey,
        required: false,
        component: tab.component,
      }));
    return [...native, ...contributed];
  }, [contributions.tabs, timeplanEnabled]);
}
