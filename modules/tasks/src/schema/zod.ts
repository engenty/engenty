import { z } from "@hono/zod-openapi";
import { TASK_STATUS_COLOR_OPTIONS } from "./task-status-colors.js";

export const taskStatusDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.enum(TASK_STATUS_COLOR_OPTIONS),
  locked: z.boolean().optional(),
});

export const taskSettingsSchema = z.object({
  identifier_prefix: z.string(),
  stale_after_days: z.number().int(),
  task_status_definitions: z.array(taskStatusDefinitionSchema),
  default_task_statuses: z.array(z.string()),
});

export const taskSettingsUpdateSchema = z.object({
  identifier_prefix: z.string().optional(),
  stale_after_days: z.number().int().min(1).optional(),
  task_status_definitions: z.array(taskStatusDefinitionSchema).optional(),
});

export const taskSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  scope_id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  goal_id: z.string().uuid().nullable(),
  parent_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
  primary_assignee_kind: z.enum(["user", "agent", "none"]),
  primary_assignee_user_id: z.string().uuid().nullable(),
  primary_assignee_agent_type_key: z.string().nullable(),
  created_by_user_id: z.string().uuid().nullable(),
  created_by_agent_type_key: z.string().nullable(),
  due_date: z.string().nullable(),
  blocked_by_task_ids: z.array(z.string().uuid()),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  checkout_run_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  collaborator_user_ids: z.array(z.string().uuid()).optional(),
  // Routine (trigger) that materialized this task, if any.
  trigger_id: z.string().uuid().nullable().optional(),
  // Operation ids a headless run may execute without asking ("Allow for this
  // task"). Stored in core.approval_grants (subject = task id) and hydrated
  // onto the DETAIL response only; `approval_grants_once` is reaped after the
  // run it unlocked.
  approval_grants: z.array(z.string()).optional(),
  approval_grants_once: z.array(z.string()).optional(),
  // Operations a paused run is waiting on — what the task's approval UI reads.
  pending_approval_operation_ids: z.array(z.string()).optional(),
});

export const taskCommentSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  scope_id: z.string(),
  task_id: z.string().uuid(),
  content: z.string(),
  created_by_user_id: z.string().uuid().nullable(),
  created_by_agent_type_key: z.string().nullable(),
  created_at: z.string(),
});

export const taskDetailSchema = taskSchema.extend({
  contexts: z.array(
    z.object({
      id: z.string().uuid(),
      tenant_id: z.string().uuid(),
      scope_id: z.string(),
      task_id: z.string().uuid(),
      context_type: z.string(),
      context_id: z.string(),
      metadata: z.record(z.string(), z.unknown()),
    })
  ),
  comments: z.array(taskCommentSchema),
});

