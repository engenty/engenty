// Thread context-window usage against apps/ai `/ai/v1/threads/:id/context-usage`.
//
// Complements ../../../ag-ui/thread-usage (cumulative thread tokens + cost):
// that answers "what has this thread spent", this answers "how full is the
// window right now". Same provider/readiness conventions as
// use-copilot-thread-usage.ts.

import { getCurrentAccessToken } from "@engenty/api-client";
import { useQuery } from "@engenty/query-client";
import { normalizeAppsAiServiceBaseUrl } from "../../../ag-ui/apps-ai/apps-ai-api.js";
import { useEngentyAIContext } from "../../../agent-provider/engenty-ai-provider.js";
import type { ThreadContextUsage } from "./context-usage-model.js";

export async function fetchThreadContextUsage(
  serviceBaseUrl: string,
  threadId: string,
  signal?: AbortSignal
): Promise<ThreadContextUsage | null> {
  // Bearer token, not cookies: apps/ai is a separate origin from the SPA, so
  // `credentials: "include"` sends nothing it will accept and every call 401s.
  const token = await getCurrentAccessToken();
  if (!token) {
    throw new Error("No access token available");
  }
  const url = `${normalizeAppsAiServiceBaseUrl(
    serviceBaseUrl
  )}/ai/v1/threads/${encodeURIComponent(threadId)}/context-usage`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error((body as { error?: string }).error ?? `HTTP ${res.status}`),
      { status: res.status, body }
    );
  }
  const data = (await res.json()) as { usage: ThreadContextUsage | null };
  return data.usage;
}

export function threadContextUsageQueryKey(input: {
  serviceBaseUrl: string;
  threadId: string;
}) {
  return [
    "apps-ai",
    "thread-context-usage",
    input.serviceBaseUrl,
    input.threadId,
  ] as const;
}

/**
 * Context-window usage for the thread's last measured run.
 *
 * `chatStatus` is part of the key so the meter refetches when a turn ends:
 * usage only moves when a run finishes, so polling between turns would read
 * the same row repeatedly.
 */
export function useCopilotContextUsage(input: {
  chatStatus: "ready" | "streaming" | "submitted" | "error";
  threadId: string | null;
}) {
  const ai = useEngentyAIContext();

  const query = useQuery({
    enabled: Boolean(
      ai.isTransportReady && input.threadId && ai.serviceBaseUrl
    ),
    queryFn: ({ signal }) =>
      fetchThreadContextUsage(
        ai.serviceBaseUrl,
        input.threadId as string,
        signal
      ),
    queryKey: input.threadId
      ? [
          ...threadContextUsageQueryKey({
            serviceBaseUrl: ai.serviceBaseUrl,
            threadId: input.threadId,
          }),
          input.chatStatus === "ready" ? "settled" : "active",
        ]
      : ["apps-ai", "thread-context-usage", "idle"],
    staleTime: 5000,
  });

  return { isLoading: query.isLoading, usage: query.data ?? null };
}
