import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "engenty.team-sidebar-prefs";

export interface TeamSidebarPrefs {
  groupBy: "none" | "department" | "role" | "location";
  sortBy: "full_name" | "position" | "department" | "created_at";
  sortOrder: "asc" | "desc";
}

const DEFAULT_TEAM_SIDEBAR_PREFS: TeamSidebarPrefs = {
  groupBy: "none",
  sortBy: "full_name",
  sortOrder: "asc",
};

function loadStoredPrefs(): Partial<TeamSidebarPrefs> | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Partial<TeamSidebarPrefs>;
  } catch {
    return null;
  }
}

function saveStoredPrefs(prefs: TeamSidebarPrefs): void {
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
  stored: Partial<TeamSidebarPrefs> | null
): TeamSidebarPrefs {
  return {
    groupBy: stored?.groupBy ?? DEFAULT_TEAM_SIDEBAR_PREFS.groupBy,
    sortBy: stored?.sortBy ?? DEFAULT_TEAM_SIDEBAR_PREFS.sortBy,
    sortOrder: stored?.sortOrder ?? DEFAULT_TEAM_SIDEBAR_PREFS.sortOrder,
  };
}

export function useTeamSidebarPrefs() {
  const [prefs, setPrefs] = useState<TeamSidebarPrefs>(() =>
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
    (updater: (current: TeamSidebarPrefs) => TeamSidebarPrefs) => {
      setPrefs((current) => updater(current));
    },
    []
  );

  return {
    prefs,
    updatePrefs,
  };
}
