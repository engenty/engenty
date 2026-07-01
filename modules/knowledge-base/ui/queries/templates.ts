/**
 * Knowledge Base — TanStack Query options.
 */

import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import {
  createKbTemplate,
  deleteKbTemplate,
  getKbTemplate,
  listKbTemplates,
  updateKbTemplate,
} from "../api.js";

import { kbArticleKeys, kbCategoryKeys, kbTemplateKeys } from "./keys.js";

/* ── Templates ── */

export function kbTemplatesQueryOptions(kbId: string) {
  return queryOptions({
    queryKey: kbTemplateKeys.list(kbId),
    queryFn: ({ signal }) => listKbTemplates(kbId, signal),
    enabled: !!kbId,
    staleTime: 30_000,
  });
}

export function kbTemplateDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: kbTemplateKeys.detail(id),
    queryFn: ({ signal }) => getKbTemplate(id, signal),
    enabled: !!id && id !== "new",
    staleTime: 30_000,
  });
}

export function useKbTemplateMutations(kbId: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: kbTemplateKeys.list(kbId),
    });
    await queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
    await queryClient.invalidateQueries({ queryKey: kbCategoryKeys.all });
  };
  return {
    create: useMutation({
      mutationFn: createKbTemplate,
      onSuccess: invalidate,
    }),
    delete: useMutation({
      mutationFn: deleteKbTemplate,
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: string;
        input: Parameters<typeof updateKbTemplate>[1];
      }) => updateKbTemplate(id, input),
      onSuccess: async (data) => {
        await invalidate();
        await queryClient.invalidateQueries({
          queryKey: kbTemplateKeys.detail(data.id),
        });
      },
    }),
  };
}
