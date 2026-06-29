"use client";

import { useMemo } from "react";
import type { AppsAiThreadRecord } from "../ag-ui/apps-ai/apps-ai-session-api.js";
import {
  useAppsAiThreadMessagesQuery,
  useAppsAiThreadQuery,
} from "../ag-ui/apps-ai/apps-ai-session-api.js";
import { useEngentyThreadsContext } from "./engenty-threads-provider.js";

export interface UseEngentyThreadOptions {
  enabled?: boolean;
  /** Omit to use the active thread id for `hostKey`. */
  threadId?: string | null;
}

export interface UseEngentyThreadResult {
  agUiMessages: ReturnType<typeof useAppsAiThreadMessagesQuery>["agUiMessages"];
  isLoading: boolean;
  isLoadingMessages: boolean;
  messagesError: Error | null;
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

  return {
    agUiMessages: messagesQuery.agUiMessages,
    isLoading: detailQuery.isLoading,
    isLoadingMessages:
      messagesQuery.isPending ||
      messagesQuery.isLoading ||
      messagesQuery.isFetching ||
      !messagesQuery.isFetched,
    messagesError:
      messagesQuery.error instanceof Error ? messagesQuery.error : null,
    session: detailQuery.data,
    sessionError: detailQuery.error instanceof Error ? detailQuery.error : null,
    threadDetailQueryKey,
    threadId: resolvedThreadId,
    threadMessagesQueryKey,
  };
}
