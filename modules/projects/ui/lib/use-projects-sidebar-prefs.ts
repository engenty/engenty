import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "engenty.projects-sidebar-prefs";

export interface ProjectsSidebarPrefs {
  clientId: string | "all";
  groupBy: "none" | "client" | "timeframe" | "lead";
  leadId: string | "all";
  sortBy: "title" | "start_date" | "end_date" | "created_at";
  sortOrder: "asc" | "desc";
}

const DEFAULT_PROJECTS_SIDEBAR_PREFS: ProjectsSidebarPrefs = {
  groupBy: "none",
  sortBy: "title",
  sortOrder: "asc",
  clientId: "all",
  leadId: "all",
};

function loadStoredPrefs(): Partial<ProjectsSidebarPrefs> | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Partial<ProjectsSidebarPrefs>;
  } catch {
    return null;
  }
}

function saveStoredPrefs(prefs: ProjectsSidebarPrefs): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // quota exceeded or private mode
  }
}

function mergePrefs(
  stored: Partial<ProjectsSidebarPrefs> | null
): ProjectsSidebarPrefs {
  return {
    groupBy: stored?.groupBy ?? DEFAULT_PROJECTS_SIDEBAR_PREFS.groupBy,
    sortBy: stored?.sortBy ?? DEFAULT_PROJECTS_SIDEBAR_PREFS.sortBy,
    sortOrder: stored?.sortOrder ?? DEFAULT_PROJECTS_SIDEBAR_PREFS.sortOrder,
    clientId: stored?.clientId ?? DEFAULT_PROJECTS_SIDEBAR_PREFS.clientId,
    leadId: stored?.leadId ?? DEFAULT_PROJECTS_SIDEBAR_PREFS.leadId,
  };
}

export function useProjectsSidebarPrefs() {
  const [prefs, setPrefs] = useState<ProjectsSidebarPrefs>(() =>
    mergePrefs(loadStoredPrefs())
  );
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    saveStoredPrefs(prefs);
  }, [prefs]);

  const updatePrefs = useCallback(
    (updater: (current: ProjectsSidebarPrefs) => ProjectsSidebarPrefs) => {
      setPrefs((current) => updater(current));
    },
    []
  );

  return {
    prefs,
    updatePrefs,
  };
}
