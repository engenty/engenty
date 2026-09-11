import { queryOptions, useQuery, useQueryClient } from "@engenty/query-client";
import {
  emptySpaceDataLibraryDocument,
  parseSpaceDataLibraryDocument,
  SPACE_DATA_LIBRARY_SETTING_KEY,
  type SpaceDataLibraryDocument,
  type SpaceDataLibraryItemInput,
  spaceDataRecentForSpace,
  touchSpaceDataRecent,
} from "@engenty/user-settings";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { getUserSetting, setUserSetting } from "@/lib/api/client";

/**
 * Per-user recently opened Data items (`spaces.data.library.v1`).
 *
 * Follows `spaces-recent-persistence`: optimistic write into the query cache,
 * debounced PATCH for recency (clicking through a tree must not be N round
 * trips).
 */
const spaceDataLibraryQueryKey = [
  "user-settings",
  SPACE_DATA_LIBRARY_SETTING_KEY,
] as const;

const spaceDataLibraryQueryOptions = queryOptions({
  queryFn: async ({ signal }): Promise<SpaceDataLibraryDocument | null> => {
    const res = await getUserSetting(SPACE_DATA_LIBRARY_SETTING_KEY, signal);
    if (!res || "error" in res) {
      return null;
    }
    if (res.type === "json" && res.value != null) {
      return parseSpaceDataLibraryDocument(res.value);
    }
    return null;
  },
  queryKey: spaceDataLibraryQueryKey,
});

function persist(doc: SpaceDataLibraryDocument) {
  return setUserSetting(SPACE_DATA_LIBRARY_SETTING_KEY, {
    type: "json",
    value_jsonb: doc,
  });
}

export function useSpaceDataLibrary(spaceId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...spaceDataLibraryQueryOptions,
    enabled: Boolean(spaceId),
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

  const doc = query.data ?? emptySpaceDataLibraryDocument();

  const writeCache = useCallback(
    (next: SpaceDataLibraryDocument) => {
      queryClient.setQueryData(spaceDataLibraryQueryKey, next);
      return next;
    },
    [queryClient]
  );

  const touchRecent = useCallback(
    (item: SpaceDataLibraryItemInput) => {
      if (!spaceId) {
        return;
      }
      writeCache(
        touchSpaceDataRecent(
          queryClient.getQueryData(spaceDataLibraryQueryKey) ?? doc,
          item
        )
      );
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const latest =
          queryClient.getQueryData<SpaceDataLibraryDocument | null>(
            spaceDataLibraryQueryKey
          ) ?? emptySpaceDataLibraryDocument();
        void persist(latest);
      }, 500);
    },
    [doc, queryClient, spaceId, writeCache]
  );

  const recent = useMemo(
    () => (spaceId ? spaceDataRecentForSpace(doc, spaceId) : []),
    [doc, spaceId]
  );

  return { recent, touchRecent };
}
