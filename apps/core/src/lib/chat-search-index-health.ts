/** Index health for agent/session search (not returned from the HTTP search route). */

export type ChatSearchIndexHealthLevel = "degraded" | "missing" | "ok";

export interface ChatSearchIndexHealth {
  level: ChatSearchIndexHealthLevel;
  ok: boolean;
}

export interface ChatSearchIndexHealthInput {
  document_count: number;
  missing_session_count: number;
  total_sessions: number;
}

export function evaluateChatSearchIndexHealth(
  status: ChatSearchIndexHealthInput
): ChatSearchIndexHealth {
  if (status.total_sessions === 0) {
    return { level: "ok", ok: true };
  }
  if (status.document_count === 0) {
    return { level: "missing", ok: false };
  }
  if (status.missing_session_count > 0) {
    return { level: "degraded", ok: false };
  }
  return { level: "ok", ok: true };
}
