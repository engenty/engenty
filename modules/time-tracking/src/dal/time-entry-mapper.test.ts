import { describe, expect, it } from "vitest";
import { dbRowToTimesheetRow, rowToTimeEntry } from "./time-entry-mapper.js";

describe("rowToTimeEntry", () => {
  it("flattens a joined timesheet row", () => {
    const entry = rowToTimeEntry({
      id: "entry-1",
      date: "2026-06-08",
      hours: 4.5,
      notes: "test notes",
      timesheet_row_id: "row-1",
      created_by: "user-1",
      created_at: "2026-06-08T00:00:00Z",
      updated_at: "2026-06-08T00:00:00Z",
      timesheet_rows: {
        id: "row-1",
        tenant_id: "tenant-1",
        scope_id: "scope-1",
        user_id: "user-1",
        week_start: "2026-06-08",
        project_id: "project-1",
        phase_id: "phase-1",
        task_id: "task-1",
        discipline: "Development",
      },
    });

    expect(entry).toEqual({
      id: "entry-1",
      tenant_id: "tenant-1",
      scope_id: "scope-1",
      user_id: "user-1",
      date: "2026-06-08",
      hours: 4.5,
      start_time: null,
      notes: "test notes",
      project_id: "project-1",
      phase_id: "phase-1",
      task_id: "task-1",
      discipline: "Development",
      manual_project_title: null,
      manual_phase_title: null,
      manual_task_title: null,
      created_by: "user-1",
      created_at: "2026-06-08T00:00:00Z",
      updated_at: "2026-06-08T00:00:00Z",
      timesheet_row_id: "row-1",
    });
  });

  it("normalizes start_time to HH:MM", () => {
    const entry = rowToTimeEntry({
      id: "entry-1",
      date: "2026-06-08",
      hours: 1,
      start_time: "09:15:00",
      created_by: "user-1",
      created_at: "2026-06-08T00:00:00Z",
      updated_at: "2026-06-08T00:00:00Z",
      timesheet_row_id: "row-1",
    });
    expect(entry.start_time).toBe("09:15");
  });
});

describe("dbRowToTimesheetRow", () => {
  it("maps timesheet row correctly", () => {
    const tsRow = dbRowToTimesheetRow({
      id: "row-1",
      tenant_id: "tenant-1",
      scope_id: "scope-1",
      user_id: "user-1",
      week_start: "2026-06-08",
      project_id: "project-1",
      phase_id: null,
      task_id: null,
      manual_project_title: null,
      manual_phase_title: null,
      manual_task_title: null,
      discipline: "Design",
      created_at: "2026-06-08T00:00:00Z",
      updated_at: "2026-06-08T00:00:00Z",
    });

    expect(tsRow.discipline).toBe("Design");
    expect(tsRow.project_id).toBe("project-1");
  });
});
