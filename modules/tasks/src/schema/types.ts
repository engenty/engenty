export type { TaskStatusColor } from "./task-status-colors.js";

export type TaskStatus = string;

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type PrimaryAssigneeKind = "user" | "agent" | "none";

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

export interface Task {
  /** Operation ids a headless run may run without asking ("Allow for task").
   * Lives in core.approval_grants (subject = task id); hydrated on DETAIL. */
  approval_grants?: string[];
  /** One-shot grants, reaped after the run they unlocked. Hydrated on DETAIL. */
  approval_grants_once?: string[];
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
  /** Present on focused list reads that request Agent Desk waiting state. */
  has_open_question?: boolean;
  id: string;
  identifier: string;
  parent_id: string | null;
  /**
   * Operation ids a paused run is waiting on. Durable so the approval UI keys
   * off the task itself, not off a dismissible inbox notification.
   */
  pending_approval_operation_ids?: string[];
  primary_assignee_agent_type_key: string | null;
  primary_assignee_kind: PrimaryAssigneeKind;
  primary_assignee_user_id: string | null;
  priority: TaskPriority;
  project_id: string | null;
  scope_id: string;
  /**
   * Space the work belongs to (PLAN-spaces.md). REQUIRED since Phase 6: the
   * column is `not null` in the database and every create path resolves one
   * (explicit → inherit from parent task / project → tenant default), so a read
   * can no longer produce a space-less container.
   */
  space_id: string;
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

/** See `task_comments.kind` — replaces reading meaning out of an emoji prefix. */
export type TaskCommentKind =
  | "note"
  | "progress"
  | "question"
  | "result"
  | "system";

/** How a `question` comment can be answered — see `task_comments.metadata`. */
export type TaskQuestionAnswerType =
  | "text"
  | "confirm"
  | "single_choice"
  | "multi_choice";

export interface TaskQuestionOption {
  /** Shown instead of `value` when the value is an id or a hex code. */
  label?: string;
  /** What gets posted as the answer when picked. */
  value: string;
}

export interface TaskCommentMetadata {
  answer_type?: TaskQuestionAnswerType;
  options?: TaskQuestionOption[];
}

export interface TaskComment {
  content: string;
  created_at: string;
  created_by_agent_type_key: string | null;
  created_by_user_id: string | null;
  id: string;
  kind: TaskCommentKind;
  metadata: TaskCommentMetadata;
  scope_id: string;
  task_id: string;
  tenant_id: string;
}

/** Only `checkout` is written; `work`|`review` remain DB-allowed but unused. */
export type TaskRunRole = "checkout";

export interface TaskRun {
  agent_session_run_id: string;
  /**
   * The run's ai thread — enriched from ai.agent_run.thread_id. The run log
   * cannot be loaded without it: the transcript lives on the thread.
   */
  agent_thread_id?: string | null;
  agent_type_key?: string | null;
  created_at: string;
  /** Enriched from ai.agent_session_run when available. */
  created_by_user_id?: string | null;
  /** Stamped by the release path — authoritative, unlike the ai.* enrichment. */
  finished_at?: string | null;
  id: string;
  /** completed | failed | needs_approval | needs_input — stamped by the release path. */
  outcome?: string | null;
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
  /** Run outcome stamped onto the task_runs row. `needs_input` = the run asked
   * a human a question (TASK_BLOCKED or `task_ask_user`); `needs_approval` = it lacked a grant. */
  outcome?:
    | "completed"
    | "completed_quiet"
    | "failed"
    | "needs_approval"
    | "needs_input";
  /**
   * Operations the ending run still needs approval for. Always replaces the
   * task's pending set — a run that ended without asking clears it.
   */
  pending_approval_operation_ids?: string[];
  /**
   * Status to park the task at after checkout clears. Defaults to `todo`.
   * Only entry statuses — never `done` / `cancelled` / mid-lifecycle values.
   */
  resting_status?: "backlog" | "todo";
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
  /** Hydrate focused waiting-state metadata for the Agent Desk feed. */
  include_agent_desk_state?: boolean;
  page?: number;
  pageSize?: number;
  parent_id?: string | null;
  primary_assignee_agent_type_key?: string | null;
  project_id?: string | null;
  scope?: "all" | "mine";
  search?: string | null;
  sortBy?: "updated_at" | "created_at" | "title" | "status" | "identifier";
  sortOrder?: "asc" | "desc";
  /** Every task in a space — the container resolver's `space` case. */
  space_id?: string | null;
  /**
   * Tasks in ANY of these spaces — the cross-space overview, narrowed to what
   * the caller may see. Set by the HTTP handler from core's answer, never read
   * from the query string. An empty list lists nothing.
   */
  space_ids?: readonly string[];
  status?: string | null;
}

export interface TasksPaginatedResponse {
  data: Task[];
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
  parent_id?: string | null;
  primary_assignee_agent_type_key?: string | null;
  primary_assignee_kind?: PrimaryAssigneeKind;
  primary_assignee_user_id?: string | null;
  priority?: TaskPriority;
  project_id?: string | null;
  /** Explicit space; omitted means inherit from parent task / project, else the tenant default. */
  space_id?: string;
  status?: TaskStatus;
  title: string;
}

export type TaskUpdateInput = Partial<
  Omit<TaskCreateInput, "created_by_agent_type_key" | "collaborator_user_ids">
> & {
  collaborator_user_ids?: string[];
  status?: TaskStatus;
};

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
