import { useCallback, useSyncExternalStore } from "react";

export type ArticleReadingStyle = "normal" | "large" | "tone";

const STORAGE_KEY = "engenty.kb.article_reading_style";
const CHANGE_EVENT = "engenty-kb-article-reading-style";

function isArticleReadingStyle(v: string | null): v is ArticleReadingStyle {
  return v === "normal" || v === "large" || v === "tone";
}

function readStyle(): ArticleReadingStyle {
  if (typeof window === "undefined") {
    return "normal";
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isArticleReadingStyle(raw) ? raw : "normal";
  } catch {
    return "normal";
  }
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      onStoreChange();
    }
  };
  const onLocal = () => onStoreChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onLocal);
  };
}

/**
 * Persists KB article detail reading surface (normal / large / tone) in localStorage.
 */
export function useArticleReadingStyle(): {
  readingStyle: ArticleReadingStyle;
  setReadingStyle: (next: ArticleReadingStyle) => void;
} {
  const readingStyle = useSyncExternalStore(
    subscribe,
    readStyle,
    () => "normal" as const
  );

  const setReadingStyle = useCallback((next: ArticleReadingStyle) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { readingStyle, setReadingStyle };
}
