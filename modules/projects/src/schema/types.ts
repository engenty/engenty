export type { TaskStatusColor } from "./task-status-colors.js";

/** Task workflow status id; allowed ids come from tenant project settings. */
export type TaskStatus = string;

export interface ProjectTaskStatusDefinition {
  color: import("./task-status-colors.js").TaskStatusColor;
  id: string;
  label: string;
  locked?: boolean;
}

export type ProjectMemberRole =
  | "project-lead"
  | "project-member"
  | "project-external";

/** Team member stored on project (opaque user_id; same id space as task_team.user_id). */
export interface ProjectTeamMember {
  project_id: string;
  role: ProjectMemberRole;
  role_name: string | null;
  user_id: string;
}

export interface Project {
  briefing: string | null;
  client_id: string | null;
  client_name: string | null;
  created_at: string;
  created_by: string | null;
  /** Ordered ids of the detail tabs the user keeps shown; null = module default. */
  enabled_tabs?: string[] | null;
  end_date: string | null;
  id: string;
  lead_id: string | null;
  portal_enabled: boolean;
  portal_intro_text: string | null;
  portal_password: string | null;
  /** Present on list/detail API responses when loaded with join. */
  project_team?: ProjectTeamMember[];
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
  scope_id: string;
  start_date: string | null;
  tenant_id: string;
  title: string;
  updated_at: string;
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
  scope_id: string;
  status: TaskStatus;
  task_team?: { task_id: string; user_id: string; profile?: any }[];
  tenant_id: string;
  title: string;
  updated_at: string;
}

export type ProjectInput = Omit<
  Project,
  "id" | "tenant_id" | "scope_id" | "created_at" | "updated_at" | "project_team"
> & {
  team_member_ids?: string[];
};

export interface ProjectTeamMemberUpdate {
  role?: ProjectMemberRole;
  role_name?: string | null;
  user_id: string;
}

export type ProjectUpdateInput = Partial<
  Omit<
    Project,
    | "id"
    | "tenant_id"
    | "scope_id"
    | "created_at"
    | "updated_at"
    | "project_team"
  >
> & {
  project_team?: ProjectTeamMemberUpdate[];
  team_member_ids?: string[];
};

export type ProjectPhaseInput = Omit<
  ProjectPhase,
  "id" | "tenant_id" | "scope_id" | "created_at" | "updated_at"
>;

export type ProjectPhaseUpdateInput = Partial<
  Omit<ProjectPhaseInput, "project_id">
>;

export type PhaseTaskInput = Omit<
  PhaseTask,
  "id" | "tenant_id" | "scope_id" | "created_at" | "updated_at" | "task_team"
> & {
  team_member_ids?: string[];
};

export type PhaseTaskUpdateInput = Partial<Omit<PhaseTaskInput, "project_id">>;

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
  data: Project[];
  page: number;
  pageSize: number;
  total: number;
}

export type ProjectWithPhasesAndTasks = Project & {
  phases: (ProjectPhase & { tasks: PhaseTask[] })[];
  general_tasks: PhaseTask[];
};

export interface ProjectSettings {
  /** Days without meaningful task movement before briefing "Forgotten/stale" (default 7). */
  briefing_overdue_days: number;
  /** Ordered status ids (same order as task_status_definitions). */
  default_task_statuses: string[];
  /** Labels and colors for the status dropdown and task UI. */
  task_status_definitions: ProjectTaskStatusDefinition[];
}

export type ProjectSettingsInput = Partial<ProjectSettings>;

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
  status?: TaskStatus;
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

export type ProjectsBriefingMode = "personal" | "oversight";

export interface BriefingTaskItem {
  id: string;
  project_id: string;
  project_title: string;
  reason: string;
  status: TaskStatus;
  title: string;
  updated_at: string;
}

export interface BriefingAttentionItem {
  id: string;
  project_id: string;
  project_title: string;
  reason: string;
  title: string;
}

export interface BriefingWaitingItem {
  id: string;
  project_id: string;
  project_title: string;
  reason: string;
  title: string;
}

export interface BriefingStaleItem {
  id: string;
  project_id: string;
  project_title: string;
  reason: string;
  title: string;
}

export interface BriefingSuggestedAction {
  href?: string;
  id: string;
  label: string;
}

export interface ProjectsBriefingResponse {
  attention_items: BriefingAttentionItem[];
  focus_items: BriefingTaskItem[];
  mode: ProjectsBriefingMode;
  overdue_days: number;
  stale_items: BriefingStaleItem[];
  suggested_actions: BriefingSuggestedAction[];
  summary: {
    blocked_items: number;
    due_this_week: number;
    stale_items: number;
    waiting_items: number;
  };
  waiting_items: BriefingWaitingItem[];
}
