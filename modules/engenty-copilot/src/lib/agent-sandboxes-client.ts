import {
  appsAiRequestHeaders,
  buildAppsAiHttpError,
  normalizeAppsAiServiceBaseUrl,
} from "./agent-api-shared.js";

export interface AgentSandboxDto {
  container_id: string;
  container_name: string;
  lifecycle: "session" | "run" | "task";
  sandbox_id: string;
  scope_key: string;
  state: string;
  thread_id: string | null;
  title: string | null;
}

function appsAiSandboxesPath(serviceBaseUrl: string): string {
  return `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}/ai/sandboxes`;
}

export async function listAgentSandboxes(params: {
  serviceBaseUrl: string;
  signal?: AbortSignal;
  tenantId: string;
  userId: string;
}): Promise<AgentSandboxDto[]> {
  void params.tenantId;
  void params.userId;
  const res = await fetch(appsAiSandboxesPath(params.serviceBaseUrl), {
    headers: await appsAiRequestHeaders(),
    method: "GET",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw buildAppsAiHttpError("ai sandboxes list", res.status, raw);
  }
  const parsed = JSON.parse(raw) as { sandboxes?: unknown };
  if (!Array.isArray(parsed.sandboxes)) {
    throw new Error("ai sandboxes list: missing sandboxes array");
  }
  return parsed.sandboxes as AgentSandboxDto[];
}

export async function destroyAgentSandboxes(params: {
  sandboxIds?: readonly string[];
  serviceBaseUrl: string;
  signal?: AbortSignal;
  tenantId: string;
  userId: string;
}): Promise<{ destroyed: number }> {
  void params.tenantId;
  void params.userId;
  const res = await fetch(appsAiSandboxesPath(params.serviceBaseUrl), {
    body: JSON.stringify(
      params.sandboxIds?.length ? { sandbox_ids: [...params.sandboxIds] } : {}
    ),
    headers: await appsAiRequestHeaders(),
    method: "DELETE",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw buildAppsAiHttpError("ai sandboxes destroy", res.status, raw);
  }
  const parsed = JSON.parse(raw) as { destroyed?: unknown };
  return {
    destroyed:
      typeof parsed.destroyed === "number" && Number.isFinite(parsed.destroyed)
        ? parsed.destroyed
        : 0,
  };
}
