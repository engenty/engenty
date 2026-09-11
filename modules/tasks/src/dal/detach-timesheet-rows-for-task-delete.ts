import type { SupabaseClient } from "@supabase/supabase-js";

const TIME_TRACKING_SCHEMA = "module_time_tracking";

function isTimesheetRowUniqueViolation(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "23505" ||
    (error.message ?? "").includes("idx_module_time_tracking_unique_row")
  );
}

/**
 * `timesheet_rows.task_id` is ON DELETE SET NULL, and the unique index
 * `idx_module_time_tracking_unique_row` treats a null task_id as ''.
 * Nulling without a distinct manual title collides with an existing
 * project/phase row for the same user/week (or with another task already
 * detached that week). Stamp the title and detach before the parent delete.
 *
 * `time_entries` no longer stores task_id — those columns live on
 * timesheet_rows after the relational migration.
 */
export async function detachTimesheetRowsForTaskDelete(
  supabase: Pick<SupabaseClient, "schema">,
  args: {
    scopeId: string;
    taskId: string;
    taskTitle: string;
    tenantId: string;
  }
): Promise<void> {
  const preservedTitle = args.taskTitle.trim() || "Deleted task";
  const rows = () =>
    supabase.schema(TIME_TRACKING_SCHEMA).from("timesheet_rows");

  const { error: detachError } = await rows()
    .update({
      task_id: null,
      manual_task_title: preservedTitle,
    })
    .eq("task_id", args.taskId)
    .eq("tenant_id", args.tenantId)
    .eq("scope_id", args.scopeId);

  if (!detachError) {
    return;
  }

  if (!isTimesheetRowUniqueViolation(detachError)) {
    throw new Error(
      `Failed to detach time-tracking rows for task: ${detachError.message}`
    );
  }

  // Duplicate titles (or an already-titled sibling) still collide. Drop the
  // task-linked rows so the parent delete can proceed; hours on those rows
  // go with them (siblings for the same week/project/phase are kept).
  const { error: deleteError } = await rows()
    .delete()
    .eq("task_id", args.taskId)
    .eq("tenant_id", args.tenantId)
    .eq("scope_id", args.scopeId);
  if (deleteError) {
    throw new Error(
      `Failed to detach time-tracking rows for task: ${deleteError.message}`
    );
  }
}
