import {
  createDefaultShellAppBarPositionSnapshot,
  mergeShellAppBarPositionSnapshot,
  parseShellAppBarPositionSnapshot,
  readAppBarPositionFromStorage,
  SHELL_APP_BAR_POSITION_CHANGE_EVENT,
  SHELL_APP_BAR_POSITION_USER_SETTING_NAME,
  type ShellAppBarPositionSnapshotV1,
  writeAppBarPositionToStorage,
} from "@engenty/app-shell";
import { queryOptions, useQuery, useQueryClient } from "@engenty/query-client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { getUserSetting, setUserSetting } from "@/lib/api/client";

/** User-settings `shell.app_bar.position`: desktop app-bar edge. */

export const shellAppBarPositionQueryKey = [
  "user-settings",
  SHELL_APP_BAR_POSITION_USER_SETTING_NAME,
] as const;

export const shellAppBarPositionQueryOptions = queryOptions({
  queryKey: shellAppBarPositionQueryKey,
  queryFn: async ({
    signal,
  }): Promise<ShellAppBarPositionSnapshotV1 | null> => {
    const res = await getUserSetting(
      SHELL_APP_BAR_POSITION_USER_SETTING_NAME,
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
      return parseShellAppBarPositionSnapshot(res.value);
    }
    return null;
  },
});

export interface UseShellAppBarPositionPersistenceOptions {
  enabled: boolean;
}

export function useShellAppBarPositionPersistence(
  options: UseShellAppBarPositionPersistenceOptions
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...shellAppBarPositionQueryOptions,
    enabled: options.enabled,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedOnceRef = useRef(false);
  const localWriteRef = useRef(false);

  useEffect(() => {
    if (!(options.enabled && query.isFetched)) {
      return;
    }
    if (hydratedOnceRef.current) {
      return;
    }
    hydratedOnceRef.current = true;
    if (localWriteRef.current) {
      return;
    }
    if (query.data?.position) {
      writeAppBarPositionToStorage(query.data.position);
    }
  }, [options.enabled, query.data, query.isFetched]);

  useEffect(() => {
    const syncCache = () => {
      const stored = readAppBarPositionFromStorage();
      if (!stored) {
        return;
      }
      queryClient.setQueryData(shellAppBarPositionQueryKey, {
        position: stored,
        v: 1 as const,
      });
    };
    window.addEventListener(SHELL_APP_BAR_POSITION_CHANGE_EVENT, syncCache);
    return () => {
      window.removeEventListener(
        SHELL_APP_BAR_POSITION_CHANGE_EVENT,
        syncCache
      );
    };
  }, [queryClient]);

  const mergePosition = useCallback(
    (patch: Partial<ShellAppBarPositionSnapshotV1>) => {
      if (!options.enabled) {
        return;
      }
      const prev =
        queryClient.getQueryData<ShellAppBarPositionSnapshotV1 | null>(
          shellAppBarPositionQueryKey
        );
      const base =
        prev && prev.v === 1
          ? prev
          : createDefaultShellAppBarPositionSnapshot();
      const nextSnapshot = mergeShellAppBarPositionSnapshot(base, patch);
      queryClient.setQueryData(shellAppBarPositionQueryKey, nextSnapshot);
      localWriteRef.current = true;
      writeAppBarPositionToStorage(nextSnapshot.position);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const latest =
          queryClient.getQueryData<ShellAppBarPositionSnapshotV1 | null>(
            shellAppBarPositionQueryKey
          );
        const body = latest ?? createDefaultShellAppBarPositionSnapshot();
        void setUserSetting(SHELL_APP_BAR_POSITION_USER_SETTING_NAME, {
          type: "json",
          value_jsonb: body,
        })
          .then(() => {
            queryClient.setQueryData(shellAppBarPositionQueryKey, body);
          })
          .catch(() => {
            void queryClient.invalidateQueries({
              exact: true,
              queryKey: shellAppBarPositionQueryKey,
            });
            toast.error("Could not save the app bar position.");
          });
      }, 300);
    },
    [options.enabled, queryClient]
  );

  const positionHydrated = !options.enabled || query.isFetched;
  const snapshot = query.data ?? null;

  return useMemo(
    () => ({
      snapshot,
      positionHydrated,
      mergePosition,
    }),
    [snapshot, positionHydrated, mergePosition]
  );
}
