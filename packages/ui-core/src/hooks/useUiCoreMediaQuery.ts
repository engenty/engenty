"use client";

import { useEffect, useState } from "react";

/** Subscribes to `window.matchMedia` for client-only responsive UI (e.g. breadcrumbs). */
export function useUiCoreMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) {
      return;
    }
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
