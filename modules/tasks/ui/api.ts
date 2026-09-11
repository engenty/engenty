import { requestApiEnvelope, requestApiJson } from "@engenty/api-client";
import type {
  Task,
  TaskActivity,
  TaskCheckoutInput,
  TaskComment,
  TaskCreateInput,
  TaskDetail,
  TaskReleaseInput,
  TaskRun,
  TaskSettings,
  TaskSettingsUpdateInput,
  TasksBriefingMode,
  TasksBriefingResponse,
  TasksPaginatedResponse,
  TasksQueryParams,
  TaskUpdateInput,
} from "../src/schema/types.js";

function queryString(params: TasksQueryParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function getTasks(
  params: TasksQueryParams = {},
  signal?: AbortSignal
) {
  const response = await requestApiEnvelope<
    Task[],
    { page: number; pageSize: number; total: number }
  >(`/api/tasks${queryString(params)}`, { signal });
  return {
    data: response.data,
    page: response.meta?.page ?? params.page ?? 1,
    pageSize:
      response.meta?.pageSize ?? params.pageSize ?? response.data.length,
    total: response.meta?.total ?? response.data.length,
  } satisfies TasksPaginatedResponse;
}

export function getTasksBriefing(
  mode: TasksBriefingMode = "personal",
  spaceId?: string,
  signal?: AbortSignal
) {
  const search = new URLSearchParams();
  if (mode !== "personal") {
    search.set("mode", mode);
  }
  if (spaceId) {
    search.set("space_id", spaceId);
  }
  const qs = search.toString();
  return requestApiJson<TasksBriefingResponse>(
    `/api/tasks/briefing${qs ? `?${qs}` : ""}`,
    { signal }
  );
}

export function getTask(id: string, signal?: AbortSignal) {
  return requestApiJson<TaskDetail>(`/api/tasks/${id}`, { signal });
}

export function createTask(body: TaskCreateInput, signal?: AbortSignal) {
  return requestApiJson<Task>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export function updateTask(
  id: string,
  body: TaskUpdateInput,
  signal?: AbortSignal
) {
  return requestApiJson<Task>(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    signal,
  });
}

export function deleteTask(id: string, signal?: AbortSignal) {
  return requestApiJson<void>(`/api/tasks/${id}`, {
    method: "DELETE",
    signal,
  });
}

export function getTaskSettings(signal?: AbortSignal) {
  return requestApiJson<TaskSettings>("/api/tasks/settings", { signal });
}

export function updateTaskSettings(
  body: TaskSettingsUpdateInput,
  signal?: AbortSignal
) {
  return requestApiJson<TaskSettings>("/api/tasks/settings", {
    method: "PUT",
    body: JSON.stringify(body),
    signal,
  });
}

export function addTaskComment(
  id: string,
  content: string,
  signal?: AbortSignal
) {
  return requestApiJson<TaskComment>(`/api/tasks/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
    signal,
  });
}

export function checkoutTask(
  id: string,
  body: TaskCheckoutInput,
  signal?: AbortSignal
) {
  return requestApiJson<Task>(`/api/tasks/${id}/checkout`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export function releaseTask(
  id: string,
  body: TaskReleaseInput = {},
  signal?: AbortSignal
) {
  return requestApiJson<Task>(`/api/tasks/${id}/release`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export interface RunTaskNowResponse {
  /** True only when this request actually put work on the durable queue. */
  dispatched: boolean;
  outcome: "already_running" | "blocked" | "not_dispatchable" | "queued";
  task: Task;
}

/**
 * Queue an agent run for this task on the durable dispatch path — the same
 * engine routines and the coordinator use, so the run survives a reload,
 * appears in run history, and is recoverable by the reaper.
 */
export function runTaskNow(id: string, signal?: AbortSignal) {
  return requestApiJson<RunTaskNowResponse>(`/api/tasks/${id}/run`, {
    method: "POST",
    signal,
  });
}

export interface ResolveToolApprovalBody {
  decision: "approve" | "deny";
  /** Single-op form. Exactly one of operation_id / operation_ids. */
  operation_id?: string;
  /** Batch form ("Allow all"): resolve several pending ops at once (cap 64). */
  operation_ids?: string[];
  scope?: "once" | "task";
}

/** Approve or deny a pending tool approval on a task (durable HITL). */
export function resolveTaskToolApproval(
  id: string,
  body: ResolveToolApprovalBody,
  signal?: AbortSignal
) {
  return requestApiJson<Task>(`/api/tasks/${id}/tool-approvals`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

/** Revoke an approved tool from a task (grants live in the core store). */
export function revokeTaskApprovalGrant(
  id: string,
  operationId: string,
  signal?: AbortSignal
) {
  return requestApiJson<Task>(`/api/tasks/${id}/approval-grants/revoke`, {
    method: "POST",
    body: JSON.stringify({ operation_id: operationId }),
    signal,
  });
}

export function getTaskRuns(id: string, signal?: AbortSignal) {
  return requestApiJson<TaskRun[]>(`/api/tasks/${id}/runs`, {
    signal,
  });
}

export function getTaskActivity(id: string, signal?: AbortSignal) {
  return requestApiJson<TaskActivity[]>(`/api/tasks/${id}/activity`, {
    signal,
  });
}

export async function getUserDisplayName(
  userId: string,
  signal?: AbortSignal
): Promise<{ id: string; full_name: string } | null> {
  try {
    const response = await requestApiJson<{
      id: string;
      display_name: string | null;
    }>(`/api/users/${encodeURIComponent(userId)}`, { signal });
    if (!response?.id) {
      return null;
    }
    return { id: response.id, full_name: response.display_name ?? "" };
  } catch {
    return null;
  }
}

/** A space as the work overview needs it: to group rows and link into it. */
export interface SpaceRef {
  id: string;
  key: string;
  name: string;
}

/**
 * The spaces the caller may see, in rail order. Read from core's own
 * `/api/spaces`: the module needs names and keys for display, not a copy of
 * the concept.
 */
export async function getSpaces(signal?: AbortSignal): Promise<SpaceRef[]> {
  const spaces = await requestApiJson<SpaceRef[]>("/api/spaces", {
    method: "GET",
    signal,
  });
  return Array.isArray(spaces) ? spaces : [];
}
