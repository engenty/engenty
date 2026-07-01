/**
 * Knowledge Base — TanStack Query options.
 */

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type { KbCategory } from "../../src/schema/types.js";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  type UpdateCategoryInput,
  updateCategory,
} from "../api.js";

import { kbArticleKeys, kbCategoryKeys } from "./keys.js";

/* ── Categories ── */

export function categoriesQueryOptions(kbId: string) {
  return queryOptions({
    queryKey: kbCategoryKeys.list(kbId),
    queryFn: ({ signal }) => listCategories(kbId, signal),
    enabled: !!kbId,
    staleTime: 60_000,
  });
}

export function categoryDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: kbCategoryKeys.detail(id),
    queryFn: ({ signal }) => getCategory(id, signal),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCategoriesQuery(kbId: string) {
  return useQuery(categoriesQueryOptions(kbId));
}

export function useCreateCategoryMutation(kbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCategory,
    onSuccess: async (created) => {
      queryClient.setQueryData<KbCategory[] | undefined>(
        kbCategoryKeys.list(kbId),
        (old) => (old ? [...old, created] : [created])
      );
      await queryClient.invalidateQueries({
        queryKey: kbCategoryKeys.list(kbId),
      });
    },
  });
}

export function useUpdateCategoryMutation(kbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      updateCategory(id, input),
    onSuccess: async (data, variables) => {
      queryClient.setQueryData(kbCategoryKeys.detail(data.id), data);
      queryClient.setQueryData<KbCategory[] | undefined>(
        kbCategoryKeys.list(kbId),
        (old) =>
          old?.map((category) =>
            category.id === data.id ? { ...category, ...data } : category
          )
      );
      if (variables.input.comments_mode !== undefined) {
        await queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
      }
      await queryClient.invalidateQueries({
        queryKey: kbCategoryKeys.list(kbId),
      });
      await queryClient.invalidateQueries({
        queryKey: kbCategoryKeys.detail(data.id),
      });
    },
  });
}

export function useDeleteCategoryMutation(kbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: kbCategoryKeys.list(kbId),
      });
      // Articles may have been re-parented to the default category.
      await queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
    },
  });
}
