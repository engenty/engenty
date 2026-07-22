export type { TaskStatusColor } from "./task-status-colors.js";

export type TaskStatus = string;

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type PrimaryAssigneeKind = "user" | "agent" | "none";

export type GoalStatus = "planned" | "active" | "achieved" | "cancelled";

export interface TaskStatusDefinition {
  color: import("./task-status-colors.js").TaskStatusColor;
  id: string;
  label: string;
  locked?: boolean;
}

export interface TaskSettings {
  default_task_statuses: string[];
  identifier_prefix: string;
  stale_after_days: number;
  task_status_definitions: TaskStatusDefinition[];
}

export interface Goal {
  created_at: string;
  description: string | null;
  id: string;
  level: string;
  /** Present on list responses when aggregated. */
  linked_task_count?: number;
  owner_agent_id: string | null;
  /** Stable type key of the owning agent (e.g. "engenty.coordinator"). */
  owner_agent_type_key: string | null;
  owner_user_id: string | null;
  parent_id: string | null;
  project_id: string | null;
  scope_id: string;
  status: GoalStatus;
  target_date: string | null;
  tenant_id: string;
  title: string;
  updated_at: string;
}

export interface Task {
  /**
   * Task ids that must reach status 'done' before this task is dispatchable.
   * Replaces the whole set on update; [] clears. Cancelled blockers do NOT
   * count as resolved.
   */
  blocked_by_task_ids: string[];
  cancelled_at: string | null;
  checkout_run_id: string | null;
  collaborator_user_ids?: string[];
  completed_at: string | null;
  created_at: string;
  created_by_agent_type_key: string | null;
  created_by_user_id: string | null;
  description: string | null;
  due_date: string | null;
  goal_id: string | null;
  id: string;
  identifier: string;
  parent_id: string | null;
  primary_assignee_agent_type_key: string | null;
  primary_assignee_kind: PrimaryAssigneeKind;
  primary_assignee_user_id: string | null;
  priority: TaskPriority;
  project_id: string | null;
  request_depth: number;
  scope_id: string;
  started_at: string | null;
  status: TaskStatus;
  tenant_id: string;
  title: string;
  updated_at: string;
}

export interface TaskContext {
  context_id: string;
  context_type: string;
  id: string;
  metadata: Record<string, unknown>;
  scope_id: string;
  task_id: string;
  tenant_id: string;
}

export interface TaskContextInput {
  context_id: string;
  context_type: string;
  metadata?: Record<string, unknown>;
}

export interface TaskComment {
  content: string;
  created_at: string;
  created_by_agent_type_key: string | null;
  created_by_user_id: string | null;
  id: string;
  scope_id: string;
  task_id: string;
  tenant_id: string;
}

export type TaskRunRole = "checkout" | "work" | "review";

export interface TaskRun {
  /** Enriched from ai.agent_session_run when available. */
  agent_session_id?: string | null;
  agent_session_run_id: string;
  agent_type_key?: string | null;
  created_at: string;
  /** Enriched from ai.agent_session_run when available. */
  created_by_user_id?: string | null;
  id: string;
  role: TaskRunRole;
  run_finished_at?: string | null;
  run_started_at?: string | null;
  scope_id: string;
  task_id: string;
  tenant_id: string;
}

export type TaskActivityEventType =
  | "tasks.checked_out"
  | "tasks.released"
  | "tasks.status_changed"
  | "tasks.assignee_changed"
  | "tasks.comment_added"
  | "tasks.blockers_resolved"
  | "tasks.children_completed";

export interface TaskActivity {
  actor_agent_type_key: string | null;
  actor_user_id: string | null;
  created_at: string;
  event_type: TaskActivityEventType | string;
  id: string;
  payload: Record<string, unknown>;
  scope_id: string;
  task_id: string;
  tenant_id: string;
}

export interface TaskCheckoutInput {
  agent_session_run_id: string;
  agent_type_key: string;
  expected_statuses?: string[];
}

export interface TaskReleaseInput {
  agent_session_run_id?: string;
}

export interface TaskCheckoutConflictResponse {
  checkout_run_id: string | null;
  current_assignee_kind: string;
  current_status: string;
  error: "task_checkout_conflict";
}

export interface TaskDetail extends Task {
  comments: TaskComment[];
  contexts: TaskContext[];
}

