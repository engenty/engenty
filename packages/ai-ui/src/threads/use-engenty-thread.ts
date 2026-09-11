"use client";

import { useMemo } from "react";
import type { AppsAiThreadRecord } from "../ag-ui/apps-ai/apps-ai-thread-api.js";
import {
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

  const messagesQuery = useAppsAiThreadMessagesQuery({
    enabled: enabled && detailQuery.isSuccess,
    serviceBaseUrl: ctx.serviceBaseUrl,
    threadId: resolvedThreadId,
  });

  const threadDetailQueryKey = useMemo(
    () =>
      resolvedThreadId
        ? [
            "apps-ai",
            "sessions",
            "detail",
            ctx.serviceBaseUrl,
            resolvedThreadId,
          ]
        : [],
    [ctx.serviceBaseUrl, resolvedThreadId]
  );

  const threadMessagesQueryKey = useMemo(
    () =>
      resolvedThreadId
        ? [
            "apps-ai",
            "sessions",
            "messages",
            ctx.serviceBaseUrl,
            resolvedThreadId,
          ]
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
    // Fetching an older page keeps the transcript on screen: it is a prepend,
    // not a reload, so it must not swap the lane for the loading skeleton.
    isLoadingMessages:
      messagesQuery.isPending ||
      messagesQuery.isLoading ||
      (messagesQuery.isFetching && !messagesQuery.isFetchingNextPage) ||
      !messagesQuery.isFetched,
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
