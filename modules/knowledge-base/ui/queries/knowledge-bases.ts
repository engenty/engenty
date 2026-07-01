/**
 * Knowledge Base — TanStack Query options.
 */

import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import type { KbPageLayoutSettings } from "../../src/schema/page-blocks.js";
import type { KnowledgeBase } from "../../src/schema/types.js";
import { getKb, listKbs, updateKb } from "../api.js";

/* ── Knowledge Bases ── */

export const kbsQueryOptions = queryOptions({
  queryKey: ["kb", "knowledge-bases"],
  queryFn: ({ signal }) => listKbs(signal),
  staleTime: 30_000,
});

export function kbDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["kb", "knowledge-bases", id],
    queryFn: ({ signal }) => getKb(id, signal),
    enabled: !!id,
    staleTime: 30_000,
  });
}

function findKbIndexInList(list: KnowledgeBase[], kbId: string): number {
  const idx = list.findIndex((k) => k.id === kbId);
  if (idx !== -1) {
    return idx;
  }
  return list.findIndex((k) => String(k.id) === String(kbId));
}

/** Merge a KB returned from `PUT /api/kb/knowledge-bases/:id` into list + detail caches for instant hub UI. */
export function applyKnowledgeBaseToKbQueries(
  queryClient: QueryClient,
  kb: KnowledgeBase
): void {
  queryClient.setQueryData<KnowledgeBase[]>(kbsQueryOptions.queryKey, (old) => {
    if (!Array.isArray(old)) {
      return old;
    }
    const idx = findKbIndexInList(old, kb.id);
    if (idx === -1) {
      return old;
    }
    const prev = old[idx];
    const next = [...old];
    next[idx] = { ...prev, ...kb };
    return next;
  });
  queryClient.setQueryData(kbDetailQueryOptions(kb.id).queryKey, (old) =>
    old ? { ...old, ...kb } : kb
  );
}

export function useUpdateKbPageLayoutMutation(kbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layout: KbPageLayoutSettings) =>
      updateKb(kbId, { page_layout: layout }),
    onSuccess: (kb) => applyKnowledgeBaseToKbQueries(queryClient, kb),
  });
}