export const tasksListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  goal_id: z.string().uuid().optional(),
  parent_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  trigger_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  assignee_kind: z.enum(["user", "agent"]).optional(),
  context_type: z.string().optional(),
  context_id: z.string().optional(),
  context_metadata_phase_id: z.string().optional(),
  scope: z.enum(["all", "mine"]).optional(),
  sortBy: z
    .enum(["updated_at", "created_at", "title", "status", "identifier"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const tasksPaginatedResponseSchema = z.object({
  data: z.array(taskSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const taskContextInputSchema = z.object({
  context_type: z.string().min(1),
  context_id: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const taskCreateInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  goal_id: z.string().uuid().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  primary_assignee_kind: z.enum(["user", "agent", "none"]).optional(),
  primary_assignee_user_id: z.string().uuid().nullable().optional(),
  primary_assignee_agent_type_key: z.string().nullable().optional(),
  collaborator_user_ids: z.array(z.string().uuid()).optional(),
  contexts: z.array(taskContextInputSchema).optional(),
  due_date: z.string().nullable().optional(),
  created_by_agent_type_key: z.string().nullable().optional(),
  blocked_by_task_ids: z
    .array(z.string().uuid())
    .max(32)
    .optional()
    .describe(
      "Task ids that must reach status 'done' before this task is dispatchable. Replaces the whole set on update; [] clears. Cancelled blockers do not count as resolved."
    ),
});

export const taskUpdateInputSchema = taskCreateInputSchema.partial().extend({
  title: z.string().min(1).optional(),
  collaborator_user_ids: z.array(z.string().uuid()).optional(),
});

// Revoking an approved tool goes through the dedicated revoke route (the
// grants live in core.approval_grants, not on the task row).
export const taskRevokeApprovalGrantInputSchema = z.object({
  operation_id: z.string().min(1),
});

export const taskIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const taskToolApprovalInputSchema = z
  .object({
    id: z.string().uuid(),
    operation_id: z.string().min(1),
    decision: z.enum(["approve", "deny"]),
    // Required when decision === "approve".
    scope: z.enum(["once", "task", "routine"]).optional(),
  })
  .refine((v) => v.decision === "deny" || v.scope !== undefined, {
    message: "scope is required when approving",
    path: ["scope"],
  });

export const taskClearOnceApprovalsInputSchema = z.object({
  id: z.string().uuid(),
});

// HTTP body variant (task id comes from the path param).
export const taskToolApprovalBodySchema = z
  .object({
    operation_id: z.string().min(1),
    decision: z.enum(["approve", "deny"]),
    scope: z.enum(["once", "task", "routine"]).optional(),
  })
  .refine((v) => v.decision === "deny" || v.scope !== undefined, {
    message: "scope is required when approving",
    path: ["scope"],
  });

export const taskCommentCreateSchema = z.object({
  content: z.string().min(1),
});

export const taskAddCommentOperationInputSchema = taskIdParamsSchema.extend({
  content: z.string().min(1),
  created_by_agent_type_key: z.string().optional(),
});

export const goalSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  scope_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(["planned", "active", "achieved", "cancelled"]),
  parent_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
  owner_user_id: z.string().uuid().nullable(),
  owner_agent_id: z.string().uuid().nullable(),
  owner_agent_type_key: z.string().nullable(),
  level: z.string(),
  target_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  linked_task_count: z.number().int().optional(),
});

export const goalsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  parent_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  search: z.string().optional(),
  status: z.enum(["planned", "active", "achieved", "cancelled"]).optional(),
  /** Filter to goals owned by this agent type key (e.g. "engenty.coordinator"). */
  owner_agent_type_key: z.string().optional(),
  /** Filter by owner kind: a human user or an agent. */
  owner_kind: z.enum(["user", "agent"]).optional(),
  sortBy: z.enum(["updated_at", "created_at", "title", "status"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const goalsPaginatedResponseSchema = z.object({
  data: z.array(goalSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const goalHandoffResponseSchema = z.object({
  goal: goalSchema,
  /** True when the coordination task was enqueued for a planning run. */
  dispatched: z.boolean(),
  /** The coordination task carrying the planning run (created or reused). */
  task: taskSchema,
});

export const goalCreateInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(["planned", "active", "achieved", "cancelled"]).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  owner_agent_type_key: z.string().nullable().optional(),
  level: z.string().optional(),
  target_date: z.string().nullable().optional(),
});

export const goalUpdateInputSchema = goalCreateInputSchema.partial();

export const goalIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const notFoundSchema = z.object({
  error: z.string(),
});

export const tasksBriefingQuerySchema = z.object({
  mode: z.enum(["personal", "oversight"]).optional(),
});

export const tasksBriefingSectionItemSchema = z.object({
  reason: z.string(),
  task: taskSchema,
});

export const tasksBriefingSummarySchema = z.object({
  open: z.number().int(),
  in_progress: z.number().int(),
  blocked: z.number().int(),
  waiting: z.number().int(),
  stale: z.number().int(),
  attention: z.number().int(),
});

export const taskRunSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  scope_id: z.string(),
  task_id: z.string().uuid(),
  agent_session_run_id: z.string().uuid(),
  // DB allows checkout|work|review; only checkout is ever written.
  role: z.literal("checkout"),
  created_at: z.string(),
  agent_type_key: z.string().nullable().optional(),
  // Without this the thread id is stripped from the response and the run log
  // renders empty for every run.
  agent_thread_id: z.string().uuid().nullable().optional(),
  run_started_at: z.string().nullable().optional(),
  run_finished_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
});

export const taskActivitySchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  scope_id: z.string(),
  task_id: z.string().uuid(),
  event_type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  actor_user_id: z.string().uuid().nullable(),
  actor_agent_type_key: z.string().nullable(),
  created_at: z.string(),
});

export const tasksBriefingActivityItemSchema = z.object({
  activity: taskActivitySchema,
  task_identifier: z.string(),
  task_title: z.string(),
});

export const tasksBriefingResponseSchema = z.object({
  mode: z.enum(["personal", "oversight"]),
  stale_after_days: z.number().int(),
  summary: tasksBriefingSummarySchema,
  recent_tasks: z.array(taskSchema),
  recent_activity: z.array(tasksBriefingActivityItemSchema),
  focus_items: z.array(tasksBriefingSectionItemSchema),
  attention_items: z.array(tasksBriefingSectionItemSchema),
  waiting_items: z.array(tasksBriefingSectionItemSchema),
  stale_items: z.array(tasksBriefingSectionItemSchema),
});

// Accept both legacy (agent_session_run_id / agent_type_key) and modern
// (agent_run_id / agent_id) field names. The harness sends modern names;
// existing callers may still use legacy names. Normalizes to the legacy
// shape internally so DAL/types don't need a full rename yet.
export const taskCheckoutInputRawSchema = z.object({
  agent_session_run_id: z.string().uuid().optional(),
  agent_run_id: z.string().uuid().optional(),
  agent_type_key: z.string().min(1).optional(),
  agent_id: z.string().min(1).optional(),
  expected_statuses: z.array(z.string()).optional(),
});

export const taskCheckoutInputSchema = taskCheckoutInputRawSchema
  .transform((v) => ({
    agent_session_run_id: v.agent_session_run_id ?? v.agent_run_id ?? "",
    agent_type_key: v.agent_type_key ?? v.agent_id ?? "",
    expected_statuses: v.expected_statuses,
  }))
  .refine(
    (v) => v.agent_session_run_id.length > 0 && v.agent_type_key.length > 0,
    {
      message:
        "agent_session_run_id (or agent_run_id) and agent_type_key (or agent_id) are required",
    }
  );

export const taskReleaseInputRawSchema = z.object({
  agent_session_run_id: z.string().uuid().optional(),
  agent_run_id: z.string().uuid().optional(),
  outcome: z
    .enum(["completed", "completed_quiet", "failed", "needs_approval"])
    .optional(),
  pending_approval_operation_ids: z.array(z.string().min(1)).max(64).optional(),
  // Entry statuses only — release must not park a task at done/cancelled/etc.
  resting_status: z.enum(["backlog", "todo"]).optional(),
});

export const taskReleaseInputSchema = taskReleaseInputRawSchema.transform(
  (v) => ({
    agent_session_run_id: v.agent_session_run_id ?? v.agent_run_id,
    ...(v.outcome ? { outcome: v.outcome } : {}),
    ...(v.pending_approval_operation_ids
      ? { pending_approval_operation_ids: v.pending_approval_operation_ids }
      : {}),
    ...(v.resting_status ? { resting_status: v.resting_status } : {}),
  })
);

/** Result of an explicit "run this task now" dispatch. */
export const taskRunNowResponseSchema = z.object({
  // False when a live checkout already owns the task — the running run stands.
  dispatched: z.boolean(),
  task: taskSchema,
});

export const taskCheckoutConflictSchema = z.object({
  error: z.literal("task_checkout_conflict"),
  current_status: z.string(),
  current_assignee_kind: z.string(),
  checkout_run_id: z.string().uuid().nullable(),
});

export const taskRunsListSchema = z.object({
  data: z.array(taskRunSchema),
});

export const taskActivityListSchema = z.object({
  data: z.array(taskActivitySchema),
});

// --- Triggers + task templates ---------------------------------------------
// A Trigger is the single "reason work starts" (schedule | event | manual);
// it always references a task template and firing it materializes a Task.

export const taskTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  agent_type_key: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  created_at: z.string(),
  updated_at: z.string(),
});

