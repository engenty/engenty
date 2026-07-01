import { useMutation, useQueryClient } from "@engenty/query-client";
import type { KbCover, KnowledgeBase } from "../../src/schema/types.js";
import { updateKb } from "../api.js";
import {
  applyKnowledgeBaseToKbQueries,
  kbDetailQueryOptions,
  kbsQueryOptions,
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
      await queryClient.cancelQueries({ queryKey: kbsQueryOptions.queryKey });
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previousList = queryClient.getQueryData<KnowledgeBase[]>(
        kbsQueryOptions.queryKey
      );
      const previousDetail = queryClient.getQueryData<KnowledgeBase>(detailKey);
      const previousListRow = previousList?.find(
        (row) => row.id === kb.id || String(row.id) === String(kb.id)
      );
      const previousCover = previousDetail
        ? previousDetail.cover
        : previousListRow
          ? previousListRow.cover
          : kb.cover;
      queryClient.setQueryData<KnowledgeBase[]>(
        kbsQueryOptions.queryKey,
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
      return { previousCover, previousList, previousDetail, detailKey };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousList !== undefined) {
        queryClient.setQueryData(kbsQueryOptions.queryKey, ctx.previousList);
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
