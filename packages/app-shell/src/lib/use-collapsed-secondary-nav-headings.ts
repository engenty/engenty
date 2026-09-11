import { useCallback, useState } from "react";

const STORAGE_KEY = "engenty.shell.secondary-nav.collapsed-headings";

function readCollapsed(): Record<string, boolean> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeCollapsed(next: Record<string, boolean>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — collapse state is a convenience, not load-bearing.
  }
}

/** Persist which secondary-nav category headings the user has collapsed. */
export function useCollapsedSecondaryNavHeadings() {
  const [collapsed, setCollapsed] =
    useState<Record<string, boolean>>(readCollapsed);

  const isCollapsed = useCallback(
    (heading: string) => collapsed[heading] === true,
    [collapsed]
  );

  const toggle = useCallback((heading: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [heading]: !prev[heading] };
      writeCollapsed(next);
      return next;
    });
  }, []);

  return { isCollapsed, toggle };
}
