import {
  agentRequestHeaders,
  threadsPath,
  withSearchParams,
} from "./agent-api-shared.js";
import type { AgentThreadMessageDto } from "./agent-thread-types.js";

export async function listAgentThreadMessages(params: {
  limit?: number;
  serviceBaseUrl: string;
  threadId: string;
  signal?: AbortSignal;
  tenantId: string;
  userId: string;
}): Promise<AgentThreadMessageDto[]> {
  const search = new URLSearchParams();
  if (params.limit != null) {
    search.set("limit", String(params.limit));
  }
  const href = withSearchParams(
    `${threadsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.threadId)}/messages`,
    search
  );
  const res = await fetch(href, {
    method: "GET",
    headers: await agentRequestHeaders(),
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `ai thread messages HTTP ${res.status}: ${raw.slice(0, 500)}`
    );
  }
  const parsed = JSON.parse(raw) as { messages?: unknown };
  if (!Array.isArray(parsed.messages)) {
    throw new Error("ai thread messages: missing messages array");
  }
  return parsed.messages as AgentThreadMessageDto[];
}
