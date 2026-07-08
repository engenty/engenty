import { z } from "@hono/zod-openapi";

export const timeEntrySchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().min(1),
  scope_id: z.string().min(1),
  user_id: z.string().min(1),
  date: z.string().min(1),
  hours: z.number().positive(),
  start_time: z.string().nullable(),
  notes: z.string().nullable(),
  project_id: z.string().nullable(),
  phase_id: z.string().nullable(),
  task_id: z.string().nullable(),
  discipline: z.string().nullable(),
  manual_project_title: z.string().nullable(),
  manual_phase_title: z.string().nullable(),
  manual_task_title: z.string().nullable(),
  created_by: z.string().min(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  timesheet_row_id: z.string().min(1),
});

export const timesheetRowSchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().min(1),
  scope_id: z.string().min(1),
  user_id: z.string().min(1),
  week_start: z.string().min(1),
  project_id: z.string().nullable(),
  phase_id: z.string().nullable(),
  task_id: z.string().nullable(),
  discipline: z.string().nullable(),
  manual_project_title: z.string().nullable(),
  manual_phase_title: z.string().nullable(),
  manual_task_title: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const trackingRowSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["project", "phase", "task"]),
  project_id: z.string().nullable().optional(),
  phase_id: z.string().nullable().optional(),
  task_id: z.string().nullable().optional(),
  project_title: z.string().min(1),
  phase_title: z.string().optional(),
  task_title: z.string().optional(),
  client_name: z.string().min(1),
  discipline: z.string().optional(),
  planned_hours: z.number(),
});

export const timeTrackingContextSchema = z.object({
  current_user: z.object({
    id: z.string().min(1),
    full_name: z.string().min(1),
  }),
  is_admin: z.boolean(),
  projects_available: z.boolean(),
  tasks_available: z.boolean(),
  team_available: z.boolean(),
});

export const timeTrackingListQuerySchema = z.object({
  user_id: z.string().min(1).optional(),
  week_start: z.string().min(1),
});

export const timeTrackingListResponseSchema = z.object({
  rows: z.array(trackingRowSchema),
  entries: z.array(timeEntrySchema),
});

const startTimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Expected HH:MM time");

export const timeEntryInputSchema = z.object({
  date: z.string().min(1),
  user_id: z.string().min(1).optional(),
  hours: z.number().positive(),
  start_time: startTimeSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  phase_id: z.string().nullable().optional(),
  task_id: z.string().nullable().optional(),
  discipline: z.string().nullable().optional(),
  manual_project_title: z.string().nullable().optional(),
  manual_phase_title: z.string().nullable().optional(),
  manual_task_title: z.string().nullable().optional(),
});

export const addTrackingRowInputSchema = z.object({
  date: z.string().min(1),
  user_id: z.string().min(1).optional(),
  project_id: z.string().nullable().optional(),
  phase_id: z.string().nullable().optional(),
  task_id: z.string().nullable().optional(),
  discipline: z.string().nullable().optional(),
  manual_project_title: z.string().nullable().optional(),
  manual_phase_title: z.string().nullable().optional(),
  manual_task_title: z.string().nullable().optional(),
});

export const timeEntryUpdateSchema = timeEntryInputSchema
  .pick({
    discipline: true,
    hours: true,
    notes: true,
    start_time: true,
  })
  .partial();

export const timeEntryMoveSchema = z.object({
  date: z.string().min(1),
  start_time: startTimeSchema.nullable().optional(),
  user_id: z.string().optional(),
  project_id: z.string().nullable().optional(),
  phase_id: z.string().nullable().optional(),
  task_id: z.string().nullable().optional(),
  discipline: z.string().nullable().optional(),
  manual_project_title: z.string().nullable().optional(),
  manual_phase_title: z.string().nullable().optional(),
  manual_task_title: z.string().nullable().optional(),
});

export const timeEntryIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const projectIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const phaseIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const teamMemberSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().nullable(),
  full_name: z.string().min(1),
});

export const projectOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  client_name: z.string().nullable(),
});

export const simpleOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
});

export const tasksCatalogQuerySchema = z.object({
  user_id: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
  phase_id: z.string().min(1).optional(),
});

const isoDateSchema = z
  .string()
  .min(1)
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date");

