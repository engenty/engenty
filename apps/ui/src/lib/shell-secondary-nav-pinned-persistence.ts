import {
  createDefaultShellSecondaryNavPinnedSnapshot,
  mergeShellSecondaryNavPinnedSnapshot,
  parseShellSecondaryNavPinnedSnapshot,
  SHELL_SECONDARY_NAV_PINNED_USER_SETTING_NAME,
  type ShellSecondaryNavPinnedSnapshotV1,
} from "@engenty/app-shell";
import { queryOptions, useQuery, useQueryClient } from "@engenty/query-client";
import { useCallback, useMemo, useRef } from "react";
import { getUserSetting, setUserSetting } from "@/lib/api/client";

/** User-settings `shell.secondary_nav.pinned`: global module secondary column pinned open/closed. */

export const shellSecondaryNavPinnedQueryKey = [
  "user-settings",
  SHELL_SECONDARY_NAV_PINNED_USER_SETTING_NAME,
] as const;

export const shellSecondaryNavPinnedQueryOptions = queryOptions({
  queryKey: shellSecondaryNavPinnedQueryKey,
  queryFn: async ({
    signal,
  }): Promise<ShellSecondaryNavPinnedSnapshotV1 | null> => {
    const res = await getUserSetting(
      SHELL_SECONDARY_NAV_PINNED_USER_SETTING_NAME,
      signal
    );
    if (!res || "error" in res) {
      return null;
    }
    if (
      res.type === "json" &&
      res.value != null &&
      typeof res.value === "object"
    ) {
      return parseShellSecondaryNavPinnedSnapshot(res.value);
    }
    return null;
  },
});

export interface UseShellSecondaryNavPinnedPersistenceOptions {
  enabled: boolean;
}

export function useShellSecondaryNavPinnedPersistence(
  options: UseShellSecondaryNavPinnedPersistenceOptions
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...shellSecondaryNavPinnedQueryOptions,
    enabled: options.enabled,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mergePinned = useCallback(
    (patch: Partial<ShellSecondaryNavPinnedSnapshotV1>) => {
      if (!options.enabled) {
        return;
      }
      let nextSnapshot: ShellSecondaryNavPinnedSnapshotV1 | null = null;
      queryClient.setQueryData(
        shellSecondaryNavPinnedQueryKey,
        (prev: ShellSecondaryNavPinnedSnapshotV1 | null | undefined) => {
          const base =
            prev && prev.v === 1
              ? prev
              : createDefaultShellSecondaryNavPinnedSnapshot();
          nextSnapshot = mergeShellSecondaryNavPinnedSnapshot(base, patch);
          return nextSnapshot;
        }
      );
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const latest =
          queryClient.getQueryData<ShellSecondaryNavPinnedSnapshotV1 | null>(
            shellSecondaryNavPinnedQueryKey
          );
        const body = latest ?? createDefaultShellSecondaryNavPinnedSnapshot();
        void setUserSetting(SHELL_SECONDARY_NAV_PINNED_USER_SETTING_NAME, {
          type: "json",
          value_jsonb: body,
        });
      }, 300);
    },
    [options.enabled, queryClient]
  );

  const pinnedHydrated = !options.enabled || query.isFetched;
  const snapshot = query.data ?? null;

  return useMemo(
    () => ({
      snapshot,
      pinnedHydrated,
      mergePinned,
    }),
    [snapshot, pinnedHydrated, mergePinned]
  );
}
