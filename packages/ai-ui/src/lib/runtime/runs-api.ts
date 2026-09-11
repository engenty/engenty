// apps/ai run HTTP client — session run list, events, and cancel.
//
// Runs started as an internal execution substrate backing chat reload-resume
// and cancellation. `listAgentRuns` deliberately reverses that: an agent that
// works unattended on a schedule is only trustworthy if you can see what it
// actually did, so its runs ARE a product surface now (the agent's Runs tab).

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

/**
 * Every run this agent has had, newest first — chat turns and task work alike.
 * `agent_registered_at` dates the registry row: runs are keyed by the agent
 * KEY, so re-hiring a key inherits the work done under it before.
 */
export async function listAgentRuns(
  agentId: string,
  input?: { limit?: number; signal?: AbortSignal }
): Promise<{ agent_registered_at?: string | null; runs: AiAgentRunSummary[] }> {
  const query = new URLSearchParams({ agent_id: agentId });
  query.set("limit", String(input?.limit ?? 50));
  return await requestAiServiceJson<{
    agent_registered_at?: string | null;
    runs: AiAgentRunSummary[];
  }>(`/ai/v1/runs?${query.toString()}`, { signal: input?.signal });
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

/**
 * The tenant's newest runs, whoever they belong to.
 *
 * One feed for many agents: the Space sidebar shows live state for every desk
 * it lists, and one poll for the lot beats one per row.
 */
export async function listTenantRuns(input?: {
  limit?: number;
  signal?: AbortSignal;
}): Promise<{ runs: AiAgentRunSummary[] }> {
  const query = new URLSearchParams({ limit: String(input?.limit ?? 50) });
  return await requestAiServiceJson<{ runs: AiAgentRunSummary[] }>(
    `/ai/v1/runs?${query.toString()}`,
    { signal: input?.signal }
  );
}
