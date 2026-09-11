import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PhaseTask,
  PhaseTaskInput,
  PhaseTaskUpdateInput,
  ProjectTaskListItem,
  ProjectTasksPaginatedResponse,
  ProjectTasksQueryParams,
} from "../schema/types.js";

const TASKS_SCHEMA = "module_tasks";
const PROJECT_CONTEXT_TYPE = "project";

export type InvokeTasksFn = (
  operationId: "tasks_create" | "tasks_update" | "tasks_delete" | "tasks_list",
  input: Record<string, unknown>
) => Promise<unknown>;

interface TasksModuleTask {
  collaborator_user_ids?: string[];
  created_at: string;
  description: string | null;
  id: string;
  identifier: string;
  scope_id: string;
  status: string;
  tenant_id: string;
  title: string;
  updated_at: string;
}

interface TaskContextRow {
  context_id: string;
  context_type: string;
  metadata: Record<string, unknown>;
  task_id: string;
}

function projectContextMetadata(input: {
  phase_id?: string | null;
  is_public?: boolean;
  order_index?: number;
  discipline?: string | null;
  hours?: number | null;
}): Record<string, unknown> {
  return {
    ...(input.phase_id === undefined ? {} : { phase_id: input.phase_id }),
    ...(input.is_public === undefined ? {} : { is_public: input.is_public }),
    ...(input.order_index === undefined
      ? {}
      : { order_index: input.order_index }),
    ...(input.discipline === undefined ? {} : { discipline: input.discipline }),
    ...(input.hours === undefined ? {} : { hours: input.hours }),
  };
}

export function mapTasksModuleTaskToPhaseTask(
  task: TasksModuleTask,
  projectId: string,
  context: TaskContextRow
): PhaseTask {
  const meta = context.metadata ?? {};
  const collaboratorIds = task.collaborator_user_ids ?? [];
  return {
    id: task.id,
    tenant_id: task.tenant_id,
    scope_id: task.scope_id,
    project_id: projectId,
    phase_id: (meta.phase_id as string | null | undefined) ?? null,
    title: task.title,
    content: task.description,
    discipline: (meta.discipline as string | null | undefined) ?? null,
    hours:
      meta.hours == null || meta.hours === undefined
        ? null
        : Number(meta.hours),
    status: task.status,
    is_public: Boolean(meta.is_public),
    order_index: Number(meta.order_index ?? 0),
    created_at: task.created_at,
    updated_at: task.updated_at,
    task_team: collaboratorIds.map((user_id) => ({
      task_id: task.id,
      user_id,
    })),
  };
}

async function loadProjectTaskContexts(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  filters?: {
    projectId?: string;
    phaseId?: string | null;
    publicOnly?: boolean;
  }
): Promise<Array<{ context: TaskContextRow; task: TasksModuleTask }>> {
  let ctxQuery = supabase
    .schema(TASKS_SCHEMA)
    .from("task_contexts")
    .select("task_id, context_type, context_id, metadata")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .eq("context_type", PROJECT_CONTEXT_TYPE);

  if (filters?.projectId) {
    ctxQuery = ctxQuery.eq("context_id", filters.projectId);
  }

  const { data: ctxRows, error: ctxErr } = await ctxQuery;
  if (ctxErr) {
    throw new Error(`Failed to load project task contexts: ${ctxErr.message}`);
  }

  let contexts = (ctxRows ?? []) as TaskContextRow[];
  if (filters?.phaseId !== undefined) {
    const phaseId = filters.phaseId;
    contexts = contexts.filter((c) => {
      const metaPhase = c.metadata?.phase_id;
      if (phaseId === null || phaseId === "") {
        return metaPhase == null || metaPhase === "";
      }
      return String(metaPhase) === String(phaseId);
    });
  }
  if (filters?.publicOnly) {
    contexts = contexts.filter((c) => Boolean(c.metadata?.is_public));
  }

  const taskIds = [...new Set(contexts.map((c) => c.task_id))];
  if (taskIds.length === 0) {
    return [];
  }

  const { data: taskRows, error: taskErr } = await supabase
    .schema(TASKS_SCHEMA)
    .from("tasks")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .in("id", taskIds);
  if (taskErr) {
    throw new Error(`Failed to load linked tasks: ${taskErr.message}`);
  }

  const taskMap = new Map(
    (taskRows ?? []).map((row) => [
      String((row as { id: string }).id),
      row as TasksModuleTask,
    ])
  );

  const { data: collabRows } = await supabase
    .schema(TASKS_SCHEMA)
    .from("task_collaborators")
    .select("task_id, user_id")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .in("task_id", taskIds);
  const collabByTask = new Map<string, string[]>();
  for (const row of collabRows ?? []) {
    const taskId = String((row as { task_id: string }).task_id);
    const userId = String((row as { user_id: string }).user_id);
    const list = collabByTask.get(taskId) ?? [];
    list.push(userId);
    collabByTask.set(taskId, list);
  }

  const result: Array<{ context: TaskContextRow; task: TasksModuleTask }> = [];
  for (const context of contexts) {
    const task = taskMap.get(context.task_id);
    if (!task) {
      continue;
    }
    result.push({
      context,
      task: {
        ...task,
        collaborator_user_ids: collabByTask.get(context.task_id) ?? [],
      },
    });
  }
  return result;
}