export interface TasksQueryParams {
  assigned_to?: string | null;
  /** Filter by who the task is assigned to: a human user or an agent. */
  assignee_kind?: "user" | "agent" | null;
  context_id?: string | null;
  context_metadata_phase_id?: string | null;
  context_type?: string | null;
  goal_id?: string | null;
  page?: number;
  pageSize?: number;
  parent_id?: string | null;
  project_id?: string | null;
  scope?: "all" | "mine";
  search?: string | null;
  sortBy?: "updated_at" | "created_at" | "title" | "status" | "identifier";
  sortOrder?: "asc" | "desc";
  status?: string | null;
}

export interface TasksPaginatedResponse {
  data: Task[];
  page: number;
  pageSize: number;
  total: number;
}

export interface GoalsQueryParams {
  owner_agent_type_key?: string | null;
  /** Filter by owner kind: a human user or an agent. */
  owner_kind?: "user" | "agent" | null;
  page?: number;
  pageSize?: number;
  parent_id?: string | null;
  search?: string | null;
  sortBy?: "updated_at" | "created_at" | "title" | "status";
  sortOrder?: "asc" | "desc";
  status?: GoalStatus | null;
}

export interface GoalsPaginatedResponse {
  data: Goal[];
  page: number;
  pageSize: number;
  total: number;
}

export interface TaskCreateInput {
  /** See Task.blocked_by_task_ids — replaces the whole set on update. */
  blocked_by_task_ids?: string[];
  collaborator_user_ids?: string[];
  contexts?: TaskContextInput[];
  created_by_agent_type_key?: string | null;
  description?: string | null;
  due_date?: string | null;
  goal_id?: string | null;
  parent_id?: string | null;
  primary_assignee_agent_type_key?: string | null;
  primary_assignee_kind?: PrimaryAssigneeKind;
  primary_assignee_user_id?: string | null;
  priority?: TaskPriority;
  project_id?: string | null;
  status?: TaskStatus;
  title: string;
}

export type TaskUpdateInput = Partial<
  Omit<TaskCreateInput, "created_by_agent_type_key" | "collaborator_user_ids">
> & {
  collaborator_user_ids?: string[];
  status?: TaskStatus;
};

export interface GoalCreateInput {
  description?: string | null;
  level?: string;
  owner_agent_id?: string | null;
  owner_agent_type_key?: string | null;
  owner_user_id?: string | null;
  parent_id?: string | null;
  project_id?: string | null;
  status?: GoalStatus;
  target_date?: string | null;
  title: string;
}

export type GoalUpdateInput = Partial<GoalCreateInput>;

export interface TaskSettingsUpdateInput {
  identifier_prefix?: string;
  stale_after_days?: number;
  task_status_definitions?: TaskStatusDefinition[];
}

export type TasksBriefingMode = "personal" | "oversight";

export interface TasksBriefingSectionItem {
  reason: string;
  task: Task;
}

export interface TasksBriefingSummary {
  attention: number;
  blocked: number;
  in_progress: number;
  open: number;
  stale: number;
  waiting: number;
}

export interface TasksBriefingActivityItem {
  activity: TaskActivity;
  task_identifier: string;
  task_title: string;
}

export interface TasksBriefingResponse {
  attention_items: TasksBriefingSectionItem[];
  focus_items: TasksBriefingSectionItem[];
  mode: TasksBriefingMode;
  recent_activity: TasksBriefingActivityItem[];
  recent_tasks: Task[];
  stale_after_days: number;
  stale_items: TasksBriefingSectionItem[];
  summary: TasksBriefingSummary;
  waiting_items: TasksBriefingSectionItem[];
}

// --- Triggers + task templates ---------------------------------------------

export type TriggerKind = "schedule" | "event" | "manual";
export type TriggerSource = "module" | "custom";
/** Event-trigger ingestion edges: the in-process plugin event bus, or the
 * public secret-authenticated webhook route. */
export type TriggerEventProvider = "module-events" | "webhook";

export interface TaskTemplate {
  agent_type_key: string;
  created_at: string;
  description: string | null;
  id: string;
  name: string;
  priority: TaskPriority;
  scope_id: string;
  tenant_id: string;
  title: string;
  updated_at: string;
}

export interface Trigger {
  created_at: string;
  cron: string | null;
  description: string | null;
  enabled: boolean;
  event_filter: Record<string, unknown> | null;
  heartbeat_id: string | null;
  id: string;
  kind: TriggerKind;
  last_fired_at: string | null;
  last_result: string | null;
  module_id: string | null;
  module_key: string | null;
  name: string;
  provider_id: string | null;
  quiet_hours: string | null;
  resource: string | null;
  scope_id: string;
  source: TriggerSource;
  task_template_id: string;
  tenant_id: string;
  timezone: string | null;
  updated_at: string;
  webhook_secret: string | null;
}

export interface TriggerDetail extends Trigger {
  task_template: TaskTemplate | null;
}
