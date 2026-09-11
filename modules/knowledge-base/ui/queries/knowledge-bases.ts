/**
 * Knowledge Base — TanStack Query options.
 */

import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import type { KbPageLayoutSettings } from "../../src/schema/page-blocks.js";
import type { KnowledgeBase } from "../../src/schema/types.js";
import { getKb, listKbs, updateKb } from "../api.js";

/* ── Knowledge Bases ── */

/**
 * Key prefix shared by every KB LIST cache (one per space scope). Distinct
 * from the detail keys (`["kb", "knowledge-bases", <id>]`) so a space id can
 * never collide with a KB id.
 */
export const KB_LIST_KEY_PREFIX = ["kb", "knowledge-bases", "list"] as const;

/**
 * One list per scope: a space id narrows to that space's libraries, null is
 * the tenant-wide list (cross-space admin surfaces only).
 */
export function kbsQueryOptions(spaceId?: string | null) {
  return queryOptions({
    queryKey: [...KB_LIST_KEY_PREFIX, spaceId ?? "all"],
    queryFn: ({ signal }) => listKbs(spaceId ?? undefined, signal),
    staleTime: 30_000,
  });
}

/**
 * The KB list a page should see: the CURRENT space's libraries. A knowledge
 * base belongs to exactly one space (Phase 6b), so a page rendered inside a
 * space must not offer another space's libraries. Cross-space admin surfaces
 * opt out with `useQuery(kbsQueryOptions(null))`.
 */
export function useKbsQuery() {
  const { currentSpace } = useWorkspaceContext();
  return useQuery(kbsQueryOptions(currentSpace?.id ?? null));
}

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
  // Every scope's list cache that holds this KB — the space-scoped one and
  // the tenant-wide admin one may both be live.
  queryClient.setQueriesData<KnowledgeBase[]>(
    { queryKey: KB_LIST_KEY_PREFIX },
    (old) => {
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
    }
  );
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
