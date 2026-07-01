import { useCoreAuthSession } from "@engenty/auth-ui";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clampSidebarMaxPerLevel,
  type KbSidebarArticleTreePrefs,
  mergeKbSidebarArticleTreeUserPrefs,
} from "../../../../src/schema/kb-sidebar-article-tree.js";

/** Per-user prefs in localStorage; tenant + auth user scope the key. */
export function kbSidebarNavStorageKey(
  tenantId: string | null,
  userId: string | null
): string {
  const t = tenantId ?? "default";
  const u = userId ?? "anonymous";
  return `engenty.kb.sidebarNav.${t}.${u}`;
}

/** Per-user, per-KB category expansion state; tenant + user + KB scope the key. */
export function kbSidebarCategoryExpansionStorageKey(
  tenantId: string | null,
  userId: string | null,
  kbId: string
): string {
  const t = tenantId ?? "default";
  const u = userId ?? "anonymous";
  return `engenty.kb.categoryExpansion.${t}.${u}.${kbId}`;
}

function parseStored(
  raw: string | null
): Partial<KbSidebarArticleTreePrefs> | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as Partial<KbSidebarArticleTreePrefs>;
  } catch {
    return null;
  }
}

function readPrefs(
  key: string,
  kbDefaults: KbSidebarArticleTreePrefs
): KbSidebarArticleTreePrefs {
  if (typeof window === "undefined") {
    return mergeKbSidebarArticleTreeUserPrefs(null, kbDefaults);
  }
  return mergeKbSidebarArticleTreeUserPrefs(
    parseStored(window.localStorage.getItem(key)),
    kbDefaults
  );
}

/**
 * Article sidebar display prefs: KB defaults from the server, overridden by
 * per-user values in `localStorage`.
 */
export function useKbSidebarArticleTreePrefs(
  kbDefaults: KbSidebarArticleTreePrefs
) {
  const { session } = useCoreAuthSession();
  const { currentTenant } = useWorkspaceContext();
  const userId = session?.user?.id ?? null;
  const tenantId = currentTenant?.id ?? null;
  const key = useMemo(
    () => kbSidebarNavStorageKey(tenantId, userId),
    [tenantId, userId]
  );

  const [prefs, setPrefsState] = useState<KbSidebarArticleTreePrefs>(() =>
    readPrefs(key, kbDefaults)
  );

  useEffect(() => {
    setPrefsState(readPrefs(key, kbDefaults));
  }, [key, kbDefaults]);

  const setPrefs = useCallback(
    (
      next:
        | KbSidebarArticleTreePrefs
        | ((prev: KbSidebarArticleTreePrefs) => KbSidebarArticleTreePrefs)
    ) => {
      setPrefsState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        const normalized: KbSidebarArticleTreePrefs = {
          ...resolved,
          maxPerLevel: clampSidebarMaxPerLevel(resolved.maxPerLevel),
        };
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(normalized));
        }
        return normalized;
      });
    },
    [key]
  );

  return { prefs, setPrefs, storageKey: key };
}
