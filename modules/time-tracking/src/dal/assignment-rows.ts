import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrackingRow } from "../schema/types.js";

export async function listAssignmentRows(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  userId: string
): Promise<TrackingRow[]> {
  const tasksSchema = "module_tasks";

  const [{ data: primaryTasks }, { data: collabRows }] = await Promise.all([
    supabase
      .schema(tasksSchema)
      .from("tasks")
      .select("id, title, identifier")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("primary_assignee_user_id", userId),
    supabase
      .schema(tasksSchema)
      .from("task_collaborators")
      .select("task_id")
      .eq("user_id", userId),
  ]);

  const taskIds = new Set<string>();
  for (const row of primaryTasks ?? []) {
    taskIds.add(String((row as { id: string }).id));
  }
  for (const row of collabRows ?? []) {
    taskIds.add(String((row as { task_id: string }).task_id));
  }
  if (taskIds.size === 0) {
    return [];
  }

  const ids = [...taskIds];

  // Fetch contexts and task details in parallel.
  // Task details intentionally omit project_id here — it's resolved below
  // via a separate fault-tolerant step so a missing column never breaks
  // the entire assignment-row fetch.
  const [{ data: ctxRows, error: ctxErr }, { data: taskRows, error: taskErr }] =
    await Promise.all([
      supabase
        .schema(tasksSchema)
        .from("task_contexts")
        .select("task_id, context_id, metadata")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("context_type", "project")
        .in("task_id", ids),
      supabase
        .schema(tasksSchema)
        .from("tasks")
        .select("id, title, identifier")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .in("id", ids),
    ]);

  if (ctxErr || taskErr) {
    return [];
  }

  const taskMap = new Map(
    (taskRows ?? []).map((row) => [
      String((row as { id: string }).id),
      row as { id: string; title: string; identifier?: string },
    ])
  );

  // Try to fetch direct project_id values from tasks. This column was added
  // in a recent migration; if it doesn't exist yet the query fails silently
  // and we fall back to context-only project resolution.
  const { data: taskProjectRows } = await supabase
    .schema(tasksSchema)
    .from("tasks")
    .select("id, project_id")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .in("id", ids);

  const taskProjectMap = new Map(
    (taskProjectRows ?? []).map((row) => [
      String((row as { id: string }).id),
      (row as { project_id?: string | null }).project_id ?? null,
    ])
  );

  const contexts = ctxRows ?? [];

  // Collect ALL project IDs we need to resolve: from task_contexts AND from
  // tasks.project_id (direct linkage added by the project_id migration).
  const allProjectIds = new Set<string>();
  for (const ctx of contexts) {
    allProjectIds.add(String(ctx.context_id));
  }
  for (const [, projectId] of taskProjectMap) {
    if (projectId) {
      allProjectIds.add(String(projectId));
    }
  }

  const phaseIds = [
    ...new Set(
      contexts
        .map((row) => {
          const meta = row.metadata as Record<string, unknown> | null;
          return meta?.phase_id ? String(meta.phase_id) : null;
        })
        .filter((value): value is string => value != null)
    ),
  ];

  const [{ data: projectRows }, { data: phaseRows }] = await Promise.all([
    allProjectIds.size > 0
      ? supabase
          .schema("module_projects")
          .from("projects")
          .select("id, title, client_name")
          .in("id", [...allProjectIds])
      : Promise.resolve({ data: [], error: null }),
    phaseIds.length > 0
      ? supabase
          .schema("module_projects")
          .from("project_phases")
          .select("id, title")
          .in("id", phaseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const projectMap = new Map(
    (projectRows ?? []).map((row) => [
      String((row as { id: string }).id),
      row as { id: string; title: string; client_name: string | null },
    ])
  );
  const phaseMap = new Map(
    (phaseRows ?? []).map((row) => [
      String((row as { id: string }).id),
      row as { id: string; title: string },
    ])
  );

  const rows: TrackingRow[] = [];
  const linkedTaskIds = new Set<string>();

  for (const context of contexts) {
    const taskId = String(context.task_id);
    const task = taskMap.get(taskId);
    if (!task) {
      continue;
    }
    linkedTaskIds.add(taskId);
    const contextProjectId = String(context.context_id);
    const meta = context.metadata as Record<string, unknown> | null;
    const phaseId = meta?.phase_id ? String(meta.phase_id) : null;
    const phase = phaseId ? phaseMap.get(phaseId) : undefined;
    const plannedHours =
      meta?.hours == null || meta?.hours === undefined ? 0 : Number(meta.hours);
    const taskLabel = task.identifier
      ? `${task.identifier} · ${task.title}`
      : task.title;

    // Prefer context project; fall back to task.project_id if context project
    // is missing from module_projects (e.g. linked to a deleted project).
    const directProjectId = taskProjectMap.get(taskId);
    const project =
      projectMap.get(contextProjectId) ??
      (directProjectId ? projectMap.get(String(directProjectId)) : undefined);

    if (project) {
      rows.push({
        id: `task-${taskId}`,
        type: "task",
        project_id: String(project.id),
        phase_id: phaseId,
        task_id: taskId,
        project_title: String(project.title ?? "Project"),
        phase_title: phase?.title ? String(phase.title) : undefined,
        task_title: String(taskLabel ?? "Task"),
        client_name: String(project.client_name ?? "Manual"),
        planned_hours: plannedHours,
      });
      continue;
    }

    rows.push({
      id: `task-${taskId}`,
      type: "task",
      task_id: taskId,
      project_id: "standalone_tasks",
      project_title: "Tasks",
      task_title: String(taskLabel ?? "Task"),
      client_name: "Internal",
      planned_hours: plannedHours,
    });
  }

  // Tasks with no task_contexts entry — use task.project_id directly if set.
  for (const taskId of ids) {
    if (linkedTaskIds.has(taskId)) {
      continue;
    }
    const task = taskMap.get(taskId);
    if (!task) {
      continue;
    }
    const taskLabel = task.identifier
      ? `${task.identifier} · ${task.title}`
      : task.title;

    const directProjectId = taskProjectMap.get(taskId);
    const directProject = directProjectId
      ? projectMap.get(String(directProjectId))
      : undefined;

    if (directProject) {
      rows.push({
        id: `task-${taskId}`,
        type: "task",
        task_id: taskId,
        project_id: String(directProject.id),
        project_title: String(directProject.title),
        task_title: String(taskLabel),
        client_name: directProject.client_name
          ? String(directProject.client_name)
          : "Manual",
        planned_hours: 0,
      });
    } else {
      rows.push({
        id: `task-${taskId}`,
        type: "task",
        task_id: taskId,
        project_id: "standalone_tasks",
        project_title: "Tasks",
        task_title: String(taskLabel),
        client_name: "Internal",
        planned_hours: 0,
      });
    }
  }

  return rows;
}
