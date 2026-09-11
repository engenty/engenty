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
  /**
   * Space the project runs inside (PLAN-spaces.md). A project is an EPISODE;
   * the space is what persists when it ends. REQUIRED since Phase 6 — the
   * column is `not null` and creates resolve the tenant default when the
   * caller names no space.
   */
  space_id: string;
  start_date: string | null;
  tenant_id: string;
  /**
   * Whether this project plans time (phases, dates, Gantt). `false` runs the
   * project lean — a room for notes, files and tasks. Defaults to `true`.
   */
  timeplan_enabled?: boolean;
  title: string;
  updated_at: string;
  /** Project visibility: whole-tenant (default) or restricted to its team. */
  visibility?: "tenant" | "members";
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
  // No `space_id`: a phase has no space column, and never had one. Phase 1
  // copied the field onto this interface along with the Project one, but
  // `rowToPhase` never populated it — it read as `undefined` on every phase in
  // the system. A phase is inside its project, so the project's space is the
  // answer; a second copy here could only ever drift from it.
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

/**
 * `space_id` is omitted and re-added optional, alongside the other server-owned
 * fields: it is required on the ENTITY (`not null` since Phase 6) but the DAL
 * resolves the tenant's default space when a caller names none. Mirrors
 * `projectInputSchema` in ./zod.ts — the two must stay in step.
 */
export type ProjectInput = Omit<
  Project,
  | "id"
  | "tenant_id"
  | "scope_id"
  | "created_at"
  | "updated_at"
  | "project_team"
  | "space_id"
> & {
  space_id?: string;
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
  /** Every project in a space — the container resolver's `space` case. */
  space_id?: string;
  /**
   * Projects in ANY of these spaces — the cross-space overview, narrowed to
   * what the caller may see. Set by the HTTP handler from core's answer, never
   * read from the query string. An empty list lists nothing.
   */
  space_ids?: readonly string[];
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
  /** Narrow to tasks whose parent project lives in this Space. */
  space_id?: string;
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
