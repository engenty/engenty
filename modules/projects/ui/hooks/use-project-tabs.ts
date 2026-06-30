import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type ProjectTab =
  | "planning"
  | "notes"
  | "files"
  | "time-tracking"
  | "reporting";

const VALID_TABS: ProjectTab[] = [
  "planning",
  "notes",
  "files",
  "time-tracking",
  "reporting",
];

export interface ProjectTabMeta {
  /** Feature flag key; when set, tab is only available when flag is enabled */
  featureFlagKey?: string;
  id: ProjectTab;
  labelKey: string;
  required: boolean;
}

export const PROJECT_TABS: readonly ProjectTabMeta[] = [
  { id: "planning", labelKey: "detail.tabs.planning", required: true },
  { id: "notes", labelKey: "detail.tabs.notes", required: false },
  {
    id: "files",
    labelKey: "detail.tabs.files",
    required: false,
    featureFlagKey: "projects.tabs.files",
  },
  {
    id: "time-tracking",
    labelKey: "detail.tabs.timeTracking",
    required: false,
    featureFlagKey: "projects.tabs.time_tracking",
  },
  {
    id: "reporting",
    labelKey: "detail.tabs.reporting",
    required: false,
    featureFlagKey: "projects.tabs.reporting",
  },
] as const;

const DEFAULT_TAB: ProjectTab = "planning";

/** Tabs shown when a project has no saved configuration (`enabled_tabs` null). */
export const DEFAULT_ENABLED_TABS: ProjectTab[] = [
  "planning",
  "notes",
  "files",
];

export function useProjectTabs() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo(() => {
    const t = searchParams.get("tab");
    if (t && VALID_TABS.includes(t as ProjectTab)) {
      return t as ProjectTab;
    }
    return DEFAULT_TAB;
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
