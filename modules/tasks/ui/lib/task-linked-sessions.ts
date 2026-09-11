import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";

export interface TaskLinkedSessionRow {
  agent_type_key: string;
  id: string;
  /**
   * `agent` = an executor's working memory on this task (headless, nobody
   * owns it, opened read-only). `chat` = somebody's copilot session that named
   * this task. Two different objects; the panel must not pretend otherwise.
   */
  kind: "agent" | "chat";
  title: string | null;
  updated_at: string;
  workspace_key: string | null;
}

interface AiSessionListResponse {
  sessions: Array<{
    agent_id?: string;
    /** Pre-thread-rename compatibility for older AI deployments. */
    agent_type_key?: string;
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

function toRow(
  session: AiSessionListResponse["sessions"][number],
  kind: TaskLinkedSessionRow["kind"]
): TaskLinkedSessionRow {
  return {
    agent_type_key: session.agent_id ?? session.agent_type_key ?? "",
    id: session.id,
    kind,
    title: session.title,
    updated_at: session.updated_at,
    workspace_key: session.workspace_key,
  };
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
    .map((session) => toRow(session, "chat"));
}

/**
 * Merge the two sources, agent threads first — the executor's own record is
 * what someone opening a task is looking for, and there are at most a handful
 * (one per agent that has held it). Deduped by id: a thread can satisfy both
 * queries once a person's chat is bound to the same task.
 */
export function mergeTaskLinkedSessions(
  agentThreads: TaskLinkedSessionRow[],
  chatSessions: TaskLinkedSessionRow[],
  limit = 5
): TaskLinkedSessionRow[] {
  const seen = new Set<string>();
  const merged: TaskLinkedSessionRow[] = [];
  for (const row of [...agentThreads, ...chatSessions]) {
    if (seen.has(row.id)) {
      continue;
    }
    seen.add(row.id);
    merged.push(row);
  }
  return merged.slice(0, limit);
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
  const authToken = (await getCurrentAccessToken()) ?? undefined;
  const request = { authToken, baseUrl, signal: input.signal };
  // The task's agent threads have no owner and no participants, so the thread
  // list — which joins on participation — can never return them. They come
  // from their own task-gated route.
  const [agentThreads, chatSessions] = await Promise.all([
    requestApiJson<AiSessionListResponse>(
      `/ai/v1/tasks/${encodeURIComponent(input.taskId)}/threads`,
      request
    ).catch(() => null),
    requestApiJson<AiSessionListResponse>(
      `/ai/threads?limit=${Math.max(input.limit ?? 5, 25)}`,
      request
    ).catch(() => null),
  ]);
  return mergeTaskLinkedSessions(
    (agentThreads?.sessions ?? []).map((session) => toRow(session, "agent")),
    filterTaskLinkedSessions(chatSessions?.sessions ?? [], input),
    input.limit ?? 5
  );
}
