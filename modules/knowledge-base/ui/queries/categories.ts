/**
 * Knowledge Base — TanStack Query options.
 */

import {
  beginOptimisticUpdate,
  createOptimisticId,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import {
  KB_CATEGORY_PAGE_SETTINGS_DEFAULTS,
  type KbCategory,
} from "../../src/schema/types.js";
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
    onMutate: async (input) => {
      const optimisticId = createOptimisticId();
      const now = new Date().toISOString();
      const optimistic: KbCategory = {
        comments_mode: input.comments_mode ?? "inherit",
        cover: null,
        cover_inheritance: "none",
        created_at: now,
        description: input.description ?? null,
        icon: null,
        id: optimisticId,
        intro_json: null,
        intro_markdown: null,
        is_default: false,
        kb_id: input.kb_id,
        name: input.name,
        outro_json: null,
        outro_markdown: null,
        page_settings:
          input.page_settings ?? KB_CATEGORY_PAGE_SETTINGS_DEFAULTS,
        parent_id: input.parent_id ?? null,
        scope_id: "",
        slug: input.slug,
        sort_order: input.sort_order ?? 0,
        template_id: input.template_id ?? null,
        template_mode: input.template_mode ?? "inherit",
        tenant_id: "",
        updated_at: now,
        view_type: input.view_type ?? "folder",
      };
      await queryClient.cancelQueries({
        queryKey: kbCategoryKeys.list(kbId),
      });
      queryClient.setQueryData<KbCategory[]>(
        kbCategoryKeys.list(kbId),
        (current) => [...(current ?? []), optimistic]
      );
      return { optimisticId };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData<KbCategory[]>(
        kbCategoryKeys.list(kbId),
        (current) =>
          current?.filter((category) => category.id !== context?.optimisticId)
      );
      toast.error("Could not create the category.");
    },
    onSuccess: (created, _input, context) => {
      queryClient.setQueryData<KbCategory[] | undefined>(
        kbCategoryKeys.list(kbId),
        (old) =>
          old?.map((category) =>
            category.id === context?.optimisticId ? created : category
          ) ?? [created]
      );
      queryClient.setQueryData(kbCategoryKeys.detail(created.id), created);
    },
  });
}

export function useUpdateCategoryMutation(kbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      updateCategory(id, input),
    onMutate: async ({ id, input }) => ({
      transactions: await Promise.all([
        beginOptimisticUpdate<KbCategory[]>(queryClient, {
          queryKey: kbCategoryKeys.list(kbId),
          update: (current) =>
            current?.map((category) =>
              category.id === id ? { ...category, ...input } : category
            ),
        }),
        beginOptimisticUpdate<KbCategory>(queryClient, {
          queryKey: kbCategoryKeys.detail(id),
          update: (current) => (current ? { ...current, ...input } : current),
        }),
      ]),
    }),
    onError: (_error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: kbCategoryKeys.all });
      void queryClient.invalidateQueries({
        queryKey: kbCategoryKeys.detail(id),
      });
      toast.error("Could not move or update the category. Tree is refreshing.");
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(kbCategoryKeys.detail(data.id), data);
      queryClient.setQueryData<KbCategory[] | undefined>(
        kbCategoryKeys.list(kbId),
        (old) =>
          old?.map((category) =>
            category.id === data.id ? { ...category, ...data } : category
          )
      );
      if (variables.input.comments_mode !== undefined) {
        void queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
      }
    },
  });
}

export function useDeleteCategoryMutation(kbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCategory,
    onMutate: async (id) => ({
      transaction: await beginOptimisticUpdate<KbCategory[]>(queryClient, {
        queryKey: kbCategoryKeys.list(kbId),
        update: (current) => current?.filter((category) => category.id !== id),
      }),
    }),
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: kbCategoryKeys.all });
      toast.error("Could not delete the category. Tree is refreshing.");
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: kbCategoryKeys.detail(id) });
      // Articles may have been re-parented to the default category.
      void queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
    },
  });
}
