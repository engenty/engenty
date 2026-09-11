// Where observational memory stands on a thread — the observer's cursor and
// its observations — read for the transcript's "remembered up to here" line.
// Nothing here writes: the observer runs inside the agent's turns.

import { useQuery } from "@engenty/query-client";
import { requestAiServiceJson } from "../lib/runtime/ai-service-client.js";

export interface ThreadMemoryObservations {
  active_observations: string;
  buffered_message_ids: string[];
  generation_count: number;
  last_observed_at: string | null;
  last_reflection_at: string | null;
  observation_token_count: number;
  observed_message_ids: string[];
  total_tokens_observed: number;
}

export function getThreadMemoryObservations(
  threadId: string,
  signal?: AbortSignal
): Promise<ThreadMemoryObservations | null> {
  return requestAiServiceJson<{ memory: ThreadMemoryObservations | null }>(
    `/ai/threads/${encodeURIComponent(threadId)}/memory-observations`,
    { signal }
  ).then((result) => result.memory);
}

export function threadMemoryObservationsQueryKey(threadId: string) {
  return ["ai-ui", "thread-memory-observations", threadId] as const;
}

/**
 * The observer works between turns, so the cursor moves while the thread is
 * open: refetch on focus and on a slow interval, and again after each turn
 * (the transcript passes the message count as `turnKey`).
 */
export function useThreadMemoryObservationsQuery(
  threadId: string | null | undefined,
  turnKey?: number
) {
  const id = threadId?.trim() || null;
  return useQuery({
    enabled: id !== null,
    queryFn: ({ signal }) => getThreadMemoryObservations(id as string, signal),
    queryKey: [...threadMemoryObservationsQueryKey(id ?? ""), turnKey ?? 0],
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

/**
 * The transcript index where the observer's memory ends: the first message
 * (in transcript order) it has not folded into observations. Null when it
 * has observed nothing yet, or when every visible message is still raw —
 * a line at the very top or bottom would mark nothing.
 */
export function resolveMemoryBreakIndex(
  messages: readonly { id: string }[],
  memory: Pick<ThreadMemoryObservations, "observed_message_ids"> | null
): number | null {
  if (!memory || memory.observed_message_ids.length === 0) {
    return null;
  }
  const observed = new Set(memory.observed_message_ids);
  let lastObserved = -1;
  for (let i = 0; i < messages.length; i++) {
    if (observed.has(messages[i]?.id ?? "")) {
      lastObserved = i;
    }
  }
  if (lastObserved < 0 || lastObserved === messages.length - 1) {
    return null;
  }
  return lastObserved + 1;
}
