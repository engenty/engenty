/**
 * Knowledge Base — TanStack Query options.
 */

import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import {
  clearKbSourceRuns,
  createKbSource,
  deleteKbSource,
  deleteKbSourceItem,
  getKbSource,
  getKbSourceItem,
  type KbSourcesListQuery,
  listKbSourceItems,
  listKbSources,
  listSourceAdapters,
  rotateKbSourceWebhookToken,
  runKbSourceNow,
  stopKbSourceRun,
  updateKbSource,
  updateKbSourceItemStatus,
} from "../api.js";

import { kbInboxKeys, kbSourceKeys } from "./keys.js";

export const sourceAdaptersQueryOptions = queryOptions({
  queryKey: kbSourceKeys.adapters,
  queryFn: ({ signal }) => listSourceAdapters(signal),
  staleTime: 60_000,
});

export function kbSourcesListQueryOptions(query: KbSourcesListQuery) {
  return queryOptions({
    queryKey: kbSourceKeys.list(query),
    queryFn: ({ signal }) => listKbSources(query, signal),
    enabled: !!query.kb_id,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function kbSourceItemsQueryOptions(params: {
  page: number;
  page_size: number;
  search?: string;
  sourceId: string;
  status?: string;
}) {
  return queryOptions({
    queryKey: kbSourceKeys.items(
      params.sourceId,
      params.page,
      params.page_size,
      params.search ?? "",
      params.status ?? ""
    ),
    queryFn: ({ signal }) =>
      listKbSourceItems(
        params.sourceId,
        {
          page: params.page,
          page_size: params.page_size,
          search: params.search,
          status: params.status,
        },
        signal
      ),
    enabled: !!params.sourceId,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function kbSourceDetailQueryOptions(sourceId: string) {
  return queryOptions({
    queryKey: kbSourceKeys.detail(sourceId),
    queryFn: ({ signal }) => getKbSource(sourceId, signal),
    enabled: !!sourceId,
    staleTime: 15_000,
  });
}

export function kbSourceItemDetailQueryOptions(itemId: string) {
  return queryOptions({
    queryKey: kbSourceKeys.sourceItem(itemId),
    queryFn: ({ signal }) => getKbSourceItem(itemId, signal),
    enabled: !!itemId,
    staleTime: 15_000,
  });
}

export function useKbSourceMutations(listQuery?: KbSourcesListQuery) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    if (listQuery) {
      await queryClient.invalidateQueries({
        queryKey: kbSourceKeys.list(listQuery),
      });
    }
    await queryClient.invalidateQueries({ queryKey: kbSourceKeys.all });
    await queryClient.invalidateQueries({ queryKey: kbInboxKeys.all });
  };
  return {
    create: useMutation({ mutationFn: createKbSource, onSuccess: invalidate }),
    delete: useMutation({ mutationFn: deleteKbSource, onSuccess: invalidate }),
    rotateWebhook: useMutation({
      mutationFn: rotateKbSourceWebhookToken,
      onSuccess: invalidate,
    }),
    run: useMutation({
      mutationFn: (sourceId: string) =>
        runKbSourceNow(sourceId, { background: true, trigger: "manual" }),
      onSuccess: invalidate,
    }),
    reindex: useMutation({
      mutationFn: ({
        selectedItemKeys,
        sourceId,
      }: {
        selectedItemKeys: string[];
        sourceId: string;
      }) =>
        runKbSourceNow(sourceId, {
          background: true,
          force: true,
          selected_item_keys: selectedItemKeys,
          trigger: "manual",
        }),
      onSuccess: invalidate,
    }),
    stopRun: useMutation({
      mutationFn: ({ runId, sourceId }: { runId: string; sourceId: string }) =>
        stopKbSourceRun(sourceId, runId),
      onSuccess: invalidate,
    }),
    clearRuns: useMutation({
      mutationFn: clearKbSourceRuns,
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: string;
        input: Record<string, unknown>;
      }) => updateKbSource(id, input),
      onSuccess: invalidate,
    }),
    updateItemStatus: useMutation({
      mutationFn: ({
        itemId,
        sourceId,
        status,
      }: {
        itemId: string;
        sourceId: string;
        status: Parameters<typeof updateKbSourceItemStatus>[2];
      }) => updateKbSourceItemStatus(sourceId, itemId, status),
      onSuccess: invalidate,
    }),
    deleteItem: useMutation({
      mutationFn: ({
        itemId,
        sourceId,
      }: {
        itemId: string;
        sourceId: string;
      }) => deleteKbSourceItem(sourceId, itemId),
      onSuccess: invalidate,
    }),
  };
}