export const taskTemplateCreateInputSchema = z.object({
  name: z.string().min(1).max(255),
  title: z.string().min(1).max(500),
  description: z.string().max(8192).nullable().optional(),
  agent_type_key: z.string().min(1).max(255),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
});

export const taskTemplateUpdateInputSchema =
  taskTemplateCreateInputSchema.partial();

export const triggerKindSchema = z.enum(["schedule", "event", "manual"]);

export const triggerEventProviderSchema = z.enum(["module-events", "webhook"]);

export const triggerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  kind: triggerKindSchema,
  task_template_id: z.string().uuid(),
  enabled: z.boolean(),
  cron: z.string().nullable(),
  timezone: z.string().nullable(),
  quiet_hours: z.string().nullable(),
  provider_id: z.string().nullable(),
  resource: z.string().nullable(),
  event_filter: z.record(z.string(), z.unknown()).nullable(),
  source: z.enum(["module", "custom"]),
  module_id: z.string().nullable(),
  module_key: z.string().nullable(),
  heartbeat_id: z.string().nullable(),
  webhook_secret: z.string().nullable(),
  last_fired_at: z.string().nullable(),
  last_result: z.string().nullable(),
  // Operation ids that runs of this routine may execute without asking
  // ("Allow for this routine" + pre-configuration).
  approval_grants: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

