import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import {
  assertGoalDepth,
  canTransitionGoalStatus,
} from "../domain/goal-lifecycle.js";
import {
  assertAgentTaskGoal,
  canTransitionTaskStatus,
  normalizeTaskAssignees,
  resolveTaskGoalId,
  TASK_AGENT_CHECKOUT_ENTRY_STATUSES,
  type TaskStatus,
} from "../domain/task-lifecycle.js";
import { TaskCheckoutConflictError } from "../lib/task-checkout-errors.js";
import {
  definitionsToSettingsSlice,
  mergeTaskStatusDefinitionsFromPayload,
  normalizeTaskStatusDefinitionsFromStorage,
} from "../lib/task-status-settings.js";
import type {
  Goal,
  GoalCreateInput,
  GoalsPaginatedResponse,
  GoalsQueryParams,
  GoalUpdateInput,
  Task,
  TaskActivity,
  TaskActivityEventType,
  TaskCheckoutInput,
  TaskComment,
  TaskContext,
  TaskContextInput,
  TaskCreateInput,
  TaskDetail,
  TaskReleaseInput,
  TaskRun,
  TaskSettings,
  TaskSettingsUpdateInput,
  TasksPaginatedResponse,
  TasksQueryParams,
  TaskUpdateInput,
} from "../schema/types.js";
import { allocateTaskIdentifier } from "./task-identifier.js";

const SCHEMA = "module_tasks";

