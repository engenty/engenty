import { resolveDefaultSpaceId } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import {
  canTransitionTaskStatus,
  normalizeTaskAssignees,
  TASK_AGENT_CHECKOUT_ENTRY_STATUSES,
  type TaskStatus,
} from "../domain/task-lifecycle.js";
import { resolveCreateSpaceId } from "../lib/resolve-create-space-id.js";
import { TaskCheckoutConflictError } from "../lib/task-checkout-errors.js";
import type {
  Task,
  TaskActivity,
  TaskActivityEventType,
  TaskCheckoutInput,
  TaskComment,
  TaskCommentKind,
  TaskCommentMetadata,
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
import { detachTimesheetRowsForTaskDelete } from "./detach-timesheet-rows-for-task-delete.js";
import { allocateTaskIdentifier } from "./task-identifier.js";
import { createTaskSettingsStore } from "./task-settings.js";

/** Cap for task run history lists — a long-lived task accumulates runs. */
export const TASK_RUNS_LIST_LIMIT = 30;

const SCHEMA = "module_tasks";
/**
 * Read-only, and only ever for `space_id` inheritance (resolveCreateSpaceId).
 * The projects module is an optional install, so the lookup has to tolerate the
 * table not being there — a failed read falls through to the next container.
 */
const PROJECTS_SCHEMA = "module_projects";

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
    parent_id: (row.parent_id as string | null) ?? null,
    project_id: (row.project_id as string | null) ?? null,
    space_id: row.space_id as string,
    primary_assignee_kind:
      row.primary_assignee_kind as Task["primary_assignee_kind"],
    primary_assignee_user_id:
      (row.primary_assignee_user_id as string | null) ?? null,
    primary_assignee_agent_type_key:
      (row.primary_assignee_agent_type_key as string | null) ?? null,
    blocked_by_task_ids: (row.blocked_by_task_ids as string[] | null) ?? [],
    created_by_user_id: (row.created_by_user_id as string | null) ?? null,
    created_by_agent_type_key:
      (row.created_by_agent_type_key as string | null) ?? null,
    due_date: (row.due_date as string | null) ?? null,
    // approval_grants / approval_grants_once live in core.approval_grants
    // (subject = task id) — the detail route hydrates them from there.
    pending_approval_operation_ids:
      (row.pending_approval_operation_ids as string[] | null) ?? [],
    // request_depth column remains in DB (compat) but is unused — always 0 historically.
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    checkout_run_id: (row.checkout_run_id as string | null) ?? null,
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
    finished_at: (row.finished_at as string | null) ?? null,
    outcome: (row.outcome as string | null) ?? null,
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

  /**
   * The space a new task belongs to: explicit, else inherited from the
   * container it is created inside, else the tenant's default space. Never null
   * — a work container outside every space is the one state the tier forbids.
   */
  function createSpaceId(params: {
    explicit?: string | null;
    inheritFrom?: [
      schema: string,
      table: string,
      id: string | null | undefined,
    ][];
  }) {
    return resolveCreateSpaceId({
      // `as never` on both: matching these structural client slices against
      // SupabaseClient's generics blows the instantiation-depth limit (TS2589).
      client: supabase as never,
      tenantId,
      resolveDefault: () => resolveDefaultSpaceId(supabase as never, tenantId),
      ...params,
    });
  }

  const settingsStore = createTaskSettingsStore(supabase, tenantId, scopeId);
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
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
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
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("task_id", taskId);
    if (delError) {
      throw new Error(`Failed to clear collaborators: ${delError.message}`);
    }
    if (userIds.length === 0) {
      return;
    }
    const { error: insError } = await collaborators().insert(
      userIds.map((user_id) => ({
        scope_id: scopeId,
        task_id: taskId,
        tenant_id: tenantId,
        user_id,
      }))
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

  async function replaceTaskContexts(
    taskId: string,
    rows: TaskContextInput[]
  ): Promise<void> {
    const { error: deleteError } = await contexts()
      .delete()
      .eq("task_id", taskId)
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId);
    if (deleteError) {
      throw new Error(
        `Failed to replace task contexts: ${deleteError.message}`
      );
    }
    await insertTaskContexts(taskId, rows);
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

  return {
    async getSettings(): Promise<TaskSettings> {
      return settingsStore.get();
    },

    async updateSettings(
      input: TaskSettingsUpdateInput
    ): Promise<TaskSettings> {
      return settingsStore.update(input);
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
        // user ids are global, so without the tenant/scope filters this
        // returns every task that user collaborates on in ANY tenant.
        const { data: collabRows } = await collaborators()
          .select("task_id")
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
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
      if (params.parent_id) {
        query = query.eq("parent_id", params.parent_id);
      }
      if (params.project_id) {
        query = query.eq("project_id", params.project_id);
      }
      if (params.space_id) {
        query = query.eq("space_id", params.space_id);
      } else if (params.space_ids) {
        if (params.space_ids.length === 0) {
          return { data: [], total: 0, page, pageSize };
        }
        query = query.in("space_id", [...params.space_ids]);
      }
      if (params.assignee_kind) {
        query = query.eq("primary_assignee_kind", params.assignee_kind);
      }
      if (params.primary_assignee_agent_type_key) {
        query = query.eq(
          "primary_assignee_agent_type_key",
          params.primary_assignee_agent_type_key
        );
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
          const [collaboratorIds, latestComment] = await Promise.all([
            loadCollaboratorIds(task.id),
            params.include_agent_desk_state
              ? comments()
                  .select("kind")
                  .eq("task_id", task.id)
                  .eq("tenant_id", tenantId)
                  .eq("scope_id", scopeId)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ]);
          task.collaborator_user_ids = collaboratorIds;
          if (params.include_agent_desk_state) {
            task.has_open_question =
              (latestComment.data as { kind?: string } | null)?.kind ===
              "question";
          }
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
            kind: ((row as { kind?: TaskCommentKind }).kind ??
              "note") as TaskCommentKind,
            metadata: ((row as { metadata?: TaskCommentMetadata }).metadata ??
              {}) as TaskCommentMetadata,
          })
        ),
      };
    },

    /** Append a task activity event (+ module-bus fan-out). Public seam for
     *  the dispatch service to log blocker/children coordination events. */
    async recordActivity(input: {
      task_id: string;
      event_type: TaskActivityEventType | string;
      payload?: Record<string, unknown>;
      actor_agent_type_key?: string | null;
      actor_user_id?: string | null;
    }): Promise<void> {
      await appendActivity(input);
    },

    /** Blocker ids stored on a task, or null if the task is not in scope. */
    async getBlockedByIds(id: string): Promise<string[] | null> {
      const { data, error } = await tasks()
        .select("blocked_by_task_ids")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to load task blockers: ${error.message}`);
      }
      if (!data) {
        return null;
      }
      return (
        (data as { blocked_by_task_ids: string[] | null })
          .blocked_by_task_ids ?? []
      );
    },

    /** Map id → status for the given task ids (in this tenant/scope). */
    async loadTaskStatuses(
      ids: string[]
    ): Promise<Map<string, string | undefined>> {
      const map = new Map<string, string | undefined>();
      if (ids.length === 0) {
        return map;
      }
      const { data, error } = await tasks()
        .select("id, status")
        .in("id", ids)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to load task statuses: ${error.message}`);
      }
      for (const row of (data ?? []) as { id: string; status: string }[]) {
        map.set(String(row.id), String(row.status));
      }
      return map;
    },

    /** Tasks that list `taskId` in their blocker set (its dependents). */
    async listDependents(taskId: string): Promise<Task[]> {
      const { data, error } = await tasks()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .contains("blocked_by_task_ids", [taskId]);
      if (error) {
        throw new Error(`Failed to list dependents: ${error.message}`);
      }
      return ((data ?? []) as Record<string, unknown>[]).map(rowToTask);
    },

    /** Direct child tasks of `parentId` (in this tenant/scope). */
    async listChildren(parentId: string): Promise<Task[]> {
      const { data, error } = await tasks()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("parent_id", parentId);
      if (error) {
        throw new Error(`Failed to list children: ${error.message}`);
      }
      return ((data ?? []) as Record<string, unknown>[]).map(rowToTask);
    },

    async createTask(
      input: TaskCreateInput,
      opts?: { createdByUserId?: string | null; actorKind?: "user" | "agent" }
    ): Promise<Task> {
      const settings = await settingsStore.get();
      const status = input.status ?? "todo";
      assertStatusAllowed(settings, status);

      // Inherit before falling back: a task inside a container belongs to that
      // container's space, and a chain spanning two spaces is precisely what
      // resolveWorkVisibility has to complain about later.
      //
      // Order follows the containment ladder inward-out — parent task, then
      // project — so the NEAREST container wins. The project is the one that
      // reaches another module's schema, and it is the one that made this list
      // wrong before: `createProjectLinkedTask` passes `project_id` and nothing
      // else, so every task added to a project in a non-default space used to
      // land in Company.
      const space_id = await createSpaceId({
        explicit: input.space_id,
        inheritFrom: [
          [SCHEMA, "tasks", input.parent_id],
          [PROJECTS_SCHEMA, "projects", input.project_id],
        ],
      });

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
        parent_id: input.parent_id ?? null,
        primary_assignee_kind: assignee.primary_assignee_kind,
        primary_assignee_user_id: assignee.primary_assignee_user_id,
        primary_assignee_agent_type_key:
          assignee.primary_assignee_agent_type_key,
        created_by_user_id: opts?.createdByUserId ?? null,
        created_by_agent_type_key: input.created_by_agent_type_key ?? null,
        due_date: input.due_date ?? null,
        blocked_by_task_ids: input.blocked_by_task_ids ?? [],
        ...(input.project_id == null ? {} : { project_id: input.project_id }),
        space_id,
        // request_depth: dead column kept for compat — DB default 0
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
      const settings = await settingsStore.get();
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
      if (input.due_date !== undefined) {
        updates.due_date = input.due_date;
      }
      if (input.project_id !== undefined) {
        updates.project_id = input.project_id;
      }
      if (input.blocked_by_task_ids !== undefined) {
        updates.blocked_by_task_ids = input.blocked_by_task_ids;
      }
      if (
        input.primary_assignee_kind !== undefined ||
        input.primary_assignee_user_id !== undefined ||
        input.primary_assignee_agent_type_key !== undefined ||
        input.collaborator_user_ids !== undefined
      ) {
        const assignee = normalizeTaskAssignees({
          // Merged view of the patch over the row, so an explicit null actually
          // clears the field it patches instead of reading as "unchanged".
          primary_assignee_kind:
            input.primary_assignee_kind ?? existing.primary_assignee_kind,
          primary_assignee_user_id:
            input.primary_assignee_user_id === undefined
              ? existing.primary_assignee_user_id
              : input.primary_assignee_user_id,
          primary_assignee_agent_type_key:
            input.primary_assignee_agent_type_key === undefined
              ? existing.primary_assignee_agent_type_key
              : input.primary_assignee_agent_type_key,
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
      if (input.contexts !== undefined) {
        await replaceTaskContexts(id, input.contexts);
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

    /** Drop one answered operation from the task's pending-approval list.
     * Only approvals clear an entry: a denial keeps it so the human can still
     * change their mind from the task instead of losing the affordance. */
    async clearTaskPendingApproval(
      id: string,
      operationId: string
    ): Promise<void> {
      const existing = await this.getTask(id);
      const pending = existing?.pending_approval_operation_ids ?? [];
      if (!pending.includes(operationId)) {
        return;
      }
      const { error } = await tasks()
        .update({
          pending_approval_operation_ids: pending.filter(
            (op) => op !== operationId
          ),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (error) {
        throw new Error(`Failed to clear pending approval: ${error.message}`);
      }
    },

    async deleteTask(id: string): Promise<boolean> {
      const existing = await this.getTask(id);
      if (!existing) {
        return false;
      }

      await detachTimesheetRowsForTaskDelete(supabase, {
        tenantId,
        scopeId,
        taskId: id,
        taskTitle: existing.title,
      });

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
      opts?: {
        createdByUserId?: string | null;
        createdByAgentTypeKey?: string;
        kind?: TaskCommentKind;
        metadata?: TaskCommentMetadata;
      }
    ): Promise<TaskComment> {
      const id = uuidv7();
      const now = new Date().toISOString();
      // Default by author, not by content: a comment nobody classified is a
      // person's note, and an agent that did not say otherwise is reporting
      // progress. Nothing here reads the text.
      const kind: TaskCommentKind =
        opts?.kind ?? (opts?.createdByAgentTypeKey ? "progress" : "note");
      const row = {
        id,
        tenant_id: tenantId,
        scope_id: scopeId,
        task_id: taskId,
        content: content.trim(),
        created_by_user_id: opts?.createdByUserId ?? null,
        created_by_agent_type_key: opts?.createdByAgentTypeKey ?? null,
        created_at: now,
        kind,
        metadata: opts?.metadata ?? {},
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
        kind,
        metadata: row.metadata,
      };
    },

    /**
     * Newest result comment on a task — used when waking dependents so the
     * blocker's outcome reaches the dependent brief. Selected by `kind`; it
     * used to match `content like '🤖%'`, which silently missed any result
     * whose copy changed.
     */
    async getLatestAgentResultComment(taskId: string): Promise<string | null> {
      const { data, error } = await comments()
        .select("content")
        .eq("task_id", taskId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("kind", "result")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw new Error(
          `Failed to load latest agent result comment: ${error.message}`
        );
      }
      const content = (data as { content?: string } | null)?.content;
      return typeof content === "string" && content.trim()
        ? content.trim()
        : null;
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
          // A new run supersedes the previous run's unanswered ask: it will
          // either pass the gate now or record a fresh request on release.
          pending_approval_operation_ids: [],
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

      // ONE run row per run. A resumed run re-enters checkout under the SAME
      // run id — it parked for a person, was released to `in_review`, and the
      // same background task resumed once the answer landed. The early return
      // above only covers a task still `in_progress`, so this path runs a
      // second time, and a blind insert would mint a second row for one run:
      // run history would then show the run twice, split at the point where it
      // stopped to ask.
      const { data: priorRun } = await taskRuns()
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("task_id", taskId)
        .eq("agent_session_run_id", runId)
        .eq("role", "checkout")
        .maybeSingle();
      if (priorRun) {
        // Running again means the recorded outcome is no longer the run's
        // outcome. Clearing it also re-opens the row for release, which only
        // stamps a row whose `finished_at` is still null.
        const { error: reopenError } = await taskRuns()
          .update({ finished_at: null, outcome: null })
          .eq("id", (priorRun as { id: string }).id);
        if (reopenError) {
          throw new Error(`Failed to reopen task run: ${reopenError.message}`);
        }
      } else {
        const { error: runError } = await taskRuns().insert({
          id: uuidv7(),
          tenant_id: tenantId,
          scope_id: scopeId,
          task_id: taskId,
          agent_session_run_id: runId,
          // DB still allows work|review; only checkout is ever written.
          role: "checkout" as const,
          created_at: now,
        });
        if (runError) {
          throw new Error(`Failed to record task run: ${runError.message}`);
        }
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
      const restingStatus = input.resting_status ?? "todo";
      if (restingStatus !== "backlog" && restingStatus !== "todo") {
        throw new Error("invalid_resting_status");
      }
      const { data, error } = await tasks()
        .update({
          checkout_run_id: null,
          status: restingStatus,
          // The ending run's ask is the whole truth about what is outstanding:
          // a run that finished without asking clears whatever was pending.
          pending_approval_operation_ids:
            input.pending_approval_operation_ids ?? [],
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

      // Stamp the run outcome onto the module's own task_runs row so run
      // history stays truthful even when the best-effort ai.agent_run write in
      // apps/ai fails. A release without an outcome (manual/reaper) still
      // closes the row — outcome stays null, finished_at marks the end.
      {
        const { error: runError } = await taskRuns()
          .update({
            finished_at: now,
            outcome: input.outcome ?? null,
          })
          .eq("task_id", taskId)
          .eq("tenant_id", tenantId)
          .eq("scope_id", scopeId)
          .eq("agent_session_run_id", existing.checkout_run_id)
          .is("finished_at", null);
        if (runError) {
          // Non-fatal bookkeeping: the release itself already succeeded.
          record("tasks.run_outcome_write_failed", {
            id: taskId,
            run_id: existing.checkout_run_id,
          });
        }
      }

      await appendActivity({
        task_id: taskId,
        event_type: "tasks.released",
        payload: {
          run_id: existing.checkout_run_id,
          ...(input.outcome ? { outcome: input.outcome } : {}),
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

    /** Tasks currently claimed by a run (checkout_run_id set) — reaper input. */
    async listClaimedTasks(): Promise<Task[]> {
      const { data, error } = await tasks()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .not("checkout_run_id", "is", null);
      if (error) {
        throw new Error(`Failed to list claimed tasks: ${error.message}`);
      }
      return (data ?? []).map((row) =>
        rowToTask(row as Record<string, unknown>)
      );
    },

    /**
     * The state of a checkout's backing `ai.agent_run` row, for the reaper.
     * "missing" is reported separately from "finished": a checkout normally has
     * its run registered within seconds, but the register write is best-effort —
     * the reaper only treats "missing" as stale after a grace window.
     */
    async getCheckoutRunState(
      runId: string
    ): Promise<"running" | "finished" | "missing"> {
      const { data, error } = await agentSessionRuns()
        .select("status, finished_at")
        .eq("id", runId)
        .maybeSingle();
      if (error || !data) {
        return "missing";
      }
      const status = String((data as { status: string }).status);
      if (status === "running" || status === "interrupted") {
        return "running";
      }
      return "finished";
    },

    async listTaskRuns(taskId: string): Promise<TaskRun[]> {
      // A task re-run many times accumulates runs; keep list payloads bounded.
      const { data, error } = await taskRuns()
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .order("created_at", { ascending: false })
        .limit(TASK_RUNS_LIST_LIMIT);
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
      // Column names are `agent_id`/`thread_id` — the table was renamed from
      // agent_session_run and these were `agent_type_key`/`session_id`. Selecting
      // the old names made PostgREST reject the whole query, and because the
      // error was discarded every run silently lost its enrichment: no
      // finished_at (so the UI showed finished runs as perpetually "in
      // progress") and no agent name. Errors are surfaced below, not swallowed.
      const { data: sessionRuns, error: sessionRunsError } =
        await agentSessionRuns()
          .select(
            "id, agent_id, started_at, finished_at, thread_id, created_by_user_id"
          )
          .in("id", sessionRunIds);
      if (sessionRunsError) {
        throw new Error(
          `Failed to load task run details: ${sessionRunsError.message}`
        );
      }

      const sessionRunById = new Map(
        (sessionRuns ?? []).map((row) => [
          String((row as { id: string }).id),
          row as {
            agent_id: string;
            created_by_user_id: string | null;
            finished_at: string | null;
            started_at: string;
            thread_id: string;
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
          agent_thread_id: sessionRun.thread_id,
          agent_type_key: sessionRun.agent_id,
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