export async function listProjectLinkedTasks(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  projectId: string,
  filters?: { phaseId?: string | null; publicOnly?: boolean }
): Promise<PhaseTask[]> {
  const rows = await loadProjectTaskContexts(supabase, tenantId, scopeId, {
    projectId,
    phaseId: filters?.phaseId,
    publicOnly: filters?.publicOnly,
  });
  return rows
    .map(({ context, task }) =>
      mapTasksModuleTaskToPhaseTask(task, projectId, context)
    )
    .sort((a, b) => a.order_index - b.order_index);
}

export async function listProjectTaskAssigneeUserIds(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  projectId: string
): Promise<string[]> {
  const linked = await loadProjectTaskContexts(supabase, tenantId, scopeId, {
    projectId,
  });
  const ids = new Set<string>();
  for (const { task } of linked) {
    for (const uid of task.collaborator_user_ids ?? []) {
      ids.add(uid);
    }
  }
  return [...ids];
}

export async function createProjectLinkedTask(
  invokeTasks: InvokeTasksFn,
  projectId: string,
  input: PhaseTaskInput
): Promise<PhaseTask> {
  const created = (await invokeTasks("tasks_create", {
    title: input.title,
    description: input.content ?? null,
    status: input.status ?? "todo",
    project_id: projectId,
    collaborator_user_ids: input.team_member_ids,
    contexts: [
      {
        context_type: PROJECT_CONTEXT_TYPE,
        context_id: projectId,
        metadata: projectContextMetadata({
          phase_id: input.phase_id ?? null,
          is_public: input.is_public ?? false,
          order_index: input.order_index ?? 0,
          discipline: input.discipline ?? null,
          hours: input.hours ?? null,
        }),
      },
    ],
  })) as TasksModuleTask | null;

  if (!created) {
    throw new Error(
      "Task creation failed: tasks module did not return a task."
    );
  }

  return mapTasksModuleTaskToPhaseTask(created, projectId, {
    task_id: created.id,
    context_type: PROJECT_CONTEXT_TYPE,
    context_id: projectId,
    metadata: projectContextMetadata({
      phase_id: input.phase_id ?? null,
      is_public: input.is_public ?? false,
      order_index: input.order_index ?? 0,
      discipline: input.discipline ?? null,
      hours: input.hours ?? null,
    }),
  });
}

async function updateProjectContextMetadata(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  taskId: string,
  projectId: string,
  metadataPatch: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { data: existing, error: loadErr } = await supabase
    .schema(TASKS_SCHEMA)
    .from("task_contexts")
    .select("metadata")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .eq("task_id", taskId)
    .eq("context_type", PROJECT_CONTEXT_TYPE)
    .eq("context_id", projectId)
    .maybeSingle();
  if (loadErr) {
    throw new Error(`Failed to load task context: ${loadErr.message}`);
  }
  const merged = {
    ...(((existing as { metadata?: Record<string, unknown> } | null)
      ?.metadata ?? {}) as Record<string, unknown>),
    ...metadataPatch,
  };
  const { error: updErr } = await supabase
    .schema(TASKS_SCHEMA)
    .from("task_contexts")
    .update({ metadata: merged })
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .eq("task_id", taskId)
    .eq("context_type", PROJECT_CONTEXT_TYPE)
    .eq("context_id", projectId);
  if (updErr) {
    throw new Error(`Failed to update task context: ${updErr.message}`);
  }
  return merged;
}

