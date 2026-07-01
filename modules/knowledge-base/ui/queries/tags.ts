/**
 * Knowledge Base — TanStack Query options.
 */

import { queryOptions } from "@engenty/query-client";
import { listTags } from "../api.js";

/* ── Tags ── */

export function tagsQueryOptions(kbId: string) {
  return queryOptions({
    queryKey: ["kb", "tags", kbId],
    queryFn: ({ signal }) => listTags(kbId, signal),
    enabled: !!kbId,
    staleTime: 60_000,
  });
}
