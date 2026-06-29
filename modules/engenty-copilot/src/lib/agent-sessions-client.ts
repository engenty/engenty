import {
  appsAiRequestHeaders,
  appsAiThreadsPath,
  buildAppsAiHttpError,
  withAppsAiSearchParams,
} from "./agent-api-shared.js";
import type { AgentSessionDto } from "./agent-session-types.js";

export async function createAgentSession(params: {
  agentId: string;
  serviceBaseUrl: string;
  signal?: AbortSignal;
  tenantId: string;
  title?: string | null;
  userId: string;
}): Promise<AgentSessionDto> {
  void params.tenantId;
  void params.userId;
  const res = await fetch(appsAiThreadsPath(params.serviceBaseUrl), {
    body: JSON.stringify({
      agent_id: params.agentId,
      title: params.title ?? null,
    }),
    headers: await appsAiRequestHeaders(),
    method: "POST",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw buildAppsAiHttpError("ai session create", res.status, raw);
  }
  const parsed = JSON.parse(raw) as { session?: unknown };
  if (!parsed.session || typeof parsed.session !== "object") {
    throw new Error("ai session create: missing session object");
  }
  return parsed.session as AgentSessionDto;
}

export async function getAgentSession(params: {
  serviceBaseUrl: string;
  threadId: string;
  signal?: AbortSignal;
  tenantId: string;
  userId: string;
}): Promise<AgentSessionDto> {
  void params.tenantId;
  void params.userId;
  const href = `${appsAiThreadsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.threadId)}`;
  const res = await fetch(href, {
    headers: await appsAiRequestHeaders(),
    method: "GET",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw buildAppsAiHttpError("ai session get", res.status, raw);
  }
  const parsed = JSON.parse(raw) as { session?: unknown };
  if (!parsed.session || typeof parsed.session !== "object") {
    throw new Error("ai session get: missing session object");
  }
  return parsed.session as AgentSessionDto;
}

export async function listAgentSessions(params: {
  agentId?: string | null;
  hostKey?: string | null;
  includeArchived?: boolean;
  limit?: number;
  serviceBaseUrl: string;
  signal?: AbortSignal;
  tenantId: string;
  userId: string;
}): Promise<AgentSessionDto[]> {
  void params.tenantId;
  void params.userId;
  const search = new URLSearchParams();
  const agentId = params.agentId?.trim();
  if (agentId) {
    search.set("agent_id", agentId);
  }
  const hostKey = params.hostKey?.trim();
  if (hostKey) {
    search.set("host_key", hostKey);
  }
  if (params.includeArchived) {
    search.set("include_archived", "true");
  }
  if (params.limit != null) {
    search.set("limit", String(params.limit));
  }
  const href = withAppsAiSearchParams(
    appsAiThreadsPath(params.serviceBaseUrl),
    search
  );
  const res = await fetch(href, {
    headers: await appsAiRequestHeaders(),
    method: "GET",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw buildAppsAiHttpError("ai sessions list", res.status, raw);
  }
  const parsed = JSON.parse(raw) as { sessions?: unknown };
  if (!Array.isArray(parsed.sessions)) {
    throw new Error("ai sessions list: missing sessions array");
  }
  return parsed.sessions as AgentSessionDto[];
}

export async function updateAgentSession(params: {
  agentId: string;
  serviceBaseUrl: string;
  threadId: string;
  signal?: AbortSignal;
  tenantId: string;
  userId: string;
}): Promise<AgentSessionDto> {
  void params.tenantId;
  void params.userId;
  const href = `${appsAiThreadsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.threadId)}`;
  const res = await fetch(href, {
    body: JSON.stringify({ agent_id: params.agentId }),
    headers: await appsAiRequestHeaders(),
    method: "PATCH",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw buildAppsAiHttpError("ai session update", res.status, raw);
  }
  const parsed = JSON.parse(raw) as { session?: unknown };
  if (!parsed.session || typeof parsed.session !== "object") {
    throw new Error("ai session update: missing session object");
  }
  return parsed.session as AgentSessionDto;
}

export async function deleteAgentSession(params: {
  serviceBaseUrl: string;
  threadId: string;
  signal?: AbortSignal;
  tenantId: string;
  userId: string;
}): Promise<void> {
  void params.tenantId;
  void params.userId;
  const href = `${appsAiThreadsPath(params.serviceBaseUrl)}/${encodeURIComponent(params.threadId)}`;
  const res = await fetch(href, {
    headers: await appsAiRequestHeaders(),
    method: "DELETE",
    signal: params.signal,
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw buildAppsAiHttpError("ai session delete", res.status, raw);
  }
}

export async function deleteAgentSessions(params: {
  agentId?: string | null;
  serviceBaseUrl: string;
  signal?: AbortSignal;
  tenantId: string;
  userId: string;
}): Promise<void> {
  void params.tenantId;
  void params.userId;
  const search = new URLSearchParams();
  const agentId = params.agentId?.trim();
  if (agentId) {
    search.set("agent_id", agentId);
  }
  const href = withAppsAiSearchParams(
    appsAiThreadsPath(params.serviceBaseUrl),
    search
  );
  const res = await fetch(href, {
    headers: await appsAiRequestHeaders(),
    method: "DELETE",
    signal: params.signal,
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw buildAppsAiHttpError("ai sessions delete", res.status, raw);
  }
}