export interface TasksRepoAuditOptions {
  /** Bus fan-out hook for task activity rows (fire-and-forget). */
  onActivity?: (
    activity: TaskActivity,
    scope: { scopeId: string; tenantId: string }
  ) => Promise<void> | void;
  recordAuditEvent?: (event: {
    type: string;
    detail?: Record<string, unknown>;
  }) => void;
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    identifier: String(row.identifier),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    status: String(row.status),
    priority: row.priority as Task["priority"],
    goal_id: (row.goal_id as string | null) ?? null,
    parent_id: (row.parent_id as string | null) ?? null,
    project_id: (row.project_id as string | null) ?? null,
    primary_assignee_kind:
      row.primary_assignee_kind as Task["primary_assignee_kind"],
    primary_assignee_user_id:
      (row.primary_assignee_user_id as string | null) ?? null,
    primary_assignee_agent_type_key:
      (row.primary_assignee_agent_type_key as string | null) ?? null,
    created_by_user_id: (row.created_by_user_id as string | null) ?? null,
    created_by_agent_type_key:
      (row.created_by_agent_type_key as string | null) ?? null,
    due_date: (row.due_date as string | null) ?? null,
    request_depth: Number(row.request_depth ?? 0),
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    checkout_run_id: (row.checkout_run_id as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToGoal(row: Record<string, unknown>): Goal {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    status: row.status as Goal["status"],
    parent_id: (row.parent_id as string | null) ?? null,
    project_id: (row.project_id as string | null) ?? null,
    owner_user_id: (row.owner_user_id as string | null) ?? null,
    owner_agent_id: (row.owner_agent_id as string | null) ?? null,
    level: String(row.level ?? "task"),
    target_date: (row.target_date as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToTaskRun(row: Record<string, unknown>): TaskRun {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    task_id: String(row.task_id),
    agent_session_run_id: String(row.agent_session_run_id),
    role: row.role as TaskRun["role"],
    created_at: String(row.created_at),
  };
}

function rowToTaskActivity(row: Record<string, unknown>): TaskActivity {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    scope_id: String(row.scope_id),
    task_id: String(row.task_id),
    event_type: String(row.event_type),
    payload: ((row.payload as Record<string, unknown>) ?? {}) as Record<
      string,
      unknown
    >,
    actor_user_id: (row.actor_user_id as string | null) ?? null,
    actor_agent_type_key: (row.actor_agent_type_key as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

export function createTasksRepoSupabase(
  supabase: SupabaseClient,
  tenantId: string,
  scopeId: string,
  audit?: TasksRepoAuditOptions
) {
  const options = audit;
  const record = (type: string, detail?: Record<string, unknown>) => {
    audit?.recordAuditEvent?.({ type, detail });
  };

  const settingsTable = () => supabase.schema(SCHEMA).from("tenant_settings");
  const goals = () => supabase.schema(SCHEMA).from("goals");
  const tasks = () => supabase.schema(SCHEMA).from("tasks");
  const collaborators = () =>
    supabase.schema(SCHEMA).from("task_collaborators");
  const contexts = () => supabase.schema(SCHEMA).from("task_contexts");
  const comments = () => supabase.schema(SCHEMA).from("task_comments");
  const taskRuns = () => supabase.schema(SCHEMA).from("task_runs");
  const taskActivity = () => supabase.schema(SCHEMA).from("task_activity");
  // ai.agent_session_run was renamed to ai.agent_run — use the current name.
  const agentSessionRuns = () => supabase.schema("ai").from("agent_run");

  async function isStaleAgentCheckoutRun(runId: string): Promise<boolean> {
    const { data, error } = await agentSessionRuns()
      .select("status, finished_at")
      .eq("id", runId)
      .maybeSingle();
    if (error || !data) {
      return false;
    }
    const status = String((data as { status: string }).status);
    if (status === "running" || status === "interrupted") {
      return false;
    }
    const finishedAt = (data as { finished_at: string | null }).finished_at;
    if (finishedAt) {
      return true;
    }
    return (
      status === "completed" || status === "failed" || status === "cancelled"
    );
  }

  async function ensureSettingsRow(): Promise<TaskSettings> {
    const { data, error } = await settingsTable()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load task settings: ${error.message}`);
    }
    if (!data) {
      const defs = BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => ({ ...d }));
      const { error: insertError } = await settingsTable().insert({
        tenant_id: tenantId,
        scope_id: scopeId,
        identifier_prefix: "ENG",
        stale_after_days: 7,
        task_status_definitions: defs,
      });
      if (insertError) {
        throw new Error(`Failed to seed task settings: ${insertError.message}`);
      }
      return {
        identifier_prefix: "ENG",
        stale_after_days: 7,
        ...definitionsToSettingsSlice(defs),
      };
    }
    const definitions = normalizeTaskStatusDefinitionsFromStorage(
      data.task_status_definitions
    );
    return {
      identifier_prefix: String(data.identifier_prefix ?? "ENG"),
      stale_after_days: Number(data.stale_after_days ?? 7),
      ...definitionsToSettingsSlice(definitions),
    };
  }

  function assertStatusAllowed(
    settings: TaskSettings,
    status: string | undefined
  ): void {
    if (!status) {
      return;
    }
    const allowed = new Set(settings.task_status_definitions.map((d) => d.id));
    if (!allowed.has(status)) {
      throw new Error("task_status_invalid");
    }
  }

  async function loadCollaboratorIds(taskId: string): Promise<string[]> {
    const { data, error } = await collaborators()
      .select("user_id")
      .eq("task_id", taskId);
    if (error) {
      throw new Error(`Failed to load collaborators: ${error.message}`);
    }
    return (data ?? []).map((r) => String((r as { user_id: string }).user_id));
  }

  async function replaceCollaborators(
    taskId: string,
    userIds: string[]
  ): Promise<void> {
    const { error: delError } = await collaborators()
      .delete()
      .eq("task_id", taskId);
    if (delError) {
      throw new Error(`Failed to clear collaborators: ${delError.message}`);
    }
    if (userIds.length === 0) {
      return;
    }
    const { error: insError } = await collaborators().insert(
      userIds.map((user_id) => ({ task_id: taskId, user_id }))
    );
    if (insError) {
      throw new Error(`Failed to set collaborators: ${insError.message}`);
    }
  }

  async function insertTaskContexts(
    taskId: string,
    rows: TaskContextInput[]
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    const payload = rows.map((row) => ({
      id: uuidv7(),
      tenant_id: tenantId,
      scope_id: scopeId,
      task_id: taskId,
      context_type: row.context_type,
      context_id: row.context_id,
      metadata: row.metadata ?? {},
    }));
    const { error } = await contexts().insert(payload);
    if (error) {
      throw new Error(`Failed to link task contexts: ${error.message}`);
    }
  }

  async function appendActivity(input: {
    task_id: string;
    event_type: TaskActivityEventType | string;
    payload?: Record<string, unknown>;
    actor_user_id?: string | null;
    actor_agent_type_key?: string | null;
  }): Promise<TaskActivity> {
    const id = uuidv7();
    const now = new Date().toISOString();
    const row = {
      id,
      tenant_id: tenantId,
      scope_id: scopeId,
      task_id: input.task_id,
      event_type: input.event_type,
      payload: input.payload ?? {},
      actor_user_id: input.actor_user_id ?? null,
      actor_agent_type_key: input.actor_agent_type_key ?? null,
      created_at: now,
    };
    const { data, error } = await taskActivity().insert(row).select().single();
    if (error) {
      throw new Error(`Failed to append task activity: ${error.message}`);
    }
    const activity = rowToTaskActivity(
      (data ?? row) as Record<string, unknown>
    );
    // Best-effort fan-out to the module event bus (team-chat activity feed
    // and other subscribers); never fails the write.
    void Promise.resolve(
      options?.onActivity?.(activity, { scopeId, tenantId })
    ).catch(() => undefined);
    return activity;
  }

  async function goalDepth(parentId: string | null): Promise<number> {
    if (!parentId) {
      return 0;
    }
    const { data, error } = await goals()
      .select("parent_id")
      .eq("id", parentId)
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .maybeSingle();
    if (error || !data) {
      return 0;
    }
    const parentParent = (data as { parent_id: string | null }).parent_id;
    return 1 + (parentParent ? 1 : 0);
  }

  return {
    async getSettings(): Promise<TaskSettings> {
      return ensureSettingsRow();
    },

    async updateSettings(
      input: TaskSettingsUpdateInput
    ): Promise<TaskSettings> {
      const current = await ensureSettingsRow();
      const definitions = input.task_status_definitions
        ? mergeTaskStatusDefinitionsFromPayload(input.task_status_definitions)
        : current.task_status_definitions;
      const row = {
        identifier_prefix:
          input.identifier_prefix?.trim() || current.identifier_prefix,
        stale_after_days: input.stale_after_days ?? current.stale_after_days,
        task_status_definitions: definitions,
        updated_at: new Date().toISOString(),
      };
      const { error } = await settingsTable().upsert({
        tenant_id: tenantId,
        scope_id: scopeId,
        ...row,
      });
      if (error) {
        throw new Error(`Failed to update task settings: ${error.message}`);
      }
      return {
        identifier_prefix: row.identifier_prefix,
        stale_after_days: row.stale_after_days,
        ...definitionsToSettingsSlice(definitions),
      };
    },

    async listTasksPaginated(
      params: TasksQueryParams,
      principalUserId?: string
    ): Promise<TasksPaginatedResponse> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 200);
      const sortBy =
        params.sortBy === "created_at" ||
        params.sortBy === "title" ||
        params.sortBy === "status" ||
        params.sortBy === "identifier"
          ? params.sortBy
          : "updated_at";
      const sortOrder = params.sortOrder === "asc";

      let taskIdsFilter: string[] | null = null;

      if (params.context_type?.trim()) {
        let ctxQuery = contexts()
          .select("task_id, metadata")
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .eq("context_type", params.context_type.trim());
        if (params.context_id?.trim()) {
          ctxQuery = ctxQuery.eq("context_id", params.context_id.trim());
        }
        const { data: ctxRows, error: ctxErr } = await ctxQuery;
        if (ctxErr) {
          throw new Error(
            `Failed to filter tasks by context: ${ctxErr.message}`
          );
        }
        let ids = (ctxRows ?? []).map((r) =>
          String((r as { task_id: string }).task_id)
        );
        if (params.context_metadata_phase_id !== undefined) {
          const phaseId = params.context_metadata_phase_id;
          ids = (ctxRows ?? [])
            .filter((r) => {
              const meta = ((r as { metadata?: Record<string, unknown> })
                .metadata ?? {}) as Record<string, unknown>;
              const rowPhaseId = meta.phase_id;
              if (phaseId === null || phaseId === "") {
                return rowPhaseId == null || rowPhaseId === "";
              }
              return String(rowPhaseId) === String(phaseId);
            })
            .map((r) => String((r as { task_id: string }).task_id));
        }
        if (ids.length === 0) {
          return { data: [], total: 0, page, pageSize };
        }
        taskIdsFilter = ids;
      }

      const filterUserId =
        params.scope === "mine"
          ? principalUserId
          : (params.assigned_to ?? undefined);
      if (filterUserId) {
        const { data: collabRows } = await collaborators()
          .select("task_id")
          .eq("user_id", filterUserId);
        const collabIds = new Set(
          (collabRows ?? []).map((r) =>
            String((r as { task_id: string }).task_id)
          )
        );
        const { data: primaryRows } = await tasks()
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .eq("primary_assignee_user_id", filterUserId);
        for (const r of primaryRows ?? []) {
          collabIds.add(String((r as { id: string }).id));
        }
        if (params.scope === "mine" && collabIds.size === 0) {
          return { data: [], total: 0, page, pageSize };
        }
        const mineIds = [...collabIds];
        taskIdsFilter = taskIdsFilter
          ? taskIdsFilter.filter((id) => mineIds.includes(id))
          : mineIds;
        if (taskIdsFilter.length === 0) {
          return { data: [], total: 0, page, pageSize };
        }
      }

      let query = tasks()
        .select("*", { count: "exact", head: false })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (taskIdsFilter) {
        query = query.in("id", taskIdsFilter);
      }
      if (params.status) {
        query = query.eq("status", params.status);
      }
      if (params.goal_id) {
        query = query.eq("goal_id", params.goal_id);
      }
      if (params.parent_id) {
        query = query.eq("parent_id", params.parent_id);
      }
      if (params.project_id) {
        query = query.eq("project_id", params.project_id);
      }
      if (params.search?.trim()) {
        const q = `%${params.search.trim()}%`;
        query = query.or(`title.ilike.${q},identifier.ilike.${q}`);
      }

      const {
        data: rows,
        error,
        count,
      } = await query
        .order(sortBy, { ascending: sortOrder })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) {
        throw new Error(`Failed to list tasks: ${error.message}`);
      }

      const data = await Promise.all(
        (rows ?? []).map(async (row) => {
          const task = rowToTask(row as Record<string, unknown>);
          task.collaborator_user_ids = await loadCollaboratorIds(task.id);
          return task;
        })
      );

      return {
        data,
        total: count ?? data.length,
        page,
        pageSize,
      };
    },

    async getTask(id: string): Promise<TaskDetail | null> {
      const { data, error } = await tasks()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get task: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      const task = rowToTask(data as Record<string, unknown>);
      task.collaborator_user_ids = await loadCollaboratorIds(task.id);

      const { data: ctxRows } = await contexts()
        .select("*")
        .eq("task_id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      const { data: commentRows } = await comments()
        .select("*")
        .eq("task_id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("created_at", { ascending: true });

      return {
        ...task,
        contexts: (ctxRows ?? []).map(
          (row): TaskContext => ({
            id: String((row as { id: string }).id),
            tenant_id: String((row as { tenant_id: string }).tenant_id),
            scope_id: String((row as { scope_id: string }).scope_id),
            task_id: String((row as { task_id: string }).task_id),
            context_type: String(
              (row as { context_type: string }).context_type
            ),
            context_id: String((row as { context_id: string }).context_id),
            metadata: ((row as { metadata: Record<string, unknown> })
              .metadata ?? {}) as Record<string, unknown>,
          })
        ),
        comments: (commentRows ?? []).map(
          (row): TaskComment => ({
            id: String((row as { id: string }).id),
            tenant_id: String((row as { tenant_id: string }).tenant_id),
            scope_id: String((row as { scope_id: string }).scope_id),
            task_id: String((row as { task_id: string }).task_id),
            content: String((row as { content: string }).content),
            created_by_user_id:
              (row as { created_by_user_id: string | null })
                .created_by_user_id ?? null,
            created_by_agent_type_key:
              (row as { created_by_agent_type_key: string | null })
                .created_by_agent_type_key ?? null,
            created_at: String((row as { created_at: string }).created_at),
          })
        ),
      };
    },

    async createTask(
      input: TaskCreateInput,
      opts?: { createdByUserId?: string | null; actorKind?: "user" | "agent" }
    ): Promise<Task> {
      const settings = await ensureSettingsRow();
      const status = input.status ?? "todo";
      assertStatusAllowed(settings, status);

      let parentGoalId: string | null = null;
      if (input.parent_id) {
        const { data: parent } = await tasks()
          .select("goal_id")
          .eq("id", input.parent_id)
          .maybeSingle();
        parentGoalId =
          (parent as { goal_id: string | null } | null)?.goal_id ?? null;
      }

      const goal_id = resolveTaskGoalId({
        explicit_goal_id: input.goal_id ?? null,
        parent_goal_id: parentGoalId,
      });

      if (input.created_by_agent_type_key) {
        assertAgentTaskGoal({ actorKind: "agent_create", goal_id });
      }

      const assignee = normalizeTaskAssignees(input);
      const identifier = await allocateTaskIdentifier(
        supabase,
        tenantId,
        scopeId,
        settings.identifier_prefix
      );

      const id = uuidv7();
      const now = new Date().toISOString();
      const row = {
        id,
        tenant_id: tenantId,
        scope_id: scopeId,
        identifier,
        title: input.title.trim(),
        description: input.description ?? null,
        status,
        priority: input.priority ?? "medium",
        goal_id,
        parent_id: input.parent_id ?? null,
        primary_assignee_kind: assignee.primary_assignee_kind,
        primary_assignee_user_id: assignee.primary_assignee_user_id,
        primary_assignee_agent_type_key:
          assignee.primary_assignee_agent_type_key,
        created_by_user_id: opts?.createdByUserId ?? null,
        created_by_agent_type_key: input.created_by_agent_type_key ?? null,
        due_date: input.due_date ?? null,
        ...(input.project_id == null ? {} : { project_id: input.project_id }),
        request_depth: 0,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await tasks().insert(row).select().single();
      if (error) {
        throw new Error(`Failed to create task: ${error.message}`);
      }

      if (assignee.collaborator_user_ids.length > 0) {
        await replaceCollaborators(id, assignee.collaborator_user_ids);
      }

      if (input.contexts?.length) {
        await insertTaskContexts(id, input.contexts);
      }

      const created = rowToTask((data ?? row) as Record<string, unknown>);
      created.collaborator_user_ids = assignee.collaborator_user_ids;
      record("tasks.created", {
        id: created.id,
        identifier: created.identifier,
        title: created.title,
      });
      return created;
    },

    async updateTask(
      id: string,
      input: TaskUpdateInput,
      opts?: {
        actorKind?: "user" | "agent";
        hasActiveCheckout?: boolean;
        actorUserId?: string | null;
        actorAgentTypeKey?: string | null;
      }
    ): Promise<Task | null> {
      const existing = await this.getTask(id);
      if (!existing) {
        return null;
      }
      const settings = await ensureSettingsRow();
      const nextStatus = input.status ?? existing.status;
      assertStatusAllowed(settings, nextStatus);

      const actorKind = opts?.actorKind ?? "user";
      const hasActiveCheckout =
        opts?.hasActiveCheckout ?? !!existing.checkout_run_id;
      if (
        !canTransitionTaskStatus({
          actorKind,
          from: existing.status as TaskStatus,
          to: nextStatus as TaskStatus,
          hasActiveCheckout,
        })
      ) {
        if (
          actorKind === "agent" &&
          nextStatus === "in_progress" &&
          !hasActiveCheckout
        ) {
          throw new Error("task_checkout_required");
        }
        throw new Error("task_status_transition_denied");
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.title !== undefined) {
        updates.title = input.title.trim();
      }
      if (input.description !== undefined) {
        updates.description = input.description;
      }
      if (input.status !== undefined) {
        updates.status = input.status;
        if (input.status === "in_progress" && !existing.started_at) {
          updates.started_at = new Date().toISOString();
        }
        if (input.status === "done") {
          updates.completed_at = new Date().toISOString();
        } else if (existing.status === "done") {
          updates.completed_at = null;
        }
        if (input.status === "cancelled") {
          updates.cancelled_at = new Date().toISOString();
        } else if (existing.status === "cancelled") {
          updates.cancelled_at = null;
        }
      }
      if (input.priority !== undefined) {
        updates.priority = input.priority;
      }
      if (input.goal_id !== undefined) {
        updates.goal_id = input.goal_id;
      }
      if (input.due_date !== undefined) {
        updates.due_date = input.due_date;
      }
      if (input.project_id !== undefined) {
        updates.project_id = input.project_id;
      }

      if (
        input.primary_assignee_kind !== undefined ||
        input.primary_assignee_user_id !== undefined ||
        input.primary_assignee_agent_type_key !== undefined ||
        input.collaborator_user_ids !== undefined
      ) {
        const assignee = normalizeTaskAssignees({
          primary_assignee_kind:
            input.primary_assignee_kind ?? existing.primary_assignee_kind,
          primary_assignee_user_id:
            input.primary_assignee_user_id ?? existing.primary_assignee_user_id,
          primary_assignee_agent_type_key:
            input.primary_assignee_agent_type_key ??
            existing.primary_assignee_agent_type_key,
          collaborator_user_ids:
            input.collaborator_user_ids ?? existing.collaborator_user_ids,
        });
        updates.primary_assignee_kind = assignee.primary_assignee_kind;
        updates.primary_assignee_user_id = assignee.primary_assignee_user_id;
        updates.primary_assignee_agent_type_key =
          assignee.primary_assignee_agent_type_key;
        if (input.collaborator_user_ids !== undefined) {
          await replaceCollaborators(id, assignee.collaborator_user_ids);
        }
      }

      const { data, error } = await tasks()
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to update task: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      const updated = rowToTask(data as Record<string, unknown>);
      updated.collaborator_user_ids = await loadCollaboratorIds(id);
      if (input.status && input.status !== existing.status) {
        record("tasks.status_changed", {
          id,
          from: existing.status,
          to: input.status,
        });
        await appendActivity({
          task_id: id,
          event_type: "tasks.status_changed",
          payload: { from: existing.status, to: input.status },
          actor_user_id:
            actorKind === "user" ? (opts?.actorUserId ?? null) : null,
          actor_agent_type_key:
            actorKind === "agent" ? (opts?.actorAgentTypeKey ?? null) : null,
        });
      }

      const assigneeChanged =
        input.primary_assignee_kind !== undefined ||
        input.primary_assignee_user_id !== undefined ||
        input.primary_assignee_agent_type_key !== undefined;
      if (assigneeChanged) {
        await appendActivity({
          task_id: id,
          event_type: "tasks.assignee_changed",
          payload: {
            from: {
              kind: existing.primary_assignee_kind,
              user_id: existing.primary_assignee_user_id,
              agent_type_key: existing.primary_assignee_agent_type_key,
            },
            to: {
              kind: updated.primary_assignee_kind,
              user_id: updated.primary_assignee_user_id,
              agent_type_key: updated.primary_assignee_agent_type_key,
            },
          },
          actor_user_id:
            actorKind === "user" ? (opts?.actorUserId ?? null) : null,
          actor_agent_type_key:
            actorKind === "agent" ? (opts?.actorAgentTypeKey ?? null) : null,
        });
      }
      return updated;
    },

    async deleteTask(id: string): Promise<boolean> {
      const existing = await this.getTask(id);
      if (!existing) {
        return false;
      }

      // Preserve time entries that reference this task before the cascade NULLs
      // their task_id, which would violate module_time_tracking_level_check on
      // entries with no other anchor.
      const timeEntries = () =>
        supabase.schema("module_time_tracking").from("time_entries");
      await timeEntries()
        .update({ manual_task_title: existing.title })
        .eq("task_id", id)
        .is("project_id", null)
        .is("phase_id", null)
        .is("manual_project_title", null)
        .or("manual_task_title.is.null,manual_task_title.eq.");

      const { error } = await tasks()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to delete task: ${error.message}`);
      }
      record("tasks.deleted", { id });
      return true;
    },

    async addComment(
      taskId: string,
      content: string,
      opts?: { createdByUserId?: string | null; createdByAgentTypeKey?: string }
    ): Promise<TaskComment> {
      const id = uuidv7();
      const now = new Date().toISOString();
      const row = {
        id,
        tenant_id: tenantId,
        scope_id: scopeId,
        task_id: taskId,
        content: content.trim(),
        created_by_user_id: opts?.createdByUserId ?? null,
        created_by_agent_type_key: opts?.createdByAgentTypeKey ?? null,
        created_at: now,
      };
      const { data, error } = await comments().insert(row).select().single();
      if (error) {
        throw new Error(`Failed to add comment: ${error.message}`);
      }
      await appendActivity({
        task_id: taskId,
        event_type: "tasks.comment_added",
        payload: { comment_id: id, content: row.content },
        actor_user_id: opts?.createdByUserId ?? null,
        actor_agent_type_key: opts?.createdByAgentTypeKey ?? null,
      });
      return {
        id: String((data as { id: string }).id),
        tenant_id: tenantId,
        scope_id: scopeId,
        task_id: taskId,
        content: row.content,
        created_by_user_id: row.created_by_user_id,
        created_by_agent_type_key: row.created_by_agent_type_key,
        created_at: now,
      };
    },

    async listGoalsPaginated(
      params: GoalsQueryParams
    ): Promise<GoalsPaginatedResponse> {
      const page = Math.max(params.page ?? 1, 1);
      const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 200);
      const sortBy =
        params.sortBy === "created_at" ||
        params.sortBy === "title" ||
        params.sortBy === "status"
          ? params.sortBy
          : "updated_at";
      const sortOrder = params.sortOrder === "asc";

      let query = goals()
        .select("*", { count: "exact", head: false })
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (params.status) {
        query = query.eq("status", params.status);
      }
      if (params.parent_id) {
        query = query.eq("parent_id", params.parent_id);
      }
      if (params.search?.trim()) {
        query = query.ilike("title", `%${params.search.trim()}%`);
      }

      const {
        data: rows,
        error,
        count,
      } = await query
        .order(sortBy, { ascending: sortOrder })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) {
        throw new Error(`Failed to list goals: ${error.message}`);
      }

      const data: Goal[] = [];
      for (const row of rows ?? []) {
        const goal = rowToGoal(row as Record<string, unknown>);
        const { count: taskCount } = await tasks()
          .select("id", { count: "exact", head: true })
          .eq("goal_id", goal.id);
        goal.linked_task_count = taskCount ?? 0;
        data.push(goal);
      }

      return {
        data,
        total: count ?? data.length,
        page,
        pageSize,
      };
    },

    async getGoal(id: string): Promise<Goal | null> {
      const { data, error } = await goals()
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get goal: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      const goal = rowToGoal(data as Record<string, unknown>);
      const { count: taskCount } = await tasks()
        .select("id", { count: "exact", head: true })
        .eq("goal_id", goal.id);
      goal.linked_task_count = taskCount ?? 0;
      return goal;
    },

    async createGoal(input: GoalCreateInput): Promise<Goal> {
      const depth = await goalDepth(input.parent_id ?? null);
      assertGoalDepth(depth);

      const id = uuidv7();
      const now = new Date().toISOString();
      const row = {
        id,
        tenant_id: tenantId,
        scope_id: scopeId,
        title: input.title.trim(),
        description: input.description ?? null,
        status: input.status ?? "planned",
        parent_id: input.parent_id ?? null,
        ...(input.project_id == null ? {} : { project_id: input.project_id }),
        owner_user_id: input.owner_user_id ?? null,
        owner_agent_id: input.owner_agent_id ?? null,
        level: input.level ?? "task",
        target_date: input.target_date ?? null,
        created_at: now,
        updated_at: now,
      };
      const { data, error } = await goals().insert(row).select().single();
      if (error) {
        throw new Error(`Failed to create goal: ${error.message}`);
      }
      const created = rowToGoal((data ?? row) as Record<string, unknown>);
      record("goals.created", { id: created.id, title: created.title });
      return created;
    },

    async updateGoal(id: string, input: GoalUpdateInput): Promise<Goal | null> {
      const { data: existing, error: loadError } = await goals()
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (loadError) {
        throw new Error(`Failed to load goal: ${loadError.message}`);
      }
      if (!existing) {
        return null;
      }
      const current = rowToGoal(existing as Record<string, unknown>);
      const nextStatus = input.status ?? current.status;
      if (!canTransitionGoalStatus(current.status, nextStatus)) {
        throw new Error("goal_status_transition_denied");
      }
      if (
        input.parent_id !== undefined &&
        input.parent_id !== current.parent_id
      ) {
        const depth = await goalDepth(input.parent_id);
        assertGoalDepth(depth);
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.title !== undefined) {
        updates.title = input.title.trim();
      }
      if (input.description !== undefined) {
        updates.description = input.description;
      }
      if (input.status !== undefined) {
        updates.status = input.status;
      }
      if (input.parent_id !== undefined) {
        updates.parent_id = input.parent_id;
      }
      if (input.owner_user_id !== undefined) {
        updates.owner_user_id = input.owner_user_id;
      }
      if (input.owner_agent_id !== undefined) {
        updates.owner_agent_id = input.owner_agent_id;
      }
      if (input.level !== undefined) {
        updates.level = input.level;
      }
      if (input.target_date !== undefined) {
        updates.target_date = input.target_date;
      }
      if (input.project_id !== undefined) {
        updates.project_id = input.project_id;
      }

      const { data, error } = await goals()
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select()
        .single();
      if (error) {
        throw new Error(`Failed to update goal: ${error.message}`);
      }
      return data ? rowToGoal(data as Record<string, unknown>) : null;
    },

    async deleteGoal(id: string): Promise<boolean> {
      const { error } = await goals()
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to delete goal: ${error.message}`);
      }
      record("goals.deleted", { id });
      return true;
    },

    async checkoutTask(
      taskId: string,
      input: TaskCheckoutInput,
      opts?: { actorUserId?: string | null }
    ): Promise<Task> {
      const expectedStatuses = input.expected_statuses ?? [
        ...TASK_AGENT_CHECKOUT_ENTRY_STATUSES,
      ];
      const now = new Date().toISOString();
      const runId = input.agent_session_run_id;
      const agentTypeKey = input.agent_type_key.trim();

      const { data: existingRow } = await tasks()
        .select("*")
        .eq("id", taskId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (!existingRow) {
        throw new Error("task_not_found");
      }
      const existing = rowToTask(existingRow as Record<string, unknown>);

      let replacingStaleCheckout = false;
      if (existing.checkout_run_id && existing.checkout_run_id !== runId) {
        replacingStaleCheckout = await isStaleAgentCheckoutRun(
          existing.checkout_run_id
        );
        if (!replacingStaleCheckout) {
          throw new TaskCheckoutConflictError({
            current_status: existing.status,
            current_assignee_kind: existing.primary_assignee_kind,
            checkout_run_id: existing.checkout_run_id,
          });
        }
      }

      if (
        existing.checkout_run_id === runId &&
        existing.status === "in_progress"
      ) {
        return existing;
      }

      let checkoutQuery = tasks()
        .update({
          status: "in_progress",
          primary_assignee_kind: "agent",
          primary_assignee_agent_type_key: agentTypeKey,
          primary_assignee_user_id: null,
          checkout_run_id: runId,
          started_at: existing.started_at ?? now,
          updated_at: now,
        })
        .eq("id", taskId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);

      if (replacingStaleCheckout && existing.checkout_run_id) {
        checkoutQuery = checkoutQuery.eq(
          "checkout_run_id",
          existing.checkout_run_id
        );
      } else {
        checkoutQuery = checkoutQuery
          .in("status", expectedStatuses)
          .or(`checkout_run_id.is.null,checkout_run_id.eq.${runId}`);
      }

      const { data, error } = await checkoutQuery.select().maybeSingle();

      if (error) {
        throw new Error(`Failed to checkout task: ${error.message}`);
      }

      if (!data) {
        const { data: currentRow } = await tasks()
          .select("*")
          .eq("id", taskId)
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .maybeSingle();
        const current = currentRow
          ? rowToTask(currentRow as Record<string, unknown>)
          : existing;
        throw new TaskCheckoutConflictError({
          current_status: current.status,
          current_assignee_kind: current.primary_assignee_kind,
          checkout_run_id: current.checkout_run_id,
        });
      }

      const taskRunId = uuidv7();
      const { error: runError } = await taskRuns().insert({
        id: taskRunId,
        tenant_id: tenantId,
        scope_id: scopeId,
        task_id: taskId,
        agent_session_run_id: runId,
        role: "checkout",
        created_at: now,
      });
      if (runError) {
        throw new Error(`Failed to record task run: ${runError.message}`);
      }

      await appendActivity({
        task_id: taskId,
        event_type: "tasks.checked_out",
        payload: {
          run_id: runId,
          agent_type_key: agentTypeKey,
        },
        actor_user_id: opts?.actorUserId ?? null,
        actor_agent_type_key: agentTypeKey,
      });

      record("tasks.checked_out", {
        id: taskId,
        run_id: runId,
        agent_type_key: agentTypeKey,
      });

      const checkedOut = rowToTask(data as Record<string, unknown>);
      checkedOut.collaborator_user_ids = await loadCollaboratorIds(taskId);
      return checkedOut;
    },

    async releaseTask(
      taskId: string,
      input: TaskReleaseInput = {},
      opts?: {
        actorKind?: "user" | "agent";
        actorUserId?: string | null;
        actorAgentTypeKey?: string | null;
      }
    ): Promise<Task | null> {
      const existing = await this.getTask(taskId);
      if (!existing) {
        return null;
      }
      if (!existing.checkout_run_id) {
        return existing;
      }

      const runId = input.agent_session_run_id;
      if (runId && existing.checkout_run_id !== runId) {
        throw new Error("task_release_run_mismatch");
      }
      if (opts?.actorKind === "agent" && !runId) {
        throw new Error("task_release_run_required");
      }

      const now = new Date().toISOString();
      const { data, error } = await tasks()
        .update({
          checkout_run_id: null,
          status: "todo",
          updated_at: now,
        })
        .eq("id", taskId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to release task: ${error.message}`);
      }
      if (!data) {
        return null;
      }

