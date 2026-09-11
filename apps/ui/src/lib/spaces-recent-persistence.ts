import { queryOptions, useQuery, useQueryClient } from "@engenty/query-client";
import {
  emptySpacesRecentDocument,
  parseSpacesRecentDocument,
  SPACES_RECENT_SETTING_KEY,
  type SpacesRecentDocument,
  spacesRecentOrder,
  touchSpaceRecency,
} from "@engenty/user-settings";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { getUserSetting, setUserSetting } from "@/lib/api/client";

/**
 * Per-user space recency (`shell.spaces.recent.v1`), the input to the rail's
 * budget rule (PLAN-spaces.md Phase 5a ②).
 *
 * Follows the secondary-nav persistence shape: optimistic write into the query
 * cache, debounced PATCH. The rail calls `visit` only when a hidden space is
 * promoted; switching among visible spaces deliberately leaves their order
 * untouched. The debounce still collapses quick successive promotions.
 */
const spacesRecentQueryKey = [
  "user-settings",
  SPACES_RECENT_SETTING_KEY,
] as const;

const spacesRecentQueryOptions = queryOptions({
  queryFn: async ({ signal }): Promise<SpacesRecentDocument | null> => {
    const res = await getUserSetting(SPACES_RECENT_SETTING_KEY, signal);
    if (!res || "error" in res) {
      return null;
    }
    if (res.type === "json" && res.value != null) {
      return parseSpacesRecentDocument(res.value);
    }
    return null;
  },
  queryKey: spacesRecentQueryKey,
});

export function useSpacesRecent(options: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...spacesRecentQueryOptions,
    enabled: options.enabled,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    []
  );

  const visit = useCallback(
    (spaceId: string | null | undefined) => {
      if (!(options.enabled && spaceId)) {
        return;
      }
      queryClient.setQueryData(
        spacesRecentQueryKey,
        (prev: SpacesRecentDocument | null | undefined) =>
          touchSpaceRecency(prev ?? emptySpacesRecentDocument(), spaceId)
      );
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const latest = queryClient.getQueryData<SpacesRecentDocument | null>(
          spacesRecentQueryKey
        );
        void setUserSetting(SPACES_RECENT_SETTING_KEY, {
          type: "json",
          value_jsonb: latest ?? emptySpacesRecentDocument(),
        });
      }, 500);
    },
    [options.enabled, queryClient]
  );

  const recent = useMemo(
    () => (query.data ? spacesRecentOrder(query.data) : []),
    [query.data]
  );

  return { recent, visit };
}
