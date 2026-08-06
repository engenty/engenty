// apps/ai thread HTTP client for admin observability and bulk deletes.
// Maps ai.agent_session rows to legacy AiAdminThreadRow for existing admin UI.

import type {
  AiAdminThreadRow,
  AiAdminThreadStats,
  AiServiceThreadMessage,
  AiServiceThreadRecord,
  AiThreadRecord,
} from "../admin/ai-runtime-types.js";
import { requestAiServiceJson } from "./ai-service-client.js";

function mapAiServiceThreadToAdminRow(
  thread: AiServiceThreadRecord
): AiAdminThreadRow {
  return {
    created_at: thread.created_at,
    current_agent_id: thread.agent_id,
    id: thread.id,
    last_action_id: null,
    last_message_at: thread.updated_at,
    route_context: thread.route_context,
    status: thread.status,
    summary: thread.summary,
    tenant_id: thread.tenant_id,
    title: thread.title,
    updated_at: thread.updated_at,
    user_id: thread.created_by_user_id,
  };
}

export function getAdminAiThreads(input?: {
  agentId?: string;
  limit?: number;
  signal?: AbortSignal;
  userId?: string;
}) {
  const query = new URLSearchParams();
  if (input?.agentId) {
    query.set("agent_id", input.agentId);
  }
  if (input?.limit) {
    query.set("limit", String(input.limit));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return requestAiServiceJson<{ sessions: AiServiceThreadRecord[] }>(
    `/ai/threads${suffix}`,
    { signal: input?.signal }
  ).then((result) => ({
    sessions: result.sessions.map(mapAiServiceThreadToAdminRow),
  }));
}

export function getAdminAiThread(threadId: string, signal?: AbortSignal) {
  return requestAiServiceJson<{ session: AiServiceThreadRecord }>(
    `/ai/threads/${encodeURIComponent(threadId)}`,
    { signal }
  ).then((result) => ({
    session: mapAiServiceThreadToAdminRow(result.session),
  }));
}

export function getAdminAiThreadMessages(
  threadId: string,
  signal?: AbortSignal
) {
  return Promise.all([
    getAdminAiThread(threadId, signal),
    requestAiServiceJson<{ messages: AiServiceThreadMessage[] }>(
      `/ai/threads/${encodeURIComponent(threadId)}/messages`,
      { signal }
    ),
  ]).then(([threadResult, messagesResult]) => ({
    messages: messagesResult.messages.map(
      (message) => message as unknown as Record<string, unknown>
    ),
    session: threadResult.session,
  }));
}

export function deleteAdminAiThreadsForAgent(agentId: string) {
  const query = new URLSearchParams();
  query.set("agent_id", agentId);
  return requestAiServiceJson<{ deleted: number }>(
    `/ai/threads?${query.toString()}`,
    { method: "DELETE" }
  ).then((result) => ({ deleted_count: result.deleted }));
}

export function getAdminAiThreadStats(signal?: AbortSignal) {
  return getAdminAiThreads({ limit: 200, signal }).then((result) => {
    const threads_by_status = {
      completed: 0,
      failed: 0,
      idle: 0,
      running: 0,
      waiting: 0,
    } satisfies Record<AiThreadRecord["status"], number>;
    for (const thread of result.sessions) {
      threads_by_status[thread.status] += 1;
    }
    return {
      stats: {
        last_message_at: result.sessions[0]?.updated_at ?? null,
        runs_total: 0,
        threads_by_status,
        threads_total: result.sessions.length,
      } satisfies AiAdminThreadStats,
    };
  });
}

export function deleteAllAdminAiThreads() {
  return requestAiServiceJson<{ deleted: number }>("/ai/threads", {
    method: "DELETE",
  }).then((result) => ({
    deleted_count: result.deleted,
    remaining_threads: 0,
    runs_deleted_count: 0,
  }));
}

export function deleteAdminAiThread(threadId: string) {
  return requestAiServiceJson<{ ok: true }>(
    `/ai/threads/${encodeURIComponent(threadId)}`,
    { method: "DELETE" }
  ).then(() => ({ deleted: true }));
}