export async function updateProjectLinkedTask(
  invokeTasks: InvokeTasksFn,
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  projectId: string,
  taskId: string,
  input: PhaseTaskUpdateInput
): Promise<PhaseTask | null> {
  const patch: Record<string, unknown> = { id: taskId };
  if (input.title !== undefined) {
    patch.title = input.title;
  }
  if (input.content !== undefined) {
    patch.description = input.content;
  }
  if (input.status !== undefined) {
    patch.status = input.status;
  }
  if (input.team_member_ids !== undefined) {
    patch.collaborator_user_ids = input.team_member_ids;
  }

  const hasMetadataChanges =
    input.phase_id !== undefined ||
    input.is_public !== undefined ||
    input.order_index !== undefined ||
    input.discipline !== undefined ||
    input.hours !== undefined;

  const { data: ctxRow } = await supabase
    .schema(TASKS_SCHEMA)
    .from("task_contexts")
    .select("metadata")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .eq("task_id", taskId)
    .eq("context_type", PROJECT_CONTEXT_TYPE)
    .eq("context_id", projectId)
    .maybeSingle();

  let metadata = ((ctxRow as { metadata?: Record<string, unknown> } | null)
    ?.metadata ?? {}) as Record<string, unknown>;

  if (hasMetadataChanges) {
    metadata = await updateProjectContextMetadata(
      supabase,
      tenantId,
      scopeId,
      taskId,
      projectId,
      projectContextMetadata({
        ...(input.phase_id === undefined ? {} : { phase_id: input.phase_id }),
        ...(input.is_public === undefined
          ? {}
          : { is_public: input.is_public }),
        ...(input.order_index === undefined
          ? {}
          : { order_index: input.order_index }),
        ...(input.discipline === undefined
          ? {}
          : { discipline: input.discipline }),
        ...(input.hours === undefined ? {} : { hours: input.hours }),
      })
    );
  }

  const hasTaskPatch = Object.keys(patch).length > 1;
  let updated: TasksModuleTask;
  if (hasTaskPatch) {
    updated = (await invokeTasks("tasks_update", patch)) as TasksModuleTask;
  } else {
    const { data: taskRow, error } = await supabase
      .schema(TASKS_SCHEMA)
      .from("tasks")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("id", taskId)
      .maybeSingle();
    if (error || !taskRow) {
      return null;
    }
    updated = taskRow as TasksModuleTask;
  }

  const { data: collabRows } = await supabase
    .schema(TASKS_SCHEMA)
    .from("task_collaborators")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("scope_id", scopeId)
    .eq("task_id", taskId);
  const collabIds =
    input.team_member_ids ??
    (collabRows ?? []).map((r) => String((r as { user_id: string }).user_id));

  return mapTasksModuleTaskToPhaseTask(
    { ...updated, collaborator_user_ids: collabIds },
    projectId,
    {
      task_id: taskId,
      context_type: PROJECT_CONTEXT_TYPE,
      context_id: projectId,
      metadata,
    }
  );
}

export async function deleteProjectLinkedTask(
  invokeTasks: InvokeTasksFn,
  _projectId: string,
  taskId: string
): Promise<boolean> {
  await invokeTasks("tasks_delete", { id: taskId });
  return true;
}

export async function listProjectAssociatedTaskIds(
  invokeTasks: InvokeTasksFn,
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  projectId: string
): Promise<string[]> {
  const ids = new Set<string>();

  for (const task of await listProjectLinkedTasks(
    supabase,
    tenantId,
    scopeId,
    projectId
  )) {
    ids.add(task.id);
  }

  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while ((page - 1) * 200 < total) {
    const listResult = (await invokeTasks("tasks_list", {
      page,
      pageSize: 200,
      project_id: projectId,
    })) as {
      data: Array<{ id: string }>;
      total: number;
    };
    total = listResult.total ?? listResult.data?.length ?? 0;
    for (const task of listResult.data ?? []) {
      ids.add(task.id);
    }
    if ((listResult.data?.length ?? 0) < 200) {
      break;
    }
    page += 1;
  }

  return [...ids];
}

export async function countProjectAssociatedTasks(
  invokeTasks: InvokeTasksFn,
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  projectId: string
): Promise<number> {
  const ids = await listProjectAssociatedTaskIds(
    invokeTasks,
    supabase,
    tenantId,
    scopeId,
    projectId
  );
  return ids.length;
}

