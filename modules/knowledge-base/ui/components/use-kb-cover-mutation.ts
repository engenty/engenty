import { useMutation, useQueryClient } from "@engenty/query-client";
import type { KbCover, KnowledgeBase } from "../../src/schema/types.js";
import { updateKb } from "../api.js";
import {
  applyKnowledgeBaseToKbQueries,
  KB_LIST_KEY_PREFIX,
  kbDetailQueryOptions,
} from "../queries.js";

export function useKbCoverMutation(
  kb: KnowledgeBase,
  options: {
    onCoverMutationError?: (cover: KbCover | null) => void;
    onOptimisticCoverChange?: (cover: KbCover | null) => void;
  } = {}
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cover: KbCover | null) => updateKb(kb.id, { cover }),
    onMutate: async (nextCover) => {
      options.onOptimisticCoverChange?.(nextCover);
      const detailKey = kbDetailQueryOptions(kb.id).queryKey;
      await queryClient.cancelQueries({ queryKey: KB_LIST_KEY_PREFIX });
      await queryClient.cancelQueries({ queryKey: detailKey });
      // Snapshot every live list scope (space-scoped + tenant-wide admin).
      const previousLists = queryClient.getQueriesData<KnowledgeBase[]>({
        queryKey: KB_LIST_KEY_PREFIX,
      });

      const previousDetail = queryClient.getQueryData<KnowledgeBase>(detailKey);
      const previousListRow = previousLists
        .flatMap(([, rows]) => rows ?? [])
        .find((row) => row.id === kb.id || String(row.id) === String(kb.id));
      const previousCover = previousDetail
        ? previousDetail.cover
        : previousListRow
          ? previousListRow.cover
          : kb.cover;
      queryClient.setQueriesData<KnowledgeBase[]>(
        { queryKey: KB_LIST_KEY_PREFIX },
        (old) => {
          if (!Array.isArray(old)) {
            return old;
          }
          return old.map((row) =>
            row.id === kb.id || String(row.id) === String(kb.id)
              ? { ...row, cover: nextCover }
              : row
          );
        }
      );
      queryClient.setQueryData<KnowledgeBase | undefined>(detailKey, (old) => {
        const base = old ?? kb;
        return { ...base, cover: nextCover };
      });
      return { previousCover, previousLists, previousDetail, detailKey };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousLists) {
        for (const [key, rows] of ctx.previousLists) {
          queryClient.setQueryData(key, rows);
        }
      }
      if (ctx?.previousDetail !== undefined && ctx.detailKey !== undefined) {
        queryClient.setQueryData(ctx.detailKey, ctx.previousDetail);
      }
      if (ctx) {
        options.onCoverMutationError?.(ctx.previousCover);
      }
    },
    onSuccess: (updatedKb, coverArg) => {
      /* Do not invalidate here: a refetch can briefly return pre-write list data and
       * overwrite the optimistic + PUT-applied cache (cover flashes then reverts). */
      const merged =
        updatedKb.cover === undefined
          ? { ...updatedKb, cover: coverArg }
          : updatedKb;
      applyKnowledgeBaseToKbQueries(queryClient, merged);
    },
  });
}