      await appendActivity({
        task_id: taskId,
        event_type: "tasks.released",
        payload: {
          run_id: existing.checkout_run_id,
        },
        actor_user_id: opts?.actorUserId ?? null,
        actor_agent_type_key: opts?.actorAgentTypeKey ?? null,
      });

      record("tasks.released", {
        id: taskId,
        run_id: existing.checkout_run_id,
      });

      const released = rowToTask(data as Record<string, unknown>);
      released.collaborator_user_ids = await loadCollaboratorIds(taskId);
      return released;
    },

    async listTaskRuns(taskId: string): Promise<TaskRun[]> {
      const { data, error } = await taskRuns()
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("created_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to list task runs: ${error.message}`);
      }

      const runs = (data ?? []).map((row) =>
        rowToTaskRun(row as Record<string, unknown>)
      );
      if (runs.length === 0) {
        return runs;
      }

      const sessionRunIds = [
        ...new Set(runs.map((run) => run.agent_session_run_id)),
      ];
      const { data: sessionRuns } = await agentSessionRuns()
        .select(
          "id, agent_type_key, started_at, finished_at, session_id, created_by_user_id"
        )
        .in("id", sessionRunIds);

      const sessionRunById = new Map(
        (sessionRuns ?? []).map((row) => [
          String((row as { id: string }).id),
          row as {
            agent_type_key: string;
            created_by_user_id: string | null;
            finished_at: string | null;
            session_id: string;
            started_at: string;
          },
        ])
      );

      return runs.map((run) => {
        const sessionRun = sessionRunById.get(run.agent_session_run_id);
        if (!sessionRun) {
          return run;
        }
        return {
          ...run,
          agent_session_id: sessionRun.session_id,
          agent_type_key: sessionRun.agent_type_key,
          created_by_user_id: sessionRun.created_by_user_id,
          run_started_at: sessionRun.started_at,
          run_finished_at: sessionRun.finished_at,
        };
      });
    },

    async listTaskActivity(taskId: string): Promise<TaskActivity[]> {
      const { data, error } = await taskActivity()
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("created_at", { ascending: false });
      if (error) {
        throw new Error(`Failed to list task activity: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToTaskActivity(row as Record<string, unknown>)
      );
    },

    async listRecentActivity(opts: {
      limit: number;
      taskIds?: string[];
    }): Promise<TaskActivity[]> {
      let query = taskActivity()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("created_at", { ascending: false })
        .limit(opts.limit);

      if (opts.taskIds?.length) {
        query = query.in("task_id", opts.taskIds);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(
          `Failed to list recent task activity: ${error.message}`
        );
      }
      return (data ?? []).map((row) =>
        rowToTaskActivity(row as Record<string, unknown>)
      );
    },

    appendActivity,
  };
}

export type TasksRepo = ReturnType<typeof createTasksRepoSupabase>;
