import {
  getApiBaseUrl,
  requestApiEnvelope,
  requestApiJson,
} from "@engenty/api-client";

export type { TaskStatusColor } from "../src/schema/task-status-colors.js";
export { TASK_STATUS_COLOR_OPTIONS } from "../src/schema/task-status-colors.js";

export type ProjectMemberRole =
  | "project-lead"
  | "project-member"
  | "project-external";

export interface ProjectTeamMemberRow {
  project_id: string;
  role: ProjectMemberRole;
  role_name: string | null;
  user_id: string;
}

export interface ProjectListItem {
  briefing: string | null;
  client_id: string | null;
  client_name: string | null;
  created_at: string;
  created_by: string | null;
  enabled_tabs?: string[] | null;
  end_date: string | null;
  id: string;
  lead_id: string | null;
  portal_enabled: boolean;
  portal_intro_text?: string | null;
  portal_password?: string | null;
  project_team?: ProjectTeamMemberRow[];
  scope_id: string;
  start_date: string | null;
  tenant_id: string;
  title: string;
  updated_at: string;
}

export interface ProjectPhase {
  created_at: string;
  end_date: string | null;
  id: string;
  is_main: boolean;
  is_public: boolean;
  order_index: number;
  project_id: string;
  start_date: string | null;
  title: string;
  updated_at: string;
}

export interface TaskTeamMember {
  profile?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
  task_id: string;
  user_id: string;
}

export interface ProjectTaskStatusDefinition {
  color: import("../src/schema/task-status-colors.js").TaskStatusColor;
  id: string;
  label: string;
  locked?: boolean;
}

export interface PhaseTask {
  content: string | null;
  created_at: string;
  discipline: string | null;
  hours: number | null;
  id: string;
  is_public: boolean;
  order_index: number;
  phase_id: string | null;
  project_id: string;
  status: string;
  task_team?: TaskTeamMember[];
  title: string;
  updated_at: string;
}

export type ProjectWithPhasesAndTasks = ProjectListItem & {
  phases: (ProjectPhase & { tasks: PhaseTask[] })[];
  general_tasks: PhaseTask[];
};

export interface ProjectCreateInput {
  briefing?: string | null;
  client_id: string | null;
  client_name: string | null;
  created_by?: string | null;
  enabled_tabs?: string[] | null;
  end_date?: string | null;
  lead_id?: string | null;
  portal_enabled?: boolean;
  portal_intro_text?: string | null;
  portal_password?: string | null;
  start_date?: string | null;
  team_member_ids?: string[];
  title: string;
}

export interface ProjectTeamMemberUpdate {
  role?: ProjectMemberRole;
  role_name?: string | null;
  user_id: string;
}

export type ProjectUpdateInput = Partial<
  Omit<ProjectCreateInput, "client_id">
> & {
  project_team?: ProjectTeamMemberUpdate[];
};

export interface ProjectsQueryParams {
  client_id?: string;
  lead_id?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: "title" | "start_date" | "end_date" | "created_at";
  sortOrder?: "asc" | "desc";
}

