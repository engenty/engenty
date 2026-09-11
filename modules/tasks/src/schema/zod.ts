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
  /** In-app path to this record's page (`/s/<space_key>/<module>/<id>`); set by operations, absent on HTTP rows. */
  link: z.string().optional(),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  scope_id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  parent_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
  /** Space the work belongs to (PLAN-spaces.md); `not null` since Phase 6. */
  space_id: z.string().uuid(),
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
  // Operation ids a headless run may execute without asking ("Allow for this
  // task"). Stored in core.approval_grants (subject = task id) and hydrated
  // onto the DETAIL response only; `approval_grants_once` is reaped after the
  // run it unlocked.
  approval_grants: z.array(z.string()).optional(),
  approval_grants_once: z.array(z.string()).optional(),
  // Operations a paused run is waiting on — what the task's approval UI reads.
  pending_approval_operation_ids: z.array(z.string()).optional(),
  has_open_question: z.boolean().optional(),
});

/**
 * What a comment IS, so nothing has to read meaning out of its text.
 * Mirrors the `task_comments_kind_check` constraint.
 */
export const taskCommentKindSchema = z.enum([
  "note",
  "progress",
  "question",
  "result",
  "system",
]);

/**
 * How a `question` comment can be answered. `text` is the fallback for
 * anything that is genuinely open; the rest let the UI render a control and
 * spare the person retyping an option the agent already listed.
 */
export const taskQuestionAnswerTypeSchema = z.enum([
  "text",
  "confirm",
  "single_choice",
  "multi_choice",
]);

export const taskQuestionOptionSchema = z.object({
  /** What gets posted as the answer when picked. */
  value: z.string().min(1).max(200),
  /** Shown instead of `value` when the value is an id or a hex code. */
  label: z.string().max(200).optional(),
});

/** Kind-specific payload on a comment. Only `question` uses it today. */
export const taskCommentMetadataSchema = z.object({
  answer_type: taskQuestionAnswerTypeSchema.optional(),
  options: z.array(taskQuestionOptionSchema).max(12).optional(),
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
  // Older rows are backfilled by the migration; the default keeps a plain
  // insert honest without every caller naming a kind.
  kind: taskCommentKindSchema.default("note"),
  metadata: taskCommentMetadataSchema.default({}),
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
  parent_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  space_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  assignee_kind: z.enum(["user", "agent"]).optional(),
  primary_assignee_agent_type_key: z.string().trim().min(1).max(128).optional(),
  include_agent_desk_state: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : value === true || value === "true"
    ),
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

/**
 * A task is a work item: title, status, assignee. It carries no action body and
 * no wake source — a run targets an action through the routine that fired it,
 * and the task is at most that run's subject.
 */
export const taskCreateInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  primary_assignee_kind: z.enum(["user", "agent", "none"]).optional(),
  primary_assignee_user_id: z.string().uuid().nullable().optional(),
  primary_assignee_agent_type_key: z.string().nullable().optional(),
  space_id: z.string().uuid().optional(),
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

// Exactly one of `operation_id` (single, back-compat) / `operation_ids`
// (batch, e.g. the "Allow all" button) must be present.
const toolApprovalOperationFields = {
  operation_id: z.string().min(1).optional(),
  operation_ids: z.array(z.string().min(1)).min(1).max(64).optional(),
};

const exactlyOneOperationField = (v: {
  operation_id?: string;
  operation_ids?: string[];
}) => (v.operation_id === undefined) !== (v.operation_ids === undefined);

const exactlyOneOperationFieldIssue = {
  message: "exactly one of operation_id or operation_ids is required",
  path: ["operation_id"] as PropertyKey[],
};

export const taskToolApprovalInputSchema = z
  .object({
    id: z.string().uuid(),
    ...toolApprovalOperationFields,
    decision: z.enum(["approve", "deny"]),
    // Required when decision === "approve".
    scope: z.enum(["once", "task"]).optional(),
  })
  .refine(exactlyOneOperationField, exactlyOneOperationFieldIssue)
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
    ...toolApprovalOperationFields,
    decision: z.enum(["approve", "deny"]),
    scope: z.enum(["once", "task"]).optional(),
  })
  .refine(exactlyOneOperationField, exactlyOneOperationFieldIssue)
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
  kind: taskCommentKindSchema.optional(),
  metadata: taskCommentMetadataSchema.optional(),
});

export const notFoundSchema = z.object({
  error: z.string(),
});

export const tasksBriefingQuerySchema = z.object({
  mode: z.enum(["personal", "oversight"]).optional(),
  // The briefing is the Tasks tab's landing page inside a space, so it takes the
  // same space filter the list does. Absent = every space, which is what a
  // tenant-level caller (and every pre-space caller) still means.
  space_id: z.string().uuid().optional(),
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
    .enum([
      "completed",
      "completed_quiet",
      "failed",
      "needs_approval",
      // The run stopped to ask a human something (TASK_BLOCKED or
      // `task_ask_user`) — distinct from needs_approval, where what is missing
      // is a grant.
      "needs_input",
    ])
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
  // True only when this request actually put work on the durable queue.
  dispatched: z.boolean(),
  outcome: z.enum(["already_running", "blocked", "not_dispatchable", "queued"]),
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