function daysBetweenInclusive(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

const timeEntryDateRangeFiltersSchema = z.object({
  date_from: isoDateSchema,
  date_to: isoDateSchema,
  user_ids: z.array(z.string().min(1)).optional(),
  project_ids: z.array(z.string().min(1)).optional(),
  phase_ids: z.array(z.string().min(1)).optional(),
  task_ids: z.array(z.string().uuid()).optional(),
  discipline: z.string().min(1).optional(),
  include_manual: z.boolean().optional(),
});

export const timeEntryListFiltersSchema = timeEntryDateRangeFiltersSchema
  .extend({
    page: z.number().int().min(1).optional(),
    page_size: z.number().int().min(1).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.date_to < value.date_from) {
      ctx.addIssue({
        code: "custom",
        message: "date_to must be on or after date_from",
        path: ["date_to"],
      });
      return;
    }
    const span = daysBetweenInclusive(value.date_from, value.date_to);
    if (span > 90) {
      ctx.addIssue({
        code: "custom",
        message: "Date range must not exceed 90 days for entries.list",
        path: ["date_to"],
      });
    }
  });

export const timeEntryListResponseSchema = z.object({
  entries: z.array(timeEntrySchema),
  total_hours: z.number(),
  total_count: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  page_size: z.number().int().min(1),
});

export const timeEntrySummarizeGroupBySchema = z.enum([
  "user",
  "project",
  "phase",
  "task",
  "day",
  "week",
]);

export const timeEntrySummarizeFiltersSchema = timeEntryDateRangeFiltersSchema
  .extend({
    group_by: z.array(timeEntrySummarizeGroupBySchema).min(1),
  })
  .superRefine((value, ctx) => {
    if (value.date_to < value.date_from) {
      ctx.addIssue({
        code: "custom",
        message: "date_to must be on or after date_from",
        path: ["date_to"],
      });
      return;
    }
    const span = daysBetweenInclusive(value.date_from, value.date_to);
    if (span > 366) {
      ctx.addIssue({
        code: "custom",
        message: "Date range must not exceed 366 days for entries.summarize",
        path: ["date_to"],
      });
    }
  });

export const timeEntrySummarizeGroupSchema = z.object({
  key: z.record(z.string(), z.string().nullable()),
  hours: z.number(),
  entry_count: z.number().int().nonnegative(),
});

export const timeEntrySummarizeResponseSchema = z.object({
  groups: z.array(timeEntrySummarizeGroupSchema),
  total_hours: z.number(),
});

export const timeEntryWeekQuerySchema = z.object({
  week_start: isoDateSchema,
  user_id: z.string().min(1).optional(),
});

export const timeEntryUpdateOperationInputSchema =
  timeEntryIdParamsSchema.merge(timeEntryUpdateSchema);

export const timeEntryMoveOperationInputSchema =
  timeEntryIdParamsSchema.merge(timeEntryMoveSchema);

export const timeTrackingContextGetInputSchema = z.object({}).optional();

// --- Calendar overlay (Phase 1: read-only external-calendar background) ---

/** One background calendar the user chose to overlay. */
export const calendarOverlayTargetSchema = z.object({
  connection_id: z.string().min(1),
  // Omitted ⇒ the connection's primary calendar.
  calendar_id: z.string().min(1).optional(),
});

export const calendarEventsListInputSchema = z.object({
  // Inclusive lower / exclusive upper ISO-8601 window bounds.
  time_min: z.string().min(1),
  time_max: z.string().min(1),
  calendars: z.array(calendarOverlayTargetSchema).max(20),
});

export const calendarOverlayEventSchema = z.object({
  event_id: z.string(),
  connection_id: z.string(),
  calendar_id: z.string(),
  // Stable per-calendar key for deterministic overlay coloring.
  calendar_key: z.string(),
  summary: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  all_day: z.boolean(),
  location: z.string().nullable(),
  html_link: z.string().nullable(),
});

export const calendarEventsListResponseSchema = z.object({
  events: z.array(calendarOverlayEventSchema),
  // Per-calendar failures are isolated, not fatal — surfaced so the UI can hint.
  errors: z.array(
    z.object({
      connection_id: z.string(),
      calendar_id: z.string().nullable(),
      message: z.string(),
    })
  ),
});

export const calendarSourceSchema = z.object({
  connection_id: z.string(),
  connector_id: z.string(),
  label: z.string(),
  sharing: z.enum(["personal", "org"]),
  calendars: z.array(
    z.object({
      id: z.string(),
      summary: z.string().nullable(),
      primary: z.boolean(),
    })
  ),
});

export const calendarSourcesResponseSchema = z.object({
  sources: z.array(calendarSourceSchema),
});
