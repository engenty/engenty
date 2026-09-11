import { canonicalModulePathname } from "@engenty/ai-core/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  isKbSidebarArticleRoute,
  isKbSidebarFaqRoute,
  isKbSidebarFavoritesRoute,
  isKbSidebarSourcesRoute,
} from "./kb-sidebar-paths.js";

export type KbSidebarTab = "articles" | "faqs" | "sources" | "favorites";

const DEFAULT_TAB: KbSidebarTab = "articles";

function storageKey(kbId: string): string {
  return `engenty.kb-sidebar-tab.${kbId}`;
}

function loadStoredTab(kbId: string): KbSidebarTab | null {
  if (typeof window === "undefined" || !kbId) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(storageKey(kbId));
    return raw === "faqs" ||
      raw === "articles" ||
      raw === "sources" ||
      raw === "favorites"
      ? raw
      : null;
  } catch {
    return null;
  }
}

function saveStoredTab(kbId: string, tab: KbSidebarTab): void {
  if (typeof window === "undefined" || !kbId) {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(kbId), tab);
  } catch {
    // quota exceeded or private mode
  }
}

export function useKbSidebarTab(kbId: string) {
  // Canonical, not raw: in a space this is `/s/<key>/kb/…`, and
  // every matcher below is written against `/mdl/knowledge-base/…`.
  const pathname = canonicalModulePathname(useLocation().pathname);
  const [tab, setTabState] = useState<KbSidebarTab>(
    () => loadStoredTab(kbId) ?? DEFAULT_TAB
  );
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isKbSidebarFaqRoute(pathname)) {
      setTabState("faqs");
    } else if (isKbSidebarSourcesRoute(pathname)) {
      setTabState("sources");
    } else if (isKbSidebarFavoritesRoute(pathname)) {
      setTabState("favorites");
    } else if (isKbSidebarArticleRoute(pathname)) {
      setTabState("articles");
    }
  }, [kbId, pathname]);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    saveStoredTab(kbId, tab);
  }, [kbId, tab]);

  const setTab = useCallback((next: KbSidebarTab) => {
    setTabState(next);
  }, []);

  return { tab, setTab };
}
