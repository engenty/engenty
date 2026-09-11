import {
  beginOptimisticUpdate,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import {
  getInboxCategoriesConfig,
  type InboxCategoriesConfig,
  setInboxCategoriesConfig,
} from "./api/inbox-categories-settings.js";
import type { InboxThreadsListParams } from "./api.js";
import {
  classifyPendingInboxMessages,
  getInboxAttachment,
  getInboxThread,
  getInboxThreadDigest,
  listInboxAccounts,
  listInboxThreads,
  runInboxSyncNow,
  searchInboxMessages,
  updateInboxSyncSettings,
} from "./api.js";

// biome-ignore lint/performance/noBarrelFile: preserve established query-hook imports
export { useSetMessageStatusMutation } from "./inbox-status-optimistic.js";

export const inboxKeys = {
  all: ["inbox"] as const,
  accounts: () => [...inboxKeys.all, "accounts"] as const,
  categories: () => [...inboxKeys.all, "categories"] as const,
  search: (query: string) => [...inboxKeys.all, "search", query] as const,
  thread: (id: string) => [...inboxKeys.all, "thread", id] as const,
  threadDigest: (id: string) =>
    [...inboxKeys.all, "thread-digest", id] as const,
  attachment: (messageId: string, attachmentId: string) =>
    [...inboxKeys.all, "attachment", messageId, attachmentId] as const,
  threads: (params: InboxThreadsListParams) =>
    [
      ...inboxKeys.all,
      "threads",
      params.connection_id ?? null,
      params.status ?? null,
      params.category ?? null,
      params.offset ?? 0,
      params.limit ?? 25,
    ] as const,
};

export function inboxThreadsOptions(params: InboxThreadsListParams) {
  return queryOptions({
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => listInboxThreads(params, signal),
    queryKey: inboxKeys.threads(params),
  });
}

export function useInboxThreadsQuery(params: InboxThreadsListParams) {
  return useQuery(inboxThreadsOptions(params));
}

export function inboxThreadOptions(id: string) {
  return queryOptions({
    queryFn: ({ signal }) => getInboxThread(id, signal),
    queryKey: inboxKeys.thread(id),
  });
}

export function useInboxThreadQuery(id: string | null) {
  return useQuery({
    ...inboxThreadOptions(id ?? ""),
    enabled: Boolean(id),
  });
}

/**
 * Digest generation can take a few seconds on first open (light-model calls);
 * only enabled while the Optimized tab is visible, and cached afterwards.
 */
export function useInboxThreadDigestQuery(id: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(id),
    queryFn: ({ signal }) =>
      getInboxThreadDigest({ thread_id: id ?? "" }, signal),
    queryKey: inboxKeys.threadDigest(id ?? ""),
    retry: false,
    staleTime: 60_000,
  });
}

export function useRefreshThreadDigestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { includeSummary?: boolean; threadId: string }) =>
      getInboxThreadDigest({
        include_summary: input.includeSummary ?? false,
        refresh: true,
        thread_id: input.threadId,
      }),
    onSuccess: (data, input) => {
      queryClient.setQueryData(inboxKeys.threadDigest(input.threadId), data);
    },
  });
}

/**
 * The thread status summary is an explicit ask, not something every open pays
 * for — it lands in the same cache entry so the view just starts showing it.
 */
export function useThreadSummaryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) =>
      getInboxThreadDigest({ include_summary: true, thread_id: threadId }),
    onSuccess: (data, threadId) => {
      queryClient.setQueryData(inboxKeys.threadDigest(threadId), data);
    },
  });
}

/**
 * Classify whatever is still uncategorized so the category lanes are complete.
 * Runs in batches; the caller repeats while `remaining > 0`.
 */
export function useClassifyPendingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { limit?: number } = {}) =>
      classifyPendingInboxMessages(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}

export function useInboxAttachmentQuery(
  messageId: string,
  attachmentId: string | null,
  enabled = true
) {
  return useQuery({
    enabled: enabled && Boolean(messageId && attachmentId),
    queryFn: ({ signal }) =>
      getInboxAttachment(
        { attachment_id: attachmentId!, message_id: messageId },
        signal
      ),
    queryKey: inboxKeys.attachment(messageId, attachmentId ?? ""),
    staleTime: 5 * 60_000,
  });
}

export function useInboxAccountsQuery() {
  return useQuery({
    queryFn: ({ signal }) => listInboxAccounts(signal),
    queryKey: inboxKeys.accounts(),
  });
}

export function useInboxSearchQuery(query: string) {
  return useQuery({
    enabled: query.trim().length > 1,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => searchInboxMessages(query.trim(), {}, signal),
    queryKey: inboxKeys.search(query.trim()),
  });
}

export function useUpdateSyncSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      backfill_days?: number;
      connection_id: string;
      sync_enabled?: boolean;
    }) => updateInboxSyncSettings(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.accounts() });
    },
  });
}

export function useRunSyncNowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { connection_id?: string }) => runInboxSyncNow(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}

export function useInboxCategoriesQuery() {
  return useQuery({
    queryFn: ({ signal }) => getInboxCategoriesConfig(signal),
    queryKey: inboxKeys.categories(),
    staleTime: 60_000,
  });
}

export function useSaveInboxCategoriesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: InboxCategoriesConfig) =>
      setInboxCategoriesConfig(config),
    onMutate: async (config) => {
      const transaction = await beginOptimisticUpdate<InboxCategoriesConfig>(
        queryClient,
        {
          queryKey: inboxKeys.categories(),
          update: () => config,
        }
      );
      return { transaction };
    },
    onError: (_error, _config, context) => {
      context?.transaction.rollback();
      toast.error("Could not save inbox categories.");
    },
    onSuccess: (data) => {
      queryClient.setQueryData(inboxKeys.categories(), data);
    },
  });
}