export async function listProjectTasksPaginated(
  invokeTasks: InvokeTasksFn,
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  params: ProjectTasksQueryParams,
  assignedToUserId?: string
): Promise<ProjectTasksPaginatedResponse> {
  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 200);

  const listResult = (await invokeTasks("tasks_list", {
    page,
    pageSize,
    search: params.search ?? undefined,
    space_id: params.space_id ?? undefined,
    status: params.status ?? undefined,
    context_type: PROJECT_CONTEXT_TYPE,
    context_id: params.project_id ?? undefined,
    context_metadata_phase_id:
      params.phase_id === undefined ? undefined : params.phase_id,
    scope: params.scope,
    assigned_to:
      params.scope === "mine" ? undefined : (params.assigned_to ?? undefined),
    sortBy: params.sortBy ?? "updated_at",
    sortOrder: params.sortOrder ?? "desc",
  })) as {
    data: TasksModuleTask[];
    page: number;
    pageSize: number;
    total: number;
  };

  let taskRows = listResult.data ?? [];
  if (params.scope === "mine" && assignedToUserId) {
    taskRows = taskRows.filter(
      (task) => task.collaborator_user_ids?.includes(assignedToUserId) ?? false
    );
    const { data: primaryRows } = await supabase
      .schema(TASKS_SCHEMA)
      .from("tasks")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("primary_assignee_user_id", assignedToUserId);
    const primaryIds = new Set(
      (primaryRows ?? []).map((r) => String((r as { id: string }).id))
    );
    taskRows = [
      ...taskRows,
      ...(listResult.data ?? []).filter((t) => primaryIds.has(t.id)),
    ];
    const seen = new Set<string>();
    taskRows = taskRows.filter((t) => {
      if (seen.has(t.id)) {
        return false;
      }
      seen.add(t.id);
      return (
        t.collaborator_user_ids?.includes(assignedToUserId) ||
        primaryIds.has(t.id)
      );
    });
  }

  const taskIds = taskRows.map((t) => t.id);
  const contextByTask = new Map<string, TaskContextRow>();
  if (taskIds.length > 0) {
    const { data: ctxRows, error: ctxErr } = await supabase
      .schema(TASKS_SCHEMA)
      .from("task_contexts")
      .select("task_id, context_type, context_id, metadata")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("context_type", PROJECT_CONTEXT_TYPE)
      .in("task_id", taskIds);
    if (ctxErr) {
      throw new Error(`Failed to load task contexts: ${ctxErr.message}`);
    }
    for (const row of ctxRows ?? []) {
      contextByTask.set(
        String((row as TaskContextRow).task_id),
        row as TaskContextRow
      );
    }
  }

  const projectIds = [
    ...new Set([...contextByTask.values()].map((c) => String(c.context_id))),
  ];
  const phaseIds = [
    ...new Set(
      [...contextByTask.values()]
        .map((c) => c.metadata?.phase_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  const projectMap = new Map<
    string,
    { title: string; client_name: string | null }
  >();
  if (projectIds.length > 0) {
    const { data: projectsData } = await supabase
      .schema("module_projects")
      .from("projects")
      .select("id, title, client_name")
      .in("id", projectIds);
    for (const p of projectsData ?? []) {
      const row = p as {
        id: string;
        title: string;
        client_name: string | null;
      };
      projectMap.set(row.id, {
        title: row.title,
        client_name: row.client_name,
      });
    }
  }

  const phaseMap = new Map<string, string>();
  if (phaseIds.length > 0) {
    const { data: phasesData } = await supabase
      .schema("module_projects")
      .from("project_phases")
      .select("id, title")
      .in("id", phaseIds);
    for (const ph of phasesData ?? []) {
      const row = ph as { id: string; title: string };
      phaseMap.set(row.id, row.title);
    }
  }

  const data: ProjectTaskListItem[] = [];
  for (const task of taskRows) {
    const context = contextByTask.get(task.id);
    if (!context) {
      continue;
    }
    const phaseTask = mapTasksModuleTaskToPhaseTask(
      task,
      context.context_id,
      context
    );
    const proj = projectMap.get(phaseTask.project_id);
    data.push({
      ...phaseTask,
      project_title: proj?.title ?? "",
      client_name: proj?.client_name ?? null,
      phase_title: phaseTask.phase_id
        ? (phaseMap.get(phaseTask.phase_id) ?? null)
        : null,
    });
  }

  return {
    data,
    total:
      params.scope === "mine" ? data.length : (listResult.total ?? data.length),
    page: listResult.page ?? page,
    pageSize: listResult.pageSize ?? pageSize,
  };
}
