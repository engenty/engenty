/**
 * Knowledge Base — TanStack Query options.
 */

import { useMutation, useQueryClient } from "@engenty/query-client";
import {
  type ArticlesQuery,
  deleteArticle,
  deleteFaq,
  type FaqsQuery,
  fetchInboxSourceFromUrl,
  type InboxListQuery,
  patchInboxItem,
  promoteInboxBatch,
  promoteInboxItem,
  updateArticle,
  updateFaq,
} from "../api.js";

import { invalidateKbGraphQueries } from "./graph.js";
import { kbArticleKeys, kbFaqKeys, kbInboxKeys } from "./keys.js";

export function usePromoteInboxMutation(inboxListQuery?: InboxListQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      promoteInboxItem(id, body),
    onSuccess: async () => {
      if (inboxListQuery) {
        await queryClient.invalidateQueries({
          queryKey: kbInboxKeys.list(inboxListQuery),
        });
      }
      await queryClient.invalidateQueries({ queryKey: kbInboxKeys.all });
      await queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
      await queryClient.invalidateQueries({ queryKey: kbFaqKeys.all });
      await invalidateKbGraphQueries(queryClient);
    },
  });
}

export function usePromoteInboxBatchMutation(inboxListQuery?: InboxListQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      promoteInboxBatch(id, body),
    onSuccess: async () => {
      if (inboxListQuery) {
        await queryClient.invalidateQueries({
          queryKey: kbInboxKeys.list(inboxListQuery),
        });
      }
      await queryClient.invalidateQueries({ queryKey: kbInboxKeys.all });
      await queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
      await queryClient.invalidateQueries({ queryKey: kbFaqKeys.all });
      await invalidateKbGraphQueries(queryClient);
    },
  });
}

export function usePatchInboxMutation(inboxListQuery?: InboxListQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Record<string, unknown>;
    }) => patchInboxItem(id, input),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({
        queryKey: kbInboxKeys.detail(vars.id),
      });
      await queryClient.invalidateQueries({ queryKey: kbInboxKeys.all });
      if (inboxListQuery) {
        await queryClient.invalidateQueries({
          queryKey: kbInboxKeys.list(inboxListQuery),
        });
      }
    },
  });
}

export function useFetchInboxSourceMutation(inboxListQuery?: InboxListQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ force, id }: { force?: boolean; id: string }) =>
      fetchInboxSourceFromUrl(id, { force }),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({
        queryKey: kbInboxKeys.detail(vars.id),
      });
      await queryClient.invalidateQueries({ queryKey: kbInboxKeys.all });
      if (inboxListQuery) {
        await queryClient.invalidateQueries({
          queryKey: kbInboxKeys.list(inboxListQuery),
        });
      }
    },
  });
}

export function useDeleteArticleMutation(listQuery?: ArticlesQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteArticle(id),
    onSuccess: async () => {
      if (listQuery) {
        await queryClient.invalidateQueries({
          queryKey: kbArticleKeys.list(listQuery),
        });
      }
      await queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
      await invalidateKbGraphQueries(queryClient);
    },
  });
}

export function useUpdateArticleMutation(listQuery?: ArticlesQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Record<string, unknown>;
    }) => updateArticle(id, input),
    onSuccess: async (_data, { id }) => {
      if (listQuery) {
        await queryClient.invalidateQueries({
          queryKey: kbArticleKeys.list(listQuery),
        });
      }
      await queryClient.invalidateQueries({ queryKey: kbArticleKeys.all });
      await queryClient.invalidateQueries({
        queryKey: ["kb", "articles", "versions", id],
      });
      await invalidateKbGraphQueries(queryClient);
    },
  });
}

export function useDeleteFaqMutation(listQuery?: FaqsQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFaq(id),
    onSuccess: async () => {
      if (listQuery) {
        await queryClient.invalidateQueries({
          queryKey: kbFaqKeys.list(listQuery),
        });
      }
      await queryClient.invalidateQueries({ queryKey: kbFaqKeys.all });
    },
  });
}

export function useUpdateFaqMutation(listQuery?: FaqsQuery) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Record<string, unknown>;
    }) => updateFaq(id, input),
    onSuccess: async (_data, { id }) => {
      if (listQuery) {
        await queryClient.invalidateQueries({
          queryKey: kbFaqKeys.list(listQuery),
        });
      }
      await queryClient.invalidateQueries({ queryKey: kbFaqKeys.all });
      await queryClient.invalidateQueries({
        queryKey: ["kb", "faqs", "versions", id],
      });
    },
  });
}
