import { useCoreAuthSession } from "@engenty/auth-ui";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parsKbSidebarCategoryExpansionPrefs } from "../../../../src/schema/kb-sidebar-article-tree.js";
import type { CategoryTreeExpansionState } from "../category-tree/category-tree-expansion.js";
import { kbSidebarCategoryExpansionStorageKey } from "./tree-prefs.js";

function readExpansionState(key: string): CategoryTreeExpansionState {
  if (typeof window === "undefined") {
    return { collapsed: new Set(), expanded: new Set() };
  }
  const prefs = parsKbSidebarCategoryExpansionPrefs(
    window.localStorage.getItem(key)
  );
  return {
    collapsed: new Set(prefs.collapsed),
    expanded: new Set(prefs.expanded),
  };
}

function writeExpansionState(
  key: string,
  state: CategoryTreeExpansionState
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        collapsed: Array.from(state.collapsed).sort(),
        expanded: Array.from(state.expanded).sort(),
      })
    );
  } catch {
    // Quota exceeded or private mode — silently degrade.
  }
}

/**
 * Persists category tree expansion state to localStorage, scoped per
 * tenant, user, and KB so different users/KBs never share state.
 */
export function useKbSidebarCategoryExpansion(kbId: string) {
  const { session } = useCoreAuthSession();
  const { currentTenant } = useWorkspaceContext();
  const userId = session?.user?.id ?? null;
  const tenantId = currentTenant?.id ?? null;

  const storageKey = useMemo(
    () => kbSidebarCategoryExpansionStorageKey(tenantId, userId, kbId),
    [tenantId, userId, kbId]
  );

  // Ref so the setter closure never goes stale when the key changes after auth
  // loads (useCoreAuthSession initialises with null then resolves async).
  const storageKeyRef = useRef(storageKey);
  useEffect(() => {
    storageKeyRef.current = storageKey;
  });

  const [expansionState, setExpansionStateRaw] =
    useState<CategoryTreeExpansionState>(() => readExpansionState(storageKey));

  // Re-read when tenant/user/KB context changes.
  useEffect(() => {
    setExpansionStateRaw(readExpansionState(storageKey));
  }, [storageKey]);

  // Stable setter — always writes to the current key via the ref, so callers
  // that capture this function without listing it as a dep (like toggleCategory)
  // still write to the correct localStorage key after auth resolves.
  const setExpansionState = useCallback(
    (
      next:
        | CategoryTreeExpansionState
        | ((prev: CategoryTreeExpansionState) => CategoryTreeExpansionState)
    ) => {
      setExpansionStateRaw((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        writeExpansionState(storageKeyRef.current, resolved);
        return resolved;
      });
    },
    [] // stable — reads key via ref, not closure
  );

  return { expansionState, setExpansionState };
}
