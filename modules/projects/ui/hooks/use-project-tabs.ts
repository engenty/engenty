import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import type { ComponentType } from "react";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A project tab id. `planning` and `notes` are native to this module; any other
 * id is contributed by another installed module via `registerTab` on the
 * {@link PROJECTS_DETAIL_SURFACE} surface (e.g. `files` from the files module).
 */
export type ProjectTab = string;

/** Surface key other modules target to contribute a project-detail tab. */
export const PROJECTS_DETAIL_SURFACE = "projects.detail";

export interface ProjectTabMeta {
  /** Contributed tab body. Native tabs render inline and omit this. */
  component?: ComponentType<UiTabRenderProps>;
  id: ProjectTab;
  /** Literal label; falls back to `labelKey` translation when absent. */
  label?: string;
  labelKey?: string;
  required: boolean;
}

/**
 * Tabs this module owns and renders inline. Everything else (files,
 * time-tracking, …) is a plugin contribution that only appears when the
 * owning module is installed — see {@link PROJECTS_DETAIL_SURFACE}.
 */
export const NATIVE_PROJECT_TABS: readonly ProjectTabMeta[] = [
  { id: "planning", labelKey: "detail.tabs.planning", required: true },
  { id: "notes", labelKey: "detail.tabs.notes", required: false },
] as const;

const DEFAULT_TAB: ProjectTab = "planning";

/** Tabs shown when a project has no saved configuration (`enabled_tabs` null). */
export const DEFAULT_ENABLED_TABS: ProjectTab[] = ["planning", "notes"];

export function useProjectTabs() {
  const [searchParams, setSearchParams] = useSearchParams();

  // The active id is validated against the *resolved* tab set by the page
  // (contributed tabs are not known statically here), so accept any non-empty
  // value and let the page fall back when it is not visible.
  const activeTab = useMemo(() => {
    const t = searchParams.get("tab")?.trim();
    return t ? (t as ProjectTab) : DEFAULT_TAB;
  }, [searchParams]);

  const setActiveTab = useCallback(
    (tab: ProjectTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === DEFAULT_TAB) {
            next.delete("tab");
          } else {
            next.set("tab", tab);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return {
    activeTab,
    setActiveTab,
  };
}
