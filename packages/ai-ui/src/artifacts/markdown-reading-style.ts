/**
 * Shared markdown-page reading surface (normal / large / reader).
 *
 * Persisted in localStorage so Space Artifacts and the chat artifact pane
 * share one preference. Independent of the knowledge-base module.
 */

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";

export type MarkdownReadingStyle = "normal" | "large" | "tone";

const STORAGE_KEY = "engenty.markdown.reading_style";
const CHANGE_EVENT = "engenty-markdown-reading-style";
const READER_SURFACE_ATTR = "data-reader-surface";
const READER_SURFACE_VALUE = "paper";

export function isMarkdownReadingStyle(
  value: string | null
): value is MarkdownReadingStyle {
  return value === "normal" || value === "large" || value === "tone";
}

export function markdownReadingWrapClassName(
  style: MarkdownReadingStyle
): string {
  if (style === "large") {
    return "markdown-document-reading-large";
  }
  if (style === "tone") {
    return "markdown-document-reading-tone";
  }
  return "";
}

/** Large type gets a wider column so the line length stays readable. */
export function markdownDocumentColumnClassName(
  style: MarkdownReadingStyle
): string {
  return style === "large" ? "max-w-5xl" : "max-w-3xl";
}

/**
 * Paints the app shell the same cream paper Knowledge Base uses in Reader.
 * Pair with `html[data-reader-surface="paper"]` CSS in design-tokens.
 */
export function useMarkdownReaderPaperSurface(enabled: boolean): void {
  useLayoutEffect(() => {
    if (!enabled || typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    root.setAttribute(READER_SURFACE_ATTR, READER_SURFACE_VALUE);
    return () => {
      if (root.getAttribute(READER_SURFACE_ATTR) === READER_SURFACE_VALUE) {
        root.removeAttribute(READER_SURFACE_ATTR);
      }
    };
  }, [enabled]);
}

function readStyle(): MarkdownReadingStyle {
  if (typeof window === "undefined") {
    return "normal";
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isMarkdownReadingStyle(raw) ? raw : "normal";
  } catch {
    return "normal";
  }
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      onStoreChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

export function useMarkdownReadingStyle(): {
  readingStyle: MarkdownReadingStyle;
  setReadingStyle: (next: MarkdownReadingStyle) => void;
} {
  const readingStyle = useSyncExternalStore(
    subscribe,
    readStyle,
    () => "normal" as const
  );

  const setReadingStyle = useCallback((next: MarkdownReadingStyle) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { readingStyle, setReadingStyle };
}