export interface ProjectsPaginatedResponse {
  data: ProjectListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ProjectSettings {
  briefing_overdue_days: number;
  default_task_statuses: string[];
  task_status_definitions: ProjectTaskStatusDefinition[];
}

export type ProjectsBriefingMode = "personal" | "oversight";

export interface ProjectsBriefingSummary {
  blocked_items: number;
  due_this_week: number;
  stale_items: number;
  waiting_items: number;
}

export interface ProjectsBriefingResponse {
  attention_items: {
    id: string;
    project_id: string;
    project_title: string;
    reason: string;
    title: string;
  }[];
  focus_items: {
    id: string;
    project_id: string;
    project_title: string;
    reason: string;
    status: PhaseTask["status"];
    title: string;
    updated_at: string;
  }[];
  mode: ProjectsBriefingMode;
  overdue_days: number;
  stale_items: {
    id: string;
    project_id: string;
    project_title: string;
    reason: string;
    title: string;
  }[];
  suggested_actions: { href?: string; id: string; label: string }[];
  summary: ProjectsBriefingSummary;
  waiting_items: {
    id: string;
    project_id: string;
    project_title: string;
    reason: string;
    title: string;
  }[];
}

export interface ProjectTasksQueryParams {
  assigned_to?: string;
  page?: number;
  pageSize?: number;
  phase_id?: string;
  project_id?: string;
  scope?: "mine" | "all";
  search?: string;
  sortBy?: "updated_at" | "created_at" | "title" | "status";
  sortOrder?: "asc" | "desc";
  status?: string;
}

export interface ProjectTaskListItem extends PhaseTask {
  client_name: string | null;
  phase_title: string | null;
  project_title: string;
}

export interface ProjectTasksPaginatedResponse {
  data: ProjectTaskListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export type ProjectTaskCountsByStatus = Record<string, number | undefined>;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return await requestApiJson<T>(path, init);
}

function buildQuery(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") {
      searchParams.set(k, String(v));
    }
  }
  const q = searchParams.toString();
  return q ? `?${q}` : "";
}

export async function getProjects(
  params: ProjectsQueryParams = {},
  signal?: AbortSignal
) {
  const response = await requestApiEnvelope<
    ProjectListItem[],
    { page: number; pageSize: number; total: number }
  >(`/api/projects${buildQuery(params as Record<string, unknown>)}`, {
    method: "GET",
    signal,
  });
  return {
    data: response.data,
    page: response.meta?.page ?? params.page ?? 1,
    pageSize:
      response.meta?.pageSize ?? params.pageSize ?? response.data.length,
    total: response.meta?.total ?? response.data.length,
  } satisfies ProjectsPaginatedResponse;
}

export async function getProject(id: string, signal?: AbortSignal) {
  return request<ProjectWithPhasesAndTasks>(`/api/projects/${id}`, {
    method: "GET",
    signal,
  });
}

