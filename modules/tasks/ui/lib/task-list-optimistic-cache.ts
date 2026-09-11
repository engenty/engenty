import type {
  Task,
  TaskCreateInput,
  TasksQueryParams,
} from "../../src/schema/types.js";

export function optimisticTask(
  input: TaskCreateInput,
  id: string,
  now = new Date().toISOString()
): Task {
  return {
    blocked_by_task_ids: input.blocked_by_task_ids ?? [],
    cancelled_at: null,
    checkout_run_id: null,
    collaborator_user_ids: input.collaborator_user_ids ?? [],
    completed_at: null,
    created_at: now,
    created_by_agent_type_key: input.created_by_agent_type_key ?? null,
    created_by_user_id: null,
    description: input.description ?? null,
    due_date: input.due_date ?? null,
    id,
    identifier: id,
    parent_id: input.parent_id ?? null,
    primary_assignee_agent_type_key:
      input.primary_assignee_agent_type_key ?? null,
    primary_assignee_kind: input.primary_assignee_kind ?? "none",
    primary_assignee_user_id: input.primary_assignee_user_id ?? null,
    priority: input.priority ?? "medium",
    project_id: input.project_id ?? null,
    scope_id: "",
    space_id: input.space_id ?? "",
    started_at: null,
    status: input.status ?? "todo",
    tenant_id: "",
    title: input.title,
    updated_at: now,
  };
}

export function taskMatchesList(task: Task, params: TasksQueryParams): boolean {
  const assignee =
    task.primary_assignee_user_id ??
    task.primary_assignee_agent_type_key ??
    null;
  return (
    (!params.status || task.status === params.status) &&
    (!params.project_id || task.project_id === params.project_id) &&
    (!params.parent_id || task.parent_id === params.parent_id) &&
    (!params.space_id || task.space_id === params.space_id) &&
    (!params.assigned_to || assignee === params.assigned_to) &&
    (!params.search ||
      task.title.toLowerCase().includes(params.search.toLowerCase()))
  );
}
