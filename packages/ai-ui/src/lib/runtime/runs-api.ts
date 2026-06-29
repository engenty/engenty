// apps/ai run HTTP client — session run list, events, and cancel. Runs are an
// internal execution substrate; these back chat reload-resume and cancellation,
// not an operator-browsable runs surface.

import type {
  AiAgentRunSummary,
  AiRunDetailResult,
  AiRunEventsResult,
} from "../admin/ai-runtime-types.js";
import { requestAiServiceJson } from "./ai-service-client.js";

/** Full run records for a session, oldest first (chat transcript). */
export async function getAiSessionRuns(
  threadId: string,
  input?: {
    actionId?: string;
    agentId?: string;
    limit?: number;
    signal?: AbortSignal;
  }
): Promise<{ runs: AiAgentRunSummary[] }> {
  const query = new URLSearchParams();
  if (input?.limit) {
    query.set("limit", String(input.limit));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const result = await requestAiServiceJson<{ runs: AiAgentRunSummary[] }>(
    `/ai/v1/threads/${encodeURIComponent(threadId)}/runs${suffix}`,
    { signal: input?.signal }
  );
  return {
    runs: [...result.runs].toReversed(),
  };
}

/** Single run record + summary — used to settle live status when the SSE
 * stream drops without delivering a terminal event (the run is durable; its
 * persisted status is the source of truth). */
export function getAiRun(runId: string, signal?: AbortSignal) {
  return requestAiServiceJson<AiRunDetailResult>(
    `/ai/v1/runs/${encodeURIComponent(runId)}`,
    { signal }
  );
}

export function getAiRunEvents(runId: string, signal?: AbortSignal) {
  return requestAiServiceJson<AiRunEventsResult>(
    `/ai/v1/runs/${encodeURIComponent(runId)}/events`,
    {
      signal,
    }
  );
}

export function cancelAiRun(runId: string, input?: { reason?: string }) {
  return requestAiServiceJson<AiRunDetailResult>(
    `/ai/v1/runs/${encodeURIComponent(runId)}/cancel`,
    {
      body: JSON.stringify(input ?? {}),
      method: "POST",
    }
  );
}
