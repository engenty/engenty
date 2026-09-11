import { z } from "@hono/zod-openapi";
import { TASK_STATUS_COLOR_OPTIONS } from "./task-status-colors.js";

export const taskStatusColorSchema = z.enum(TASK_STATUS_COLOR_OPTIONS);

export const projectTaskStatusDefinitionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(120),
  color: taskStatusColorSchema,
  locked: z.boolean().optional(),
});

/** Allowed ids are enforced against project settings in route handlers. */
export const taskStatusSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/);

export const projectMemberRoleSchema = z.enum([
  "project-lead",
  "project-member",
  "project-external",
]);

export const projectTeamMemberSchema = z.object({
  project_id: z.string(),
  user_id: z.string(),
  role: projectMemberRoleSchema.default("project-member"),
  role_name: z.string().nullable().optional(),
});

export const projectSchema = z.object({
  /** In-app path to this record's page (`/s/<space_key>/<module>/<id>`); set by operations, absent on HTTP rows. */
  link: z.string().optional(),
  id: z.string(),
  tenant_id: z.string(),
  scope_id: z.string(),
  /** Space the project runs inside (PLAN-spaces.md); `not null` since Phase 6. */
  space_id: z.string().uuid(),
  client_id: z.string().nullable(),
  client_name: z.string().nullable(),
  lead_id: z.string().uuid().nullable(),
  title: z.string().min(1),
  briefing: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  portal_enabled: z.boolean(),
  portal_password: z.string().nullable(),
  portal_intro_text: z.string().nullable(),
  visibility: z.enum(["tenant", "members"]).default("tenant"),
  timeplan_enabled: z.boolean().default(true),
  enabled_tabs: z.array(z.string()).nullable().optional(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  project_team: z.array(projectTeamMemberSchema).optional(),
});

export const projectInputSchema = projectSchema
  .omit({
    id: true,
    tenant_id: true,
    scope_id: true,
    created_at: true,
    updated_at: true,
    project_team: true,
    space_id: true,
  })
  // Required on the ENTITY (`not null` since Phase 6), optional on INPUT: the
  // DAL resolves the tenant's default space when the caller names none, the
  // same way scope_id and the timestamps are server-owned.
  .extend({ space_id: z.string().uuid().optional() });

/** Create payload: portal/lead/created_by/briefing/dates/client_name are optional; API/DAL apply defaults. */
export const projectCreateInputSchema = projectInputSchema.extend({
  client_name: z.string().nullable().default(null),
  briefing: z.string().nullable().default(null),
  start_date: z.string().nullable().default(null),
  end_date: z.string().nullable().default(null),
  lead_id: z.string().uuid().nullable().optional(),
  portal_enabled: z.boolean().optional(),
  portal_password: z.string().nullable().optional(),
  portal_intro_text: z.string().nullable().optional(),
  timeplan_enabled: z.boolean().optional(),
  created_by: z.string().uuid().nullable().optional(),
  team_member_ids: z.array(z.string()).optional(),
});

export const projectTeamMemberUpdateSchema = z.object({
  user_id: z.string(),
  role: projectMemberRoleSchema.optional(),
  role_name: z.string().nullable().optional(),
});

export const projectUpdateSchema = projectInputSchema.partial().extend({
  team_member_ids: z.array(z.string()).optional(),
  project_team: z.array(projectTeamMemberUpdateSchema).optional(),
});

export const projectIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const projectDeleteQuerySchema = z.object({
  delete_tasks: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1"),
});

export const projectPhaseSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  scope_id: z.string(),
  project_id: z.string(),
  title: z.string().min(1),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  is_main: z.boolean(),
  is_public: z.boolean(),
  order_index: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const projectPhaseInputSchema = projectPhaseSchema.omit({
  id: true,
  tenant_id: true,
  scope_id: true,
  created_at: true,
  updated_at: true,
});

export const projectPhaseUpdateSchema = projectPhaseInputSchema.partial();

export const phaseTaskSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  scope_id: z.string(),
  project_id: z.string(),
  phase_id: z.string().nullable(),
  title: z.string().min(1),
  content: z.string().nullable(),
  discipline: z.string().nullable(),
  hours: z.number().nullable(),
  status: taskStatusSchema,
  is_public: z.boolean(),
  order_index: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  task_team: z.array(z.any()).optional(),
});

export const phaseTaskInputSchema = phaseTaskSchema
  .omit({
    id: true,
    tenant_id: true,
    scope_id: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    status: taskStatusSchema.optional(),
    team_member_ids: z.array(z.string()).optional(),
  });

export const phaseTaskUpdateSchema = phaseTaskInputSchema.partial();

export const notFoundSchema = z.object({
  error: z.string(),
});

export const deleteProjectResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});

export const projectAssociatedTaskCountResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

export const projectsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  sortBy: z.enum(["title", "start_date", "end_date", "created_at"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  search: z.string().optional(),
  client_id: z.string().optional(),
  lead_id: z.string().uuid().optional(),
  space_id: z.string().uuid().optional(),
});

export const projectsPaginatedResponseSchema = z.object({
  data: z.array(projectSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const projectSettingsSchema = z.object({
  briefing_overdue_days: z.number().int().min(1).max(90),
  default_task_statuses: z.array(z.string()),
  task_status_definitions: z.array(projectTaskStatusDefinitionSchema),
});

export const projectSettingsInputSchema = projectSettingsSchema.partial();

export const projectsBriefingQuerySchema = z.object({
  mode: z.enum(["personal", "oversight"]).optional(),
});

export const projectTasksListQuerySchema = z.object({
  scope: z.enum(["mine", "all"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().optional(),
  project_id: z.string().optional(),
  phase_id: z.string().optional(),
  assigned_to: z.string().optional(),
  space_id: z.string().uuid().optional(),
  status: taskStatusSchema.optional(),
  sortBy: z.enum(["updated_at", "created_at", "title", "status"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const projectTaskListItemSchema = phaseTaskSchema.extend({
  project_title: z.string(),
  client_name: z.string().nullable(),
  phase_title: z.string().nullable(),
});

export const projectTasksPaginatedResponseSchema = z.object({
  data: z.array(projectTaskListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const projectTaskCountsByStatusSchema = z.record(
  z.string(),
  z.number().int().nonnegative()
);
