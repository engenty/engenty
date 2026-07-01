/**
 * time-entry-mapper.ts
 *
 * Single source of truth for database mapping:
 *  1. DB row → TypeScript TimeEntry shape (rowToTimeEntry)
 *  2. DB row → TypeScript TimesheetRow shape (dbRowToTimesheetRow)
 */
import type { TimeEntry, TimesheetRow, TrackingRow } from "../schema/types.js";

export function rowToTimeEntry(row: Record<string, unknown>): TimeEntry {
  // PostgREST join can return nested timesheet_rows object
  const tsRow =
    (row.timesheet_rows as Record<string, unknown> | null | undefined) || {};
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id ?? tsRow.tenant_id ?? ""),
    scope_id: String(row.scope_id ?? tsRow.scope_id ?? ""),
    user_id: String(row.user_id ?? tsRow.user_id ?? ""),
    date: String(row.date),
    hours: Number(row.hours ?? 0),
    notes: (row.notes as string | null) ?? null,
    project_id: (row.project_id ?? tsRow.project_id ?? null) as string | null,
    phase_id: (row.phase_id ?? tsRow.phase_id ?? null) as string | null,
    task_id: (row.task_id ?? tsRow.task_id ?? null) as string | null,
    discipline: (row.discipline ?? tsRow.discipline ?? null) as string | null,
    manual_project_title: (row.manual_project_title ??
      tsRow.manual_project_title ??
      null) as string | null,
    manual_phase_title: (row.manual_phase_title ??
      tsRow.manual_phase_title ??
      null) as string | null,
    manual_task_title: (row.manual_task_title ??
      tsRow.manual_task_title ??
      null) as string | null,
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    timesheet_row_id: String(row.timesheet_row_id ?? tsRow.id ?? ""),
  };
}

export function dbRowToTimesheetRow(
  row: Record<string, unknown>
): TimesheetRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    user_id: String(row.user_id),
    week_start: String(row.week_start),
    project_id: (row.project_id as string | null) ?? null,
    phase_id: (row.phase_id as string | null) ?? null,
    task_id: (row.task_id as string | null) ?? null,
    manual_project_title: (row.manual_project_title as string | null) ?? null,
    manual_phase_title: (row.manual_phase_title as string | null) ?? null,
    manual_task_title: (row.manual_task_title as string | null) ?? null,
    discipline: (row.discipline as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function makeRowId(
  projectId: string | null,
  phaseId: string | null,
  taskId: string | null,
  manualProjectTitle: string | null,
  manualPhaseTitle: string | null,
  manualTaskTitle: string | null
) {
  return [
    projectId ?? "manual_project",
    phaseId ?? manualPhaseTitle ?? "none_phase",
    taskId ?? manualTaskTitle ?? "none_task",
    manualProjectTitle ?? "none_manual_project",
  ].join("::");
}

export function entryMatchesRow(entry: TimeEntry, row: TrackingRow): boolean {
  return entry.timesheet_row_id === row.id;
}
