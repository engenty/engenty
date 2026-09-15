import { useQueryClient } from "@engenty/query-client";
import { useEffect, useMemo, useRef } from "react";
import { type ArtifactSummary, artifactsQueryRoot } from "./artifacts-api.js";

/**
 * Keep the active artifact drawable even when the pane's own lists do not
 * carry it (yet).
 *
 * A chat card's "Open" activates an id straight from the tool result. The
 * lists can lag behind that: the realtime invalidation has not landed, or the
 * artifact was written to the Space (an Engenty's default) while the pane
 * lists the thread — and a delegated colleague's artifact is linked to the
 * person's thread, not to the pair thread whose card was clicked. Activating
 * an id the list lacked drew the empty state ("No artifact") over a perfectly
 * good artifact (live 2026-09-15).
 *
 * The pinned summary comes from the Space library when it has it, else from
 * the detail fetch the pane already runs for the active id. The lists are
 * refetched once per unknown id so they catch up on their own.
 */
export function usePinnedActiveArtifact(params: {
  activeArtifactId: string | null;
  artifacts: ArtifactSummary[];
  /** `detailQuery.data?.artifact` — the active artifact as the server has it. */
  detail: ArtifactSummary | undefined;
  library: ArtifactSummary[];
}): ArtifactSummary[] {
  const { activeArtifactId, artifacts, detail, library } = params;
  const queryClient = useQueryClient();
  const missing =
    activeArtifactId !== null &&
    !artifacts.some((artifact) => artifact.id === activeArtifactId);
  const pinned = useMemo(() => {
    if (!missing) {
      return null;
    }
    return (
      library.find((artifact) => artifact.id === activeArtifactId) ??
      (detail?.id === activeArtifactId ? detail : null)
    );
  }, [activeArtifactId, detail, library, missing]);

  const refetchedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!(missing && activeArtifactId)) {
      return;
    }
    if (refetchedForRef.current === activeArtifactId) {
      return;
    }
    refetchedForRef.current = activeArtifactId;
    void queryClient.invalidateQueries({ queryKey: artifactsQueryRoot });
  }, [activeArtifactId, missing, queryClient]);

  return useMemo(
    () => (pinned ? [...artifacts, pinned] : artifacts),
    [artifacts, pinned]
  );
}
