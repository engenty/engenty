// The events behind the thread's usage totals, from apps/ai
// `/ai/threads/:id/usage/events` — one row per metered model call.
//
// Complements prompt-preview-api.ts: that reconstructs ONE prompt to show what
// is in it, this lists every call the thread has actually paid for. A thread
// total is the sum of these rows, and the sum alone hides the thing that makes
// a chat expensive — that each call re-sends the whole prompt, so N calls cost
// roughly N × the prompt.
//
// Unlike the prompt preview this is recorded data, not a reconstruction: it is
// exact, available in every build, and needs no developer mode.
import { getCurrentAccessToken } from "@engenty/api-client";
import { useQuery } from "@engenty/query-client";
import {
  appsAiThreadsPath,
  normalizeAppsAiServiceBaseUrl,
} from "../../../ag-ui/apps-ai/apps-ai-api.js";
import { useEngentyAIContext } from "../../../agent-provider/engenty-ai-provider.js";

export interface ThreadUsageEvent {
  cached_input_per_mtok_micros: number;
  /** Cache READS. A slice of `input_tokens`, never an addition to it. */
  cached_tokens: number;
  cost_micros: number;
  currency: string;
  feature: string;
  id: string;
  input_per_mtok_micros: number;
  input_tokens: number;
  model_id: string;
  occurred_at: string;
  output_per_mtok_micros: number;
  output_tokens: number;
  reasoning_per_mtok_micros: number;
  /** A slice of `output_tokens`. */
  reasoning_tokens: number;
  run_id: string | null;
}

export async function fetchThreadUsageEvents(
  serviceBaseUrl: string,
  threadId: string,
  signal?: AbortSignal
): Promise<ThreadUsageEvent[]> {
  // Bearer, not cookies: apps/ai is a separate origin from the SPA.
  const token = await getCurrentAccessToken();
  if (!token) {
    throw new Error("No access token available");
  }
  const url = `${appsAiThreadsPath(
    normalizeAppsAiServiceBaseUrl(serviceBaseUrl)
  )}/${encodeURIComponent(threadId)}/usage/events`;
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
  const data = (await res.json()) as { events: ThreadUsageEvent[] };
  return data.events ?? [];
}

export function threadUsageEventsQueryKey(input: {
  serviceBaseUrl: string;
  threadId: string;
}) {
  return [
    "apps-ai",
    "thread-usage-events",
    input.serviceBaseUrl,
    input.threadId,
  ] as const;
}

/**
 * Fetched only while the drill-in is open: the rows never change for calls
 * already recorded, and a background refetch would only ever append the row for
 * a run that is finishing while the reader scrolls.
 */
export function useThreadUsageEvents(input: {
  enabled: boolean;
  threadId: string | null;
}) {
  const ai = useEngentyAIContext();

  const query = useQuery({
    enabled: Boolean(
      input.enabled &&
        ai.isTransportReady &&
        input.threadId &&
        ai.serviceBaseUrl
    ),
    queryFn: ({ signal }) =>
      fetchThreadUsageEvents(
        ai.serviceBaseUrl,
        input.threadId as string,
        signal
      ),
    queryKey: input.threadId
      ? threadUsageEventsQueryKey({
          serviceBaseUrl: ai.serviceBaseUrl,
          threadId: input.threadId,
        })
      : ["apps-ai", "thread-usage-events", "idle"],
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  return {
    error: query.error as Error | null,
    events: query.data ?? null,
    isLoading: query.isFetching,
  };
}
