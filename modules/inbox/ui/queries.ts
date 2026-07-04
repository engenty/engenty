import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type { InboxMessageStatus, InboxThreadsListParams } from "./api.js";
import {
  getInboxThread,
  listInboxAccounts,
  listInboxThreads,
  runInboxSyncNow,
  searchInboxMessages,
  setInboxMessageStatus,
  updateInboxSyncSettings,
} from "./api.js";

export const inboxKeys = {
  all: ["inbox"] as const,
  accounts: () => [...inboxKeys.all, "accounts"] as const,
  search: (query: string) => [...inboxKeys.all, "search", query] as const,
  thread: (id: string) => [...inboxKeys.all, "thread", id] as const,
  threads: (params: InboxThreadsListParams) =>
    [
      ...inboxKeys.all,
      "threads",
      params.connection_id ?? null,
      params.status ?? null,
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

export function useSetMessageStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: string[]; status: InboxMessageStatus }) =>
      setInboxMessageStatus(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    },
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
