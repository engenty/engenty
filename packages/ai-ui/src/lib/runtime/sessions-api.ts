// apps/ai thread/session HTTP client for admin observability and bulk deletes.
// Maps ai.agent_session rows to legacy AiAdminSessionRow for existing admin UI.

import type {
  AiAdminSessionRow,
  AiAdminSessionStats,
  AiServiceSessionMessage,
  AiServiceSessionRecord,
  AiSessionRecord,
} from "../admin/ai-runtime-types.js";
import { requestAiServiceJson } from "./ai-service-client.js";

function mapAiServiceSessionToAdminRow(
  session: AiServiceSessionRecord
): AiAdminSessionRow {
  return {
    created_at: session.created_at,
    current_agent_id: session.agent_id,
    id: session.id,
    last_action_id: null,
    last_message_at: session.updated_at,
    route_context: session.route_context,
    status: session.status,
    summary: session.summary,
    tenant_id: session.tenant_id,
    title: session.title,
    updated_at: session.updated_at,
    user_id: session.created_by_user_id,
  };
}

export function getAdminAiSessions(input?: {
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
  return requestAiServiceJson<{ sessions: AiServiceSessionRecord[] }>(
    `/ai/threads${suffix}`,
    { signal: input?.signal }
  ).then((result) => ({
    sessions: result.sessions.map(mapAiServiceSessionToAdminRow),
  }));
}

export function getAdminAiSession(threadId: string, signal?: AbortSignal) {
  return requestAiServiceJson<{ session: AiServiceSessionRecord }>(
    `/ai/threads/${encodeURIComponent(threadId)}`,
    { signal }
  ).then((result) => ({
    session: mapAiServiceSessionToAdminRow(result.session),
  }));
}

export function getAdminAiSessionMessages(
  threadId: string,
  signal?: AbortSignal
) {
  return Promise.all([
    getAdminAiSession(threadId, signal),
    requestAiServiceJson<{ messages: AiServiceSessionMessage[] }>(
      `/ai/threads/${encodeURIComponent(threadId)}/messages`,
      { signal }
    ),
  ]).then(([sessionResult, messagesResult]) => ({
    messages: messagesResult.messages.map(
      (message) => message as unknown as Record<string, unknown>
    ),
    session: sessionResult.session,
  }));
}

export function deleteAdminAiSessionsForAgent(agentId: string) {
  const query = new URLSearchParams();
  query.set("agent_id", agentId);
  return requestAiServiceJson<{ deleted: number }>(
    `/ai/threads?${query.toString()}`,
    { method: "DELETE" }
  ).then((result) => ({ deleted_count: result.deleted }));
}

export function getAdminAiSessionStats(signal?: AbortSignal) {
  return getAdminAiSessions({ limit: 200, signal }).then((result) => {
    const sessions_by_status = {
      completed: 0,
      failed: 0,
      idle: 0,
      running: 0,
      waiting: 0,
    } satisfies Record<AiSessionRecord["status"], number>;
    for (const session of result.sessions) {
      sessions_by_status[session.status] += 1;
    }
    return {
      stats: {
        last_message_at: result.sessions[0]?.updated_at ?? null,
        runs_total: 0,
        sessions_by_status,
        sessions_total: result.sessions.length,
      } satisfies AiAdminSessionStats,
    };
  });
}

export function deleteAllAdminAiSessions() {
  return requestAiServiceJson<{ deleted: number }>("/ai/threads", {
    method: "DELETE",
  }).then((result) => ({
    deleted_count: result.deleted,
    remaining_sessions: 0,
    runs_deleted_count: 0,
  }));
}

export function deleteAdminAiSession(threadId: string) {
  return requestAiServiceJson<{ ok: true }>(
    `/ai/threads/${encodeURIComponent(threadId)}`,
    { method: "DELETE" }
  ).then(() => ({ deleted: true }));
}
