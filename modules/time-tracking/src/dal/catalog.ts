import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PhaseOption,
  ProjectOption,
  TaskOption,
} from "../schema/types.js";

export async function hasProjectsDataSource(
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .schema("module_projects")
    .from("projects")
    .select("id")
    .limit(1);
  return !error;
}

export async function hasTasksDataSource(
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .schema("module_tasks")
    .from("tasks")
    .select("id")
    .limit(1);
  return !error;
}

export async function listProjects(
  supabase: SupabaseClient
): Promise<ProjectOption[]> {
  const { data, error } = await supabase
    .schema("module_projects")
    .from("projects")
    .select("id, title, client_name")
    .order("title", { ascending: true });
  if (error) {
    return [];
  }
  return (data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    title: String((row as { title: string }).title),
    client_name: (row as { client_name: string | null }).client_name
      ? String((row as { client_name: string }).client_name)
      : null,
  }));
}

export async function listPhases(
  supabase: SupabaseClient,
  projectId: string
): Promise<PhaseOption[]> {
  const { data, error } = await supabase
    .schema("module_projects")
    .from("project_phases")
    .select("id, title")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true });
  if (error) {
    return [];
  }
  return (data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    title: String((row as { title: string }).title),
  }));
}

export async function listTasksByPhase(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  phaseId: string
): Promise<TaskOption[]> {
  const { data: ctxRows, error: ctxErr } = await supabase
    .schema("module_tasks")
    .from("task_contexts")
    .select("task_id, metadata")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .eq("context_type", "project");
  if (ctxErr) {
    return [];
  }

  const taskIds = (ctxRows ?? [])
    .filter((row) => {
      const meta = row.metadata as Record<string, unknown> | null;
      return String(meta?.phase_id ?? "") === phaseId;
    })
    .map((row) => String(row.task_id));
  if (taskIds.length === 0) {
    return [];
  }

  return listTasksByIds(supabase, tenantId, scopeId, taskIds);
}

export async function listTasksForUser(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  userId: string,
  filters?: { project_id?: string; phase_id?: string }
): Promise<TaskOption[]> {
  const [{ data: primaryTasks }, { data: collabRows }] = await Promise.all([
    supabase
      .schema("module_tasks")
      .from("tasks")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("primary_assignee_user_id", userId),
    supabase
      .schema("module_tasks")
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

  let ids = [...taskIds];
  if (filters?.project_id || filters?.phase_id) {
    const { data: ctxRows, error: ctxErr } = await supabase
      .schema("module_tasks")
      .from("task_contexts")
      .select("task_id, context_id, metadata")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("context_type", "project")
      .in("task_id", ids);
    if (ctxErr) {
      return [];
    }
    ids = (ctxRows ?? [])
      .filter((row) => {
        if (
          filters.project_id &&
          String(row.context_id) !== filters.project_id
        ) {
          return false;
        }
        if (filters.phase_id) {
          const meta = row.metadata as Record<string, unknown> | null;
          return String(meta?.phase_id ?? "") === filters.phase_id;
        }
        return true;
      })
      .map((row) => String(row.task_id));
    if (ids.length === 0) {
      return [];
    }
  }

  return listTasksByIds(supabase, tenantId, scopeId, ids);
}

export async function listGeneralTasksForProject(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  projectId: string
): Promise<TaskOption[]> {
  const { data: ctxRows } = await supabase
    .schema("module_tasks")
    .from("task_contexts")
    .select("task_id, metadata")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .eq("context_type", "project")
    .eq("context_id", projectId);

  const phasedTaskIds = new Set<string>();
  const generalCtxTaskIds = new Set<string>();
  for (const row of ctxRows ?? []) {
    const meta = row.metadata as Record<string, unknown> | null;
    if (meta?.phase_id) {
      phasedTaskIds.add(String(row.task_id));
    } else {
      generalCtxTaskIds.add(String(row.task_id));
    }
  }

  const { data: directTasks } = await supabase
    .schema("module_tasks")
    .from("tasks")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .eq("project_id", projectId);

  const allIds = new Set(generalCtxTaskIds);
  for (const row of directTasks ?? []) {
    const id = String((row as { id: string }).id);
    if (!phasedTaskIds.has(id)) {
      allIds.add(id);
    }
  }

  if (allIds.size === 0) {
    return [];
  }
  return listTasksByIds(supabase, tenantId, scopeId, [...allIds]);
}

export async function listAllTasks(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string
): Promise<TaskOption[]> {
  const { data, error } = await supabase
    .schema("module_tasks")
    .from("tasks")
    .select("id, title, identifier")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .is("completed_at", null)
    .order("title", { ascending: true });
  if (error) {
    return [];
  }
  return (data ?? []).map((row) => {
    const task = row as { id: string; title: string; identifier?: string };
    const label = task.identifier
      ? `${task.identifier} · ${task.title}`
      : task.title;
    return { id: String(task.id), title: label };
  });
}

export async function ensureTaskCollaborator(
  supabase: SupabaseClient,
  taskId: string,
  userId: string
): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .schema("module_tasks")
      .from("task_collaborators")
      .select("task_id")
      .eq("task_id", taskId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return true;
    }

    const { data: taskRow } = await supabase
      .schema("module_tasks")
      .from("tasks")
      .select("primary_assignee_user_id")
      .eq("id", taskId)
      .maybeSingle();

    const t = taskRow as { primary_assignee_user_id: string | null } | null;
    if (t?.primary_assignee_user_id === userId) {
      return true;
    }

    const { error } = await supabase
      .schema("module_tasks")
      .from("task_collaborators")
      .insert({ task_id: taskId, user_id: userId });

    return !error;
  } catch {
    return false;
  }
}

async function listTasksByIds(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  taskIds: string[]
): Promise<TaskOption[]> {
  const { data, error } = await supabase
    .schema("module_tasks")
    .from("tasks")
    .select("id, title, identifier")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .in("id", taskIds)
    .order("title", { ascending: true });
  if (error) {
    return [];
  }
  return (data ?? []).map((row) => {
    const task = row as { id: string; title: string; identifier?: string };
    const label = task.identifier
      ? `${task.identifier} · ${task.title}`
      : task.title;
    return {
      id: String(task.id),
      title: String(label),
    };
  });
}
