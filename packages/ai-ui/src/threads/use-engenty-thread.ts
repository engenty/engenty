"use client";

import { useMemo } from "react";
import type { AppsAiThreadRecord } from "../ag-ui/apps-ai/apps-ai-thread-api.js";
import {
  appsAiThreadDetailQueryKey,
  appsAiThreadMessagesQueryKey,
  useAppsAiThreadMessagesQuery,
  useAppsAiThreadQuery,
} from "../ag-ui/apps-ai/apps-ai-thread-api.js";
import { useEngentyThreadsContext } from "./engenty-threads-provider.js";

export interface UseEngentyThreadOptions {
  enabled?: boolean;
  /** Omit to use the active thread id for `hostKey`. */
  threadId?: string | null;
}

/** The stretch of transcript not loaded yet, and how to fetch it. */
export interface EngentyThreadOlderMessages {
  hasMore: boolean;
  isLoading: boolean;
  load: () => void;
}

export interface UseEngentyThreadResult {
  agUiMessages: ReturnType<typeof useAppsAiThreadMessagesQuery>["agUiMessages"];
  isLoading: boolean;
  isLoadingMessages: boolean;
  messagesError: Error | null;
  olderMessages: EngentyThreadOlderMessages;
  session: AppsAiThreadRecord | undefined;
  sessionError: Error | null;
  threadDetailQueryKey: readonly unknown[];
  threadId: string | null;
  threadMessagesQueryKey: readonly unknown[];
}

export function useEngentyThread(
  hostKey: string,
  options: UseEngentyThreadOptions = {}
): UseEngentyThreadResult {
  const ctx = useEngentyThreadsContext();
  const resolvedThreadId =
    options.threadId === undefined
      ? ctx.getActiveThreadId(hostKey)
      : options.threadId;

  const enabled =
    (options.enabled ?? true) &&
    ctx.isTransportReady &&
    ctx.serviceBaseUrl.length > 0 &&
    Boolean(resolvedThreadId);

  const detailQuery = useAppsAiThreadQuery({
    enabled,
    serviceBaseUrl: ctx.serviceBaseUrl,
    threadId: resolvedThreadId,
  });

  // Detail and transcript load side by side: the transcript does not need the
  // detail, and chaining them doubled the wait on every open.
  const messagesQuery = useAppsAiThreadMessagesQuery({
    enabled,
    serviceBaseUrl: ctx.serviceBaseUrl,
    threadId: resolvedThreadId,
  });

  // The keys the queries above are cached under: a run that settles
  // invalidates exactly these.
  const threadDetailQueryKey = useMemo(
    () =>
      resolvedThreadId
        ? appsAiThreadDetailQueryKey({
            serviceBaseUrl: ctx.serviceBaseUrl,
            threadId: resolvedThreadId,
          })
        : [],
    [ctx.serviceBaseUrl, resolvedThreadId]
  );

  const threadMessagesQueryKey = useMemo(
    () =>
      resolvedThreadId
        ? appsAiThreadMessagesQueryKey({
            serviceBaseUrl: ctx.serviceBaseUrl,
            threadId: resolvedThreadId,
          })
        : [],
    [ctx.serviceBaseUrl, resolvedThreadId]
  );

  const { fetchNextPage } = messagesQuery;
  const olderMessages = useMemo(
    (): EngentyThreadOlderMessages => ({
      hasMore: messagesQuery.hasNextPage,
      isLoading: messagesQuery.isFetchingNextPage,
      load: () => {
        void fetchNextPage();
      },
    }),
    [fetchNextPage, messagesQuery.hasNextPage, messagesQuery.isFetchingNextPage]
  );

  return {
    agUiMessages: messagesQuery.agUiMessages,
    isLoading: detailQuery.isLoading,
    // Loading only while nothing is held: a cached transcript shows at once
    // and a background refetch replaces it when it lands (hydration takes the
    // newer rows). Older pages are a prepend, never a reload.
    isLoadingMessages: messagesQuery.isPending,
    messagesError:
      messagesQuery.error instanceof Error ? messagesQuery.error : null,
    olderMessages,
    session: detailQuery.data,
    sessionError: detailQuery.error instanceof Error ? detailQuery.error : null,
    threadDetailQueryKey,
    threadId: resolvedThreadId,
    threadMessagesQueryKey,
  };
}
