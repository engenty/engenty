/**
 * Knowledge Base — TanStack Query options.
 */

import { type QueryClient, queryOptions } from "@engenty/query-client";
import { getKbGraph } from "../api.js";

/* ── Graph ── */

/** Query key prefix for all KB graph payloads (`GET /api/kb/graph`). */
export const kbGraphQueryRootKey = ["kb", "graph"] as const;

export function kbGraphQueryKey(kbId: string) {
  return [...kbGraphQueryRootKey, kbId] as const;
}

/**
 * Invalidate cached graph data after articles change (parent, slug, tags, moves, deletes).
 * When `kbId` is set, only that KB’s graph refetches; otherwise every cached graph query refetches.
 */
export function invalidateKbGraphQueries(
  queryClient: QueryClient,
  kbId?: string | null
) {
  if (kbId) {
    return queryClient.invalidateQueries({ queryKey: kbGraphQueryKey(kbId) });
  }
  return queryClient.invalidateQueries({ queryKey: [...kbGraphQueryRootKey] });
}

export function kbGraphQueryOptions(kbId: string) {
  return queryOptions({
    queryKey: kbGraphQueryKey(kbId),
    queryFn: ({ signal }) => getKbGraph(kbId, signal),
    enabled: !!kbId,
    staleTime: 60_000,
  });
}