export const triggerDetailSchema = triggerSchema.extend({
  task_template: taskTemplateSchema.nullable(),
});

/**
 * A trigger description is not a label: for module routines it carries the
 * whole ROUTINE.md body, which is the agent's operating procedure. The old
 * 1000-char cap silently rejected any routine longer than a short paragraph.
 */
const TRIGGER_DESCRIPTION_MAX = 16_000;

export const triggerCreateInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(TRIGGER_DESCRIPTION_MAX).nullable().optional(),
  kind: triggerKindSchema,
  task_template_id: z.string().uuid().optional(),
  // Inline template creation — either this or task_template_id is required.
  task_template: taskTemplateCreateInputSchema.optional(),
  enabled: z.boolean().optional(),
  cron: z.string().max(100).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
  quiet_hours: z.string().max(100).nullable().optional(),
  // kind = 'event'
  provider_id: triggerEventProviderSchema.nullable().optional(),
  resource: z.string().max(255).nullable().optional(),
  event_filter: z.record(z.string(), z.unknown()).nullable().optional(),
  // Module-declared triggers (ROUTINE.md sync).
  source: z.enum(["module", "custom"]).optional(),
  module_id: z.string().max(255).nullable().optional(),
  module_key: z.string().max(255).nullable().optional(),
  approval_grants: z.array(z.string().min(1)).max(64).optional(),
});

export const triggerUpdateInputSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(TRIGGER_DESCRIPTION_MAX).nullable().optional(),
  enabled: z.boolean().optional(),
  cron: z.string().max(100).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
  quiet_hours: z.string().max(100).nullable().optional(),
  provider_id: triggerEventProviderSchema.nullable().optional(),
  resource: z.string().max(255).nullable().optional(),
  event_filter: z.record(z.string(), z.unknown()).nullable().optional(),
  task_template_id: z.string().uuid().optional(),
  // Nested template patch (declaration reconcile / custom routine edit).
  task_template: taskTemplateUpdateInputSchema.optional(),
  heartbeat_id: z.string().nullable().optional(),
  approval_grants: z.array(z.string().min(1)).max(64).optional(),
});

export const triggersListQuerySchema = z.object({
  kind: triggerKindSchema.optional(),
  source: z.enum(["module", "custom"]).optional(),
  enabled: z.boolean().optional(),
});

export const triggersListSchema = z.object({
  data: z.array(triggerDetailSchema),
});

export const triggerIdParamsSchema = z.object({
  id: z.string().uuid(),
});
