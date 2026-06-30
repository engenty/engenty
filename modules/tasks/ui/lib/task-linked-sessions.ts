import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";

export interface TaskLinkedSessionRow {
  agent_type_key: string;
  id: string;
  title: string | null;
  updated_at: string;
  workspace_key: string | null;
}

interface AiSessionListResponse {
  sessions: Array<{
    agent_type_key: string;
    id: string;
    route_context?: Record<string, unknown>;
    title: string | null;
    updated_at: string;
    workspace_key: string | null;
  }>;
}

function resolveAiServiceBaseUrl(): string | null {
  const raw = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.VITE_ENGENTY_AI_BASE_URL;
  const normalized = (raw ?? "").trim().replace(/\/$/, "");
  return normalized.length > 0 ? normalized : null;
}

function readTaskIdFromRouteContext(
  routeContext: Record<string, unknown> | undefined
): string | null {
  if (!routeContext) {
    return null;
  }
  const scope =
    routeContext.scope &&
    typeof routeContext.scope === "object" &&
    !Array.isArray(routeContext.scope)
      ? (routeContext.scope as Record<string, unknown>)
      : routeContext;
  for (const key of ["task_id", "entity_id", "entityId"] as const) {
    const value = scope[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function filterTaskLinkedSessions(
  sessions: AiSessionListResponse["sessions"],
  input: { limit?: number; taskId: string; workspaceKey: string }
): TaskLinkedSessionRow[] {
  const limit = input.limit ?? 5;
  return sessions
    .filter((session) => {
      if (session.workspace_key === input.workspaceKey) {
        return true;
      }
      return readTaskIdFromRouteContext(session.route_context) === input.taskId;
    })
    .slice(0, limit)
    .map((session) => ({
      agent_type_key: session.agent_type_key,
      id: session.id,
      title: session.title,
      updated_at: session.updated_at,
      workspace_key: session.workspace_key,
    }));
}

export async function fetchTaskLinkedSessions(input: {
  limit?: number;
  signal?: AbortSignal;
  taskId: string;
  workspaceKey: string;
}): Promise<TaskLinkedSessionRow[]> {
  const baseUrl = resolveAiServiceBaseUrl();
  if (!baseUrl) {
    return [];
  }
  const response = await requestApiJson<AiSessionListResponse>(
    `/ai/threads?limit=${Math.max(input.limit ?? 5, 25)}`,
    {
      authToken: (await getCurrentAccessToken()) ?? undefined,
      baseUrl,
      signal: input.signal,
    }
  );
  return filterTaskLinkedSessions(response.sessions ?? [], input);
}
