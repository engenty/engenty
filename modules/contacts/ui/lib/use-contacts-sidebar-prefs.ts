import { useCallback, useEffect, useRef, useState } from "react";
import type { ContactType } from "../../src/schema/index.js";

const STORAGE_KEY = "engenty.contacts-sidebar-prefs";

/** What the sidebar's contact list shows — a per-browser preference. */
export interface ContactsSidebarPrefs {
  role: string | "all";
  sortBy: "display_name" | "created_at";
  sortOrder: "asc" | "desc";
  type: ContactType | "all";
}

const DEFAULT_PREFS: ContactsSidebarPrefs = {
  role: "all",
  sortBy: "created_at",
  sortOrder: "desc",
  type: "all",
};

function loadStoredPrefs(): Partial<ContactsSidebarPrefs> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<ContactsSidebarPrefs>) : null;
  } catch {
    return null;
  }
}

export function useContactsSidebarPrefs() {
  const [prefs, setPrefs] = useState<ContactsSidebarPrefs>(() => ({
    ...DEFAULT_PREFS,
    ...loadStoredPrefs(),
  }));
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // quota exceeded or private mode
    }
  }, [prefs]);

  const updatePrefs = useCallback(
    (updater: (current: ContactsSidebarPrefs) => ContactsSidebarPrefs) => {
      setPrefs((current) => updater(current));
    },
    []
  );

  /** Filters narrow the list; sorting alone does not count. */
  const filtered = prefs.role !== "all" || prefs.type !== "all";

  return { filtered, prefs, updatePrefs };
}
