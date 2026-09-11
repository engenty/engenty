import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";

export type TaskAgentRunStatus =
  | "cancelled"
  | "failed"
  | "queued"
  | "running"
  | "succeeded"
  | "timed_out"
  | "waiting_for_approval"
  | "waiting_for_input";

export interface TaskAgentRunDetail {
  agent_type_key: string;
  context_snapshot: Record<string, unknown>;
  error: string | null;
  finished_at: string | null;
  id: string;
  session_id: string | null;
  started_at: string | null;
  status: TaskAgentRunStatus;
}

function resolveAiServiceBaseUrl(): string | null {
  const raw = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.VITE_ENGENTY_AI_BASE_URL;
  const normalized = (raw ?? "").trim().replace(/\/$/, "");
  return normalized.length > 0 ? normalized : null;
}

export function isTaskRunObserverPollingStatus(
  status: string | null | undefined
): boolean {
  return (
    status === "queued" ||
    status === "running" ||
    status === "waiting_for_approval" ||
    status === "waiting_for_input"
  );
}

export async function fetchTaskAgentRunDetail(
  runId: string,
  signal?: AbortSignal
): Promise<TaskAgentRunDetail> {
  const baseUrl = resolveAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  const result = await requestApiJson<{ run: TaskAgentRunDetail }>(
    `/ai/v1/runs/${encodeURIComponent(runId)}`,
    {
      authToken: (await getCurrentAccessToken()) ?? undefined,
      baseUrl,
      signal,
    }
  );
  return result.run;
}

export async function cancelTaskAgentRun(
  runId: string,
  input?: { reason?: string },
  signal?: AbortSignal
): Promise<TaskAgentRunDetail> {
  const baseUrl = resolveAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  const result = await requestApiJson<{ run: TaskAgentRunDetail }>(
    `/ai/v1/runs/${encodeURIComponent(runId)}/cancel`,
    {
      authToken: (await getCurrentAccessToken()) ?? undefined,
      baseUrl,
      body: JSON.stringify(input ?? {}),
      method: "POST",
      signal,
    }
  );
  return result.run;
}

/**
 * Hand a just-saved comment to the run executing this task right now.
 *
 * `false` for every "it did not land" reason — no live run, another replica,
 * the service unreachable — so the caller falls back to parking it for the next
 * dispatch. Never throws: the comment is already on the task, and failing this
 * must not look like failing to comment.
 */
export async function deliverCommentToLiveRun(
  taskId: string,
  content: string,
  signal?: AbortSignal
): Promise<boolean> {
  const baseUrl = resolveAiServiceBaseUrl();
  if (!baseUrl) {
    return false;
  }
  try {
    const result = await requestApiJson<{ delivered?: boolean }>(
      `/ai/v1/tasks/${encodeURIComponent(taskId)}/deliver`,
      {
        authToken: (await getCurrentAccessToken()) ?? undefined,
        baseUrl,
        body: JSON.stringify({ content }),
        method: "POST",
        signal,
      }
    );
    return result.delivered === true;
  } catch {
    return false;
  }
}

export function readRunInitialPrompt(
  contextSnapshot: Record<string, unknown> | null | undefined
): string | null {
  if (!contextSnapshot) {
    return null;
  }
  const messages = contextSnapshot.messages;
  if (!Array.isArray(messages)) {
    return null;
  }
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }
    const record = message as Record<string, unknown>;
    if (record.role !== "user") {
      continue;
    }
    const content = record.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const text = content
        .map((part) => {
          if (!part || typeof part !== "object") {
            return "";
          }
          const typed = part as Record<string, unknown>;
          return typeof typed.text === "string" ? typed.text : "";
        })
        .join("")
        .trim();
      if (text) {
        return text;
      }
    }
  }
  return null;
}
