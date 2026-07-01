import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { isKbHubChatRoute } from "../kb-paths.js";
import {
  isKbSidebarArticleRoute,
  isKbSidebarFaqRoute,
  isKbSidebarFavoritesRoute,
} from "./kb-sidebar-paths.js";

export type KbSidebarTab = "articles" | "faqs" | "favorites" | "chat";

const DEFAULT_TAB: KbSidebarTab = "articles";

function storageKey(kbSlug: string): string {
  return `engenty.kb-sidebar-tab.${kbSlug}`;
}

function loadStoredTab(kbSlug: string): KbSidebarTab | null {
  if (typeof window === "undefined" || !kbSlug) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(storageKey(kbSlug));
    return raw === "faqs" ||
      raw === "articles" ||
      raw === "favorites" ||
      raw === "chat"
      ? raw
      : null;
  } catch {
    return null;
  }
}

function saveStoredTab(kbSlug: string, tab: KbSidebarTab): void {
  if (typeof window === "undefined" || !kbSlug) {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(kbSlug), tab);
  } catch {
    // quota exceeded or private mode
  }
}

export function useKbSidebarTab(kbSlug: string) {
  const { pathname } = useLocation();
  const [tab, setTabState] = useState<KbSidebarTab>(
    () => loadStoredTab(kbSlug) ?? DEFAULT_TAB
  );
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isKbSidebarFaqRoute(pathname, kbSlug)) {
      setTabState("faqs");
    } else if (isKbSidebarFavoritesRoute(pathname, kbSlug)) {
      setTabState("favorites");
    } else if (isKbSidebarArticleRoute(pathname, kbSlug)) {
      setTabState("articles");
    } else if (isKbHubChatRoute(pathname)) {
      setTabState("chat");
    }
  }, [kbSlug, pathname]);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    saveStoredTab(kbSlug, tab);
  }, [kbSlug, tab]);

  const setTab = useCallback((next: KbSidebarTab) => {
    setTabState(next);
  }, []);

  return { tab, setTab };
}
