import { queryOptions, useQuery, useQueryClient } from "@engenty/query-client";
import {
  artifactPinsForSpace,
  emptySpacesArtifactPinsDocument,
  isSpaceArtifactPinned,
  parseSpacesArtifactPinsDocument,
  pinSpaceArtifact,
  pruneSpaceArtifactPins,
  SPACES_ARTIFACT_PINS_SETTING_KEY,
  type SpacesArtifactPinsDocument,
  unpinSpaceArtifact,
} from "@engenty/user-settings";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { getUserSetting, setUserSetting } from "@/lib/api/client";

/**
 * Per-user pins of space artifacts onto the Work sidebar and dashboard
 * (`shell.spaces.artifact_pins.v1`).
 *
 * Follows `spaces-recent-persistence`: optimistic write into the query cache,
 * debounced PATCH.
 */
const spaceArtifactPinsQueryKey = [
  "user-settings",
  SPACES_ARTIFACT_PINS_SETTING_KEY,
] as const;

const spaceArtifactPinsQueryOptions = queryOptions({
  queryFn: async ({ signal }): Promise<SpacesArtifactPinsDocument | null> => {
    const res = await getUserSetting(SPACES_ARTIFACT_PINS_SETTING_KEY, signal);
    if (!res || "error" in res) {
      return null;
    }
    if (res.type === "json" && res.value != null) {
      return parseSpacesArtifactPinsDocument(res.value);
    }
    return null;
  },
  queryKey: spaceArtifactPinsQueryKey,
});

function persist(doc: SpacesArtifactPinsDocument) {
  return setUserSetting(SPACES_ARTIFACT_PINS_SETTING_KEY, {
    type: "json",
    value_jsonb: doc,
  });
}

export function useSpaceArtifactPins(
  spaceId: string | null,
  /**
   * When this space's artifact ids are known, drop pins that no longer exist.
   * Omit while the list is still loading so an empty pending fetch cannot
   * wipe the document.
   */
  knownIds?: readonly string[]
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...spaceArtifactPinsQueryOptions,
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

  const persistSoon = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const latest =
        queryClient.getQueryData<SpacesArtifactPinsDocument | null>(
          spaceArtifactPinsQueryKey
        ) ?? emptySpacesArtifactPinsDocument();
      void persist(latest);
    }, 500);
  }, [queryClient]);

  const write = useCallback(
    (
      mutate: (doc: SpacesArtifactPinsDocument) => SpacesArtifactPinsDocument
    ) => {
      if (!spaceId) {
        return;
      }
      let changed = false;
      queryClient.setQueryData(
        spaceArtifactPinsQueryKey,
        (prev: SpacesArtifactPinsDocument | null | undefined) => {
          const base = prev ?? emptySpacesArtifactPinsDocument();
          const next = mutate(base);
          changed = next !== base;
          return next;
        }
      );
      if (changed) {
        persistSoon();
      }
    },
    [persistSoon, queryClient, spaceId]
  );

  const knownKey = knownIds?.join("\0");
  const knownIdsRef = useRef(knownIds);
  knownIdsRef.current = knownIds;
  useEffect(() => {
    const ids = knownIdsRef.current;
    if (!spaceId || ids === undefined || query.isPending) {
      return;
    }
    write((doc) => pruneSpaceArtifactPins(doc, spaceId, ids));
  }, [knownKey, query.isPending, spaceId, write]);

  const doc = query.data ?? emptySpacesArtifactPinsDocument();
  const pinned = useMemo(
    () => (spaceId ? artifactPinsForSpace(doc, spaceId) : []),
    [doc, spaceId]
  );

  const isPinned = useCallback(
    (artifactId: string) =>
      Boolean(spaceId && isSpaceArtifactPinned(doc, spaceId, artifactId)),
    [doc, spaceId]
  );

  const toggle = useCallback(
    (artifactId: string) => {
      if (!spaceId) {
        return;
      }
      write((current) =>
        isSpaceArtifactPinned(current, spaceId, artifactId)
          ? unpinSpaceArtifact(current, spaceId, artifactId)
          : pinSpaceArtifact(current, spaceId, artifactId)
      );
    },
    [spaceId, write]
  );

  return { isPinned, pinned, toggle };
}
