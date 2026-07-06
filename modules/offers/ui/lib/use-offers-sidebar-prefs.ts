import { useCallback, useEffect, useRef, useState } from "react";
import type { OfferStatus } from "../api.js";

const STORAGE_KEY = "engenty.offers-sidebar-prefs";

export interface OffersSidebarPrefs {
  clientId: string | "all";
  groupBy: "none" | "client" | "status";
  sortBy: "title" | "offer_number" | "offer_date" | "created_at";
  sortOrder: "asc" | "desc";
  status: OfferStatus | "all";
}

const DEFAULT_OFFERS_SIDEBAR_PREFS: OffersSidebarPrefs = {
  clientId: "all",
  groupBy: "none",
  sortBy: "created_at",
  sortOrder: "desc",
  status: "all",
};

function loadStoredPrefs(): Partial<OffersSidebarPrefs> | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Partial<OffersSidebarPrefs>;
  } catch {
    return null;
  }
}

function saveStoredPrefs(prefs: OffersSidebarPrefs): void {
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
  stored: Partial<OffersSidebarPrefs> | null
): OffersSidebarPrefs {
  return {
    clientId: stored?.clientId ?? DEFAULT_OFFERS_SIDEBAR_PREFS.clientId,
    groupBy: stored?.groupBy ?? DEFAULT_OFFERS_SIDEBAR_PREFS.groupBy,
    sortBy: stored?.sortBy ?? DEFAULT_OFFERS_SIDEBAR_PREFS.sortBy,
    sortOrder: stored?.sortOrder ?? DEFAULT_OFFERS_SIDEBAR_PREFS.sortOrder,
    status: stored?.status ?? DEFAULT_OFFERS_SIDEBAR_PREFS.status,
  };
}

export function useOffersSidebarPrefs() {
  const [prefs, setPrefs] = useState<OffersSidebarPrefs>(() =>
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
    (updater: (current: OffersSidebarPrefs) => OffersSidebarPrefs) => {
      setPrefs((current) => updater(current));
    },
    []
  );

  return { prefs, updatePrefs };
}