export async function createProject(input: ProjectCreateInput) {
  return request<ProjectListItem>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProject(id: string, patch: ProjectUpdateInput) {
  return request<ProjectListItem>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteProject(
  id: string,
  options?: { deleteTasks?: boolean }
) {
  const query = options?.deleteTasks ? "?delete_tasks=true" : "";
  return request<{ ok: boolean; id: string }>(`/api/projects/${id}${query}`, {
    method: "DELETE",
  });
}

export async function createPhase(
  projectId: string,
  input: Omit<ProjectPhase, "id" | "project_id" | "created_at" | "updated_at">
) {
  return request<ProjectPhase>(`/api/projects/${projectId}/phases`, {
    method: "POST",
    body: JSON.stringify({ ...input, project_id: projectId }),
  });
}

export async function updatePhase(
  projectId: string,
  phaseId: string,
  patch: Partial<ProjectPhase>
) {
  return request<ProjectPhase>(`/api/projects/${projectId}/phases/${phaseId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deletePhase(projectId: string, phaseId: string) {
  return request<{ ok: boolean }>(
    `/api/projects/${projectId}/phases/${phaseId}`,
    {
      method: "DELETE",
    }
  );
}

export async function updatePhaseVisibility(
  projectId: string,
  phaseId: string,
  is_public: boolean
) {
  return request<ProjectPhase>(
    `/api/projects/${projectId}/phases/${phaseId}/visibility`,
    {
      method: "PUT",
      body: JSON.stringify({ is_public }),
    }
  );
}

export async function createTask(
  projectId: string,
  input: Omit<
    PhaseTask,
    "id" | "project_id" | "created_at" | "updated_at" | "task_team"
  > & { team_member_ids?: string[] }
) {
  return request<PhaseTask>(`/api/projects/${projectId}/tasks`, {
    method: "POST",
    body: JSON.stringify({ ...input, project_id: projectId }),
  });
}

export async function updateTask(
  projectId: string,
  taskId: string,
  patch: Partial<
    Omit<
      PhaseTask,
      "id" | "project_id" | "created_at" | "updated_at" | "task_team"
    >
  > & { team_member_ids?: string[] }
) {
  return request<PhaseTask>(`/api/projects/${projectId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteTask(projectId: string, taskId: string) {
  return request<{ ok: boolean }>(
    `/api/projects/${projectId}/tasks/${taskId}`,
    {
      method: "DELETE",
    }
  );
}

export async function updateTaskVisibility(
  projectId: string,
  taskId: string,
  is_public: boolean
) {
  return request<PhaseTask>(
    `/api/projects/${projectId}/tasks/${taskId}/visibility`,
    {
      method: "PUT",
      body: JSON.stringify({ is_public }),
    }
  );
}

export async function getTasks(
  params: ProjectTasksQueryParams = {},
  signal?: AbortSignal
): Promise<ProjectTasksPaginatedResponse> {
  const response = await requestApiEnvelope<
    ProjectTaskListItem[],
    { page: number; pageSize: number; total: number }
  >(`/api/projects/tasks${buildQuery(params as Record<string, unknown>)}`, {
    method: "GET",
    signal,
  });
  return {
    data: response.data ?? [],
    page: response.meta?.page ?? params.page ?? 1,
    pageSize:
      response.meta?.pageSize ?? params.pageSize ?? response.data?.length ?? 0,
    total: response.meta?.total ?? response.data?.length ?? 0,
  } satisfies ProjectTasksPaginatedResponse;
}

export async function getTaskCounts(
  params: Omit<
    ProjectTasksQueryParams,
    "page" | "pageSize" | "sortBy" | "sortOrder"
  > = {},
  signal?: AbortSignal
): Promise<ProjectTaskCountsByStatus> {
  return request<ProjectTaskCountsByStatus>(
    `/api/projects/tasks/counts${buildQuery(params as Record<string, unknown>)}`,
    { method: "GET", signal }
  );
}

export async function getProjectSettings(signal?: AbortSignal) {
  return request<ProjectSettings>("/api/projects/settings", {
    method: "GET",
    signal,
  });
}

export async function setProjectSettings(input: ProjectSettings) {
  return request<ProjectSettings>("/api/projects/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function getProjectsBriefing(
  params: { mode?: ProjectsBriefingMode } = {},
  signal?: AbortSignal
): Promise<ProjectsBriefingResponse> {
  const qp = new URLSearchParams();
  if (params.mode) {
    qp.set("mode", params.mode);
  }
  const qs = qp.toString();
  return request<ProjectsBriefingResponse>(
    `/api/projects/briefing${qs ? `?${qs}` : ""}`,
    { method: "GET", signal }
  );
}

// Portal (unauthenticated or portal session)
export interface PortalProjectInfo {
  entity: { display_name: string } | null;
  id: string;
  password_required: boolean;
  portal_intro_text: string | null;
  title: string;
}

export interface PortalPhase {
  end_date: string | null;
  id: string;
  order_index: number;
  start_date: string | null;
  tasks: PortalTask[];
  title: string;
}

export interface PortalTask {
  content: string | null;
  created_at: string;
  discipline: string | null;
  hours: number | null;
  id: string;
  order_index: number;
  status: string;
  title: string;
}

async function portalRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function verifyPortalPassword(
  projectId: string,
  password: string
) {
  return portalRequest<{ verified: boolean }>(
    `/api/portal/${projectId}/verify`,
    {
      method: "POST",
      body: JSON.stringify({ password }),
    }
  );
}

export async function getPortalProjectInfo(projectId: string) {
  return portalRequest<PortalProjectInfo>(`/api/portal/${projectId}`);
}

export async function getPortalPhasesAndTasks(projectId: string) {
  return portalRequest<{ phases: PortalPhase[]; general_tasks: PortalTask[] }>(
    `/api/portal/${projectId}/phases-tasks`
  );
}

export async function createPortalRequest(
  projectId: string,
  input: { title: string; content?: string }
) {
  return portalRequest<PhaseTask>(`/api/portal/${projectId}/requests`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
