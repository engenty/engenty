import type { SupabaseClient } from "@supabase/supabase-js";
import { format, parseISO, startOfWeek } from "date-fns";
import { uuidv7 } from "uuidv7";
import type {
  TimeEntry,
  TimeEntryCreateInput,
  TimeEntryListFilters,
  TimeEntryListResult,
  TimeEntryMoveInput,
  TimeEntrySummarizeGroupBy,
  TimeEntrySummarizeResult,
  TimeEntryValueUpdateInput,
  TimesheetRow,
  TrackingRow,
} from "../schema/types.js";
import { isPrincipalTenantAdmin } from "./admin.js";
import { listAssignmentRows } from "./assignment-rows.js";
import {
  ensureTaskCollaborator,
  hasProjectsDataSource,
  hasTasksDataSource,
  listAllTasks,
  listGeneralTasksForProject,
  listPhases,
  listProjects,
  listTasksByPhase,
  listTasksForUser,
} from "./catalog.js";
import {
  getTimeEntryById,
  listTimeEntries,
  summarizeTimeEntries,
} from "./query-entries.js";
import { dbRowToTimesheetRow } from "./time-entry-mapper.js";

export function createTimeTrackingRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const supabase = adapter as SupabaseClient;
  const schema = "module_time_tracking";
  const entries = () => supabase.schema(schema).from("time_entries");
  const rows = () => supabase.schema(schema).from("timesheet_rows");

  async function listWeekEntries(
    userId: string,
    weekStart: string,
    weekEnd: string
  ) {
    const result = await listTimeEntries(supabase, tenantId, scopeId, {
      date_from: weekStart,
      date_to: weekEnd,
      user_ids: [userId],
      include_manual: true,
      page: 1,
      page_size: 500,
    });
    return result.entries;
  }

  async function listEntries(
    filters: TimeEntryListFilters
  ): Promise<TimeEntryListResult> {
    return listTimeEntries(supabase, tenantId, scopeId, filters);
  }

  async function summarizeEntries(
    filters: Omit<TimeEntryListFilters, "page" | "page_size">,
    groupBy: TimeEntrySummarizeGroupBy[]
  ): Promise<TimeEntrySummarizeResult> {
    return summarizeTimeEntries(supabase, tenantId, scopeId, filters, groupBy);
  }

  async function getEntry(id: string): Promise<TimeEntry | null> {
    return getTimeEntryById(supabase, tenantId, scopeId, id);
  }

  async function getOrCreateTimesheetRow(
    userId: string,
    weekStart: string,
    meta: {
      project_id?: string | null;
      phase_id?: string | null;
      task_id?: string | null;
      manual_project_title?: string | null;
      manual_phase_title?: string | null;
      manual_task_title?: string | null;
      discipline?: string | null;
    }
  ): Promise<string> {
    function matchNullable<
      T extends {
        is: (col: string, v: null) => T;
        eq: (col: string, v: string) => T;
      },
    >(q: T, col: string, val: string | null | undefined): T {
      return val == null ? q.is(col, null) : q.eq(col, val);
    }

    let q = rows()
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("user_id", userId)
      .eq("week_start", weekStart);

    q = matchNullable(q, "project_id", meta.project_id);
    q = matchNullable(q, "phase_id", meta.phase_id);
    q = matchNullable(q, "task_id", meta.task_id);
    q = matchNullable(q, "manual_project_title", meta.manual_project_title);
    q = matchNullable(q, "manual_phase_title", meta.manual_phase_title);
    q = matchNullable(q, "manual_task_title", meta.manual_task_title);
    q = matchNullable(q, "discipline", meta.discipline);

    const { data: existing, error: findErr } = await q.maybeSingle();

    if (!findErr && existing) {
      return (existing as { id: string }).id;
    }

    const rowId = uuidv7();
    const newRow = {
      id: rowId,
      tenant_id: tenantId,
      scope_id: scopeId,
      user_id: userId,
      week_start: weekStart,
      project_id: meta.project_id ?? null,
      phase_id: meta.phase_id ?? null,
      task_id: meta.task_id ?? null,
      manual_project_title: meta.manual_project_title ?? null,
      manual_phase_title: meta.manual_phase_title ?? null,
      manual_task_title: meta.manual_task_title ?? null,
      discipline: meta.discipline ?? null,
    };

    const { error: insertErr } = await rows().insert(newRow);
    if (insertErr) {
      // Handle race condition: if it was inserted concurrently, find it
      const { data: retry } = await q.maybeSingle();
      if (retry) {
        return (retry as { id: string }).id;
      }
      throw new Error(`Failed to create timesheet row: ${insertErr.message}`);
    }

    return rowId;
  }

  async function create(input: TimeEntryCreateInput): Promise<TimeEntry> {
    const weekStart = format(
      startOfWeek(parseISO(input.date), { weekStartsOn: 1 }),
      "yyyy-MM-dd"
    );

    const rowId = await getOrCreateTimesheetRow(input.user_id, weekStart, {
      project_id: input.project_id,
      phase_id: input.phase_id,
      task_id: input.task_id,
      manual_project_title: input.manual_project_title,
      manual_phase_title: input.manual_phase_title,
      manual_task_title: input.manual_task_title,
      discipline: input.discipline,
    });

    const entryId = uuidv7();
    const newEntry = {
      id: entryId,
      timesheet_row_id: rowId,
      tenant_id: tenantId,
      scope_id: scopeId,
      user_id: input.user_id,
      date: input.date,
      hours: input.hours,
      start_time: input.start_time ?? null,
      notes: input.notes ?? null,
      created_by: input.created_by,
    };

    const { data, error } = await entries().insert(newEntry).select().single();
    if (!error && data) {
      const fullEntry = await getEntry(entryId);
      if (fullEntry) {
        return fullEntry;
      }
    }

    // Duplicate key conflict on (timesheet_row_id, date)
    if (error && error.code === "23505") {
      const { data: existing } = await entries()
        .select()
        .eq("timesheet_row_id", rowId)
        .eq("date", input.date)
        .maybeSingle();

      if (existing) {
        const { data: updated, error: updateErr } = await entries()
          .update({
            hours: input.hours,
            start_time: input.start_time ?? null,
            notes: input.notes ?? null,
          })
          .eq("id", (existing as Record<string, unknown>).id as string)
          .select()
          .single();

        if (!updateErr && updated) {
          const fullEntry = await getEntry(
            (existing as Record<string, unknown>).id as string
          );
          if (fullEntry) {
            return fullEntry;
          }
        }
      }
    }

    throw new Error(`Failed to create time entry: ${error?.message}`);
  }

  return {
    listWeekEntries,
    listEntries,
    summarizeEntries,
    getEntry,
    createRow: async (
      userId: string,
      weekStart: string,
      meta: Parameters<typeof getOrCreateTimesheetRow>[2]
    ): Promise<TimesheetRow> => {
      const rowId = await getOrCreateTimesheetRow(userId, weekStart, meta);
      const { data } = await rows().select().eq("id", rowId).single();
      return dbRowToTimesheetRow(data);
    },
    deleteRow: async (rowId: string): Promise<boolean> => {
      const { error } = await rows().delete().eq("id", rowId);
      if (error) {
        throw new Error(`Failed to delete timesheet row: ${error.message}`);
      }
      return true;
    },
    listRows: async (userId: string, weekEntries: TimeEntry[]) => {
      const weekStart =
        weekEntries.length > 0
          ? format(
              startOfWeek(parseISO(weekEntries[0].date), { weekStartsOn: 1 }),
              "yyyy-MM-dd"
            )
          : "";

      // Fetch all timesheet rows for the week
      let timesheetDbRows: any[] = [];
      if (weekStart) {
        const { data, error } = await rows()
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .eq("user_id", userId)
          .eq("week_start", weekStart);
        if (!error && data) {
          timesheetDbRows = data;
        }
      }

      // Fetch active task assignments
      const assignmentRows = await listAssignmentRows(
        supabase,
        tenantId,
        scopeId,
        userId
      );

      // Fetch task contexts for all timesheetDbRows tasks to resolve project/phase associations
      const dbTaskIds = [
        ...new Set(
          timesheetDbRows
            .map((r) => r.task_id)
            .filter(Boolean)
            .map(String)
        ),
      ];
      const taskProjectPhaseMap = new Map<
        string,
        { projectId: string; phaseId: string | null }
      >();
      if (dbTaskIds.length > 0) {
        const { data: dbCtxRows } = await supabase
          .schema("module_tasks")
          .from("task_contexts")
          .select("task_id, context_id, metadata")
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .eq("context_type", "project")
          .in("task_id", dbTaskIds);

        for (const ctx of dbCtxRows ?? []) {
          const meta = ctx.metadata as Record<string, unknown> | null;
          taskProjectPhaseMap.set(String(ctx.task_id), {
            projectId: String(ctx.context_id),
            phaseId: meta?.phase_id ? String(meta.phase_id) : null,
          });
        }
      }

      // Collect project phase and task IDs that we need to resolve titles for
      const projectIds = new Set<string>();
      const phaseIds = new Set<string>();
      const taskIds = new Set<string>();

      for (const row of timesheetDbRows) {
        if (row.task_id) {
          const assoc = taskProjectPhaseMap.get(String(row.task_id));
          if (assoc) {
            row.project_id = row.project_id ?? assoc.projectId;
            row.phase_id = row.phase_id ?? assoc.phaseId;
          }
        }
        if (row.project_id) {
          projectIds.add(String(row.project_id));
        }
        if (row.phase_id) {
          phaseIds.add(String(row.phase_id));
        }
        if (row.task_id) {
          taskIds.add(String(row.task_id));
        }
      }

      const [{ data: projectRows }, { data: phaseRows }, { data: taskRows }] =
        await Promise.all([
          projectIds.size > 0
            ? supabase
                .schema("module_projects")
                .from("projects")
                .select("id, title, client_name")
                .in("id", [...projectIds])
            : Promise.resolve({ data: [] }),
          phaseIds.size > 0
            ? supabase
                .schema("module_projects")
                .from("project_phases")
                .select("id, title")
                .in("id", [...phaseIds])
            : Promise.resolve({ data: [] }),
          taskIds.size > 0
            ? supabase
                .schema("module_tasks")
                .from("tasks")
                .select("id, title, identifier")
                .in("id", [...taskIds])
            : Promise.resolve({ data: [] }),
        ]);

      const projectMap = new Map(
        (projectRows ?? []).map((p) => [String(p.id), p])
      );
      const phaseMap = new Map((phaseRows ?? []).map((p) => [String(p.id), p]));
      const taskMap = new Map((taskRows ?? []).map((t) => [String(t.id), t]));

      function getRowMatchKey(row: {
        project_id?: string | null;
        phase_id?: string | null;
        task_id?: string | null;
        manual_project_title?: string | null;
        manual_phase_title?: string | null;
        manual_task_title?: string | null;
        discipline?: string | null;
      }) {
        // Task rows are identified by the task alone — assignment rows carry
        // grouping sentinels (e.g. project_id "standalone_tasks") that DB
        // timesheet rows never store, so comparing all fields would split the
        // same task into two rows.
        if (row.task_id) {
          return `task::${row.task_id}::${row.discipline ?? "null"}`;
        }
        return [
          row.project_id ?? "null",
          row.phase_id ?? "null",
          row.manual_project_title ?? "null",
          row.manual_phase_title ?? "null",
          row.manual_task_title ?? "null",
          row.discipline ?? "null",
        ].join("::");
      }

      const map = new Map<string, TrackingRow>();

      // 1. Add all DB timesheet rows
      for (const dbRow of timesheetDbRows) {
        const proj = dbRow.project_id
          ? projectMap.get(String(dbRow.project_id))
          : null;
        const phase = dbRow.phase_id
          ? phaseMap.get(String(dbRow.phase_id))
          : null;
        const task = dbRow.task_id ? taskMap.get(String(dbRow.task_id)) : null;

        const isTask = Boolean(dbRow.task_id || dbRow.manual_task_title);
        const isPhase =
          !isTask && Boolean(dbRow.phase_id || dbRow.manual_phase_title);
        const type: TrackingRow["type"] = isTask
          ? "task"
          : isPhase
            ? "phase"
            : "project";

        let projectTitle = dbRow.manual_project_title ?? "Project";
        let phaseTitle = dbRow.manual_phase_title ?? undefined;
        let taskTitle = dbRow.manual_task_title ?? undefined;
        let clientName = "Manual";

        if (proj) {
          projectTitle = String(proj.title);
          clientName = proj.client_name ? String(proj.client_name) : "Manual";
        } else if (task) {
          // Standalone task without project context — mirror assignment rows.
          projectTitle = "Tasks";
          clientName = "Internal";
        }
        if (phase) {
          phaseTitle = String(phase.title);
        }
        if (task) {
          taskTitle = task.identifier
            ? `${task.identifier} · ${task.title}`
            : String(task.title);
        }

        // Task rows whose project reference doesn't resolve (e.g. task
        // contexts pointing at non-project containers) present as standalone
        // tasks — same as assignment rows do.
        const danglingTaskProject = Boolean(task) && !proj;

        const tRow: TrackingRow = {
          id: dbRow.id,
          type,
          project_id: danglingTaskProject ? null : dbRow.project_id,
          phase_id: danglingTaskProject && !phase ? null : dbRow.phase_id,
          task_id: dbRow.task_id,
          project_title: projectTitle,
          phase_title: phaseTitle,
          task_title: taskTitle,
          client_name: clientName,
          planned_hours: 0,
          discipline: dbRow.discipline ?? undefined,
        };

        map.set(getRowMatchKey(tRow), tRow);
      }

      // 2. Add assignment rows, merging with existing DB rows if they match
      for (const assignRow of assignmentRows) {
        const key = getRowMatchKey(assignRow);
        const existing = map.get(key);
        if (existing) {
          existing.planned_hours = assignRow.planned_hours;
        } else {
          map.set(key, assignRow);
        }
      }

      return [...map.values()].sort((a, b) => {
        const client = a.client_name.localeCompare(b.client_name);
        if (client !== 0) {
          return client;
        }
        const project = a.project_title.localeCompare(b.project_title);
        if (project !== 0) {
          return project;
        }
        const order = { project: 0, phase: 1, task: 2 };
        return order[a.type] - order[b.type];
      });
    },
    create,
    update: async (
      id: string,
      patch: TimeEntryValueUpdateInput
    ): Promise<TimeEntry | null> => {
      const existing = await getEntry(id);
      if (!existing) {
        return null;
      }

      const disciplineChanged =
        patch.discipline !== undefined &&
        patch.discipline !== existing.discipline;

      let targetRowId = existing.timesheet_row_id;

      if (disciplineChanged) {
        const weekStart = format(
          startOfWeek(parseISO(existing.date), { weekStartsOn: 1 }),
          "yyyy-MM-dd"
        );

        const { data: dbRow, error: rowErr } = await rows()
          .select("*")
          .eq("id", existing.timesheet_row_id)
          .single();

        if (rowErr || !dbRow) {
          throw new Error(
            `Failed to load timesheet row for update: ${
              rowErr?.message || "not found"
            }`
          );
        }

        targetRowId = await getOrCreateTimesheetRow(
          existing.user_id,
          weekStart,
          {
            project_id: dbRow.project_id,
            phase_id: dbRow.phase_id,
            task_id: dbRow.task_id,
            manual_project_title: dbRow.manual_project_title,
            manual_phase_title: dbRow.manual_phase_title,
            manual_task_title: dbRow.manual_task_title,
            discipline: patch.discipline,
          }
        );
      }

      const dbPatch: Record<string, any> = {};
      if (patch.hours !== undefined) {
        dbPatch.hours = patch.hours;
      }
      if (patch.notes !== undefined) {
        dbPatch.notes = patch.notes;
      }
      if (patch.start_time !== undefined) {
        dbPatch.start_time = patch.start_time;
      }
      if (disciplineChanged) {
        dbPatch.timesheet_row_id = targetRowId;
      }

      if (Object.keys(dbPatch).length === 0) {
        return existing;
      }

      const { data, error } = await entries()
        .update(dbPatch)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        throw new Error(`Failed to update time entry: ${error.message}`);
      }
      return getEntry(id);
    },
    move: async (
      id: string,
      patch: TimeEntryMoveInput
    ): Promise<TimeEntry | null> => {
      const existing = await getEntry(id);
      if (!existing) {
        return null;
      }

      const weekStart = format(
        startOfWeek(parseISO(patch.date), { weekStartsOn: 1 }),
        "yyyy-MM-dd"
      );

      const targetRowId = await getOrCreateTimesheetRow(
        patch.user_id ?? existing.user_id,
        weekStart,
        {
          project_id:
            patch.project_id === undefined
              ? existing.project_id
              : patch.project_id,
          phase_id:
            patch.phase_id === undefined ? existing.phase_id : patch.phase_id,
          task_id:
            patch.task_id === undefined ? existing.task_id : patch.task_id,
          manual_project_title:
            patch.manual_project_title === undefined
              ? existing.manual_project_title
              : patch.manual_project_title,
          manual_phase_title:
            patch.manual_phase_title === undefined
              ? existing.manual_phase_title
              : patch.manual_phase_title,
          manual_task_title:
            patch.manual_task_title === undefined
              ? existing.manual_task_title
              : patch.manual_task_title,
          discipline:
            patch.discipline === undefined
              ? existing.discipline
              : patch.discipline,
        }
      );

      const { data, error } = await entries()
        .update({
          timesheet_row_id: targetRowId,
          date: patch.date,
          user_id: patch.user_id ?? existing.user_id,
          ...(patch.start_time === undefined
            ? {}
            : { start_time: patch.start_time }),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        throw new Error(`Failed to move time entry: ${error.message}`);
      }

      return getEntry(id);
    },
    delete: async (id: string): Promise<boolean> => {
      const { error } = await entries().delete().eq("id", id);
      if (error) {
        throw new Error(`Failed to delete time entry: ${error.message}`);
      }
      return true;
    },
    listProjectGeneralTasks: (projectId: string) =>
      listGeneralTasksForProject(supabase, tenantId, scopeId, projectId),
    listProjects: () => listProjects(supabase),
    hasProjectsDataSource: () => hasProjectsDataSource(supabase),
    listPhases: (projectId: string) => listPhases(supabase, projectId),
    listTasks: (phaseId: string) =>
      listTasksByPhase(supabase, tenantId, scopeId, phaseId),
    listTasksForUser: (
      userId: string,
      filters?: { project_id?: string; phase_id?: string }
    ) => listTasksForUser(supabase, tenantId, scopeId, userId, filters),
    listAllTasks: () => listAllTasks(supabase, tenantId, scopeId),
    ensureTaskCollaborator: (taskId: string, userId: string) =>
      ensureTaskCollaborator(supabase, taskId, userId),
    hasTasksDataSource: () => hasTasksDataSource(supabase),
    isPrincipalTenantAdmin: (principalId: string) =>
      isPrincipalTenantAdmin(supabase, principalId, tenantId),
    makeRowId: () => "manual_row",
  };
}
