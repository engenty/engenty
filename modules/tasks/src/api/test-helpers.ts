import { randomUUID } from "node:crypto";
import type {
  PluginHttpRoute,
  PluginRegistrationReceipt,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { TASK_AGENT_CHECKOUT_ENTRY_STATUSES } from "../domain/task-lifecycle.js";
import { TaskCheckoutConflictError } from "../lib/task-checkout-errors.js";
import { definitionsToSettingsSlice } from "../lib/task-status-settings.js";
import type {
  Goal,
  GoalCreateInput,
  GoalsPaginatedResponse,
  GoalsQueryParams,
  GoalUpdateInput,
  Task,
  TaskActivity,
  TaskCheckoutInput,
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
import type { TasksRepo } from "./gateway-methods.js";

const defaultSettings: TaskSettings = {
  identifier_prefix: "ENG",
  stale_after_days: 7,
  ...definitionsToSettingsSlice(
    BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => ({ ...d }))
  ),
};

export function makeMockTasksRepo(): TasksRepo {
  const tasks = new Map<string, Task>();
  const goals = new Map<string, Goal>();
  const runs = new Map<string, TaskRun>();
  const activity = new Map<string, TaskActivity>();
  let settings = { ...defaultSettings };
  let sequence = 0;

  const now = () => new Date().toISOString();

  return {
    async getSettings() {
      return settings;
    },
    async updateSettings(input: TaskSettingsUpdateInput) {
      settings = {
        ...settings,
        identifier_prefix:
          input.identifier_prefix ?? settings.identifier_prefix,
        stale_after_days: input.stale_after_days ?? settings.stale_after_days,
        ...(input.task_status_definitions
          ? definitionsToSettingsSlice(input.task_status_definitions)
          : {}),
      };
      return settings;
    },
    async listTasksPaginated(params: TasksQueryParams) {
      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? 25;
      const data = [...tasks.values()];
      return {
        data: data.slice((page - 1) * pageSize, page * pageSize),
        total: data.length,
        page,
        pageSize,
      } satisfies TasksPaginatedResponse;
    },
    async getTask(id: string) {
      const task = tasks.get(id);
      if (!task) {
        return null;
      }
      return {
        ...task,
        contexts: [],
        comments: [],
      } satisfies TaskDetail;
    },
    async createTask(input: TaskCreateInput) {
      sequence += 1;
      const id = randomUUID();
      const task: Task = {
        id,
        tenant_id: "tenant",
        scope_id: "scope",
        identifier: `ENG-${sequence}`,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? "todo",
        priority: input.priority ?? "medium",
        goal_id: input.goal_id ?? null,
        parent_id: input.parent_id ?? null,
        primary_assignee_kind: input.primary_assignee_kind ?? "none",
        primary_assignee_user_id: input.primary_assignee_user_id ?? null,
        primary_assignee_agent_type_key:
          input.primary_assignee_agent_type_key ?? null,
        created_by_user_id: null,
        created_by_agent_type_key: input.created_by_agent_type_key ?? null,
        due_date: input.due_date ?? null,
        blocked_by_task_ids: input.blocked_by_task_ids ?? [],
        request_depth: 0,
        started_at: null,
        completed_at: null,
        cancelled_at: null,
        checkout_run_id: null,
        created_at: now(),
        updated_at: now(),
        collaborator_user_ids: input.collaborator_user_ids ?? [],
      };
      tasks.set(id, task);
      return task;
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
    ) {
      const existing = tasks.get(id);
      if (!existing) {
        return null;
      }
      const nextStatus = input.status ?? existing.status;
      const actorKind = opts?.actorKind ?? "user";
      const hasActiveCheckout =
        opts?.hasActiveCheckout ?? !!existing.checkout_run_id;
      if (
        actorKind === "agent" &&
        nextStatus === "in_progress" &&
        !hasActiveCheckout
      ) {
        throw new Error("task_checkout_required");
      }
      const updated = { ...existing, ...input, updated_at: now() };
      tasks.set(id, updated);
      return updated;
    },
    async deleteTask(id: string) {
      return tasks.delete(id);
    },
    async addComment(taskId: string, content: string) {
      return {
        id: randomUUID(),
        tenant_id: "tenant",
        scope_id: "scope",
        task_id: taskId,
        content,
        created_by_user_id: null,
        created_by_agent_type_key: null,
        created_at: now(),
      };
    },
    async listGoalsPaginated(params: GoalsQueryParams) {
      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? 25;
      const data = [...goals.values()];
      return {
        data: data.slice((page - 1) * pageSize, page * pageSize),
        total: data.length,
        page,
        pageSize,
      } satisfies GoalsPaginatedResponse;
    },
    async getGoal(id: string) {
      return goals.get(id) ?? null;
    },
    async createGoal(input: GoalCreateInput) {
      const id = randomUUID();
      const goal: Goal = {
        id,
        tenant_id: "tenant",
        scope_id: "scope",
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? "planned",
        parent_id: input.parent_id ?? null,
        owner_user_id: input.owner_user_id ?? null,
        owner_agent_type_key: input.owner_agent_type_key ?? null,
        target_date: input.target_date ?? null,
        created_at: now(),
        updated_at: now(),
      };
      goals.set(id, goal);
      return goal;
    },
    async updateGoal(id: string, input: GoalUpdateInput) {
      const existing = goals.get(id);
      if (!existing) {
        return null;
      }
      const updated = { ...existing, ...input, updated_at: now() };
      goals.set(id, updated);
      return updated;
    },
    async deleteGoal(id: string) {
      return goals.delete(id);
    },
    async checkoutTask(taskId: string, input: TaskCheckoutInput) {
      const existing = tasks.get(taskId);
      if (!existing) {
        throw new Error("task_not_found");
      }
      const expected = input.expected_statuses ?? [
        ...TASK_AGENT_CHECKOUT_ENTRY_STATUSES,
      ];
      const runId = input.agent_session_run_id;
      if (existing.checkout_run_id && existing.checkout_run_id !== runId) {
        throw new TaskCheckoutConflictError({
          current_status: existing.status,
          current_assignee_kind: existing.primary_assignee_kind,
          checkout_run_id: existing.checkout_run_id,
        });
      }
      if (
        existing.checkout_run_id === runId &&
        existing.status === "in_progress"
      ) {
        return existing;
      }
      if (!expected.includes(existing.status)) {
        throw new TaskCheckoutConflictError({
          current_status: existing.status,
          current_assignee_kind: existing.primary_assignee_kind,
          checkout_run_id: existing.checkout_run_id,
        });
      }
      const checkedOut: Task = {
        ...existing,
        status: "in_progress",
        primary_assignee_kind: "agent",
        primary_assignee_agent_type_key: input.agent_type_key,
        primary_assignee_user_id: null,
        checkout_run_id: runId,
        started_at: existing.started_at ?? now(),
        updated_at: now(),
      };
      tasks.set(taskId, checkedOut);
      const run: TaskRun = {
        id: randomUUID(),
        tenant_id: existing.tenant_id,
        scope_id: existing.scope_id,
        task_id: taskId,
        agent_session_run_id: runId,
        role: "checkout",
        created_at: now(),
      };
      runs.set(run.id, run);
      return checkedOut;
    },
    async releaseTask(taskId: string, input: TaskReleaseInput = {}) {
      const existing = tasks.get(taskId);
      if (!existing) {
        return null;
      }
      if (!existing.checkout_run_id) {
        return existing;
      }
      if (
        input.agent_session_run_id &&
        existing.checkout_run_id !== input.agent_session_run_id
      ) {
        throw new Error("task_release_run_mismatch");
      }
      const released: Task = {
        ...existing,
        checkout_run_id: null,
        status: "todo",
        updated_at: now(),
      };
      tasks.set(taskId, released);
      return released;
    },
    async listTaskRuns(taskId: string) {
      return [...runs.values()].filter((run) => run.task_id === taskId);
    },
    async listTaskActivity(taskId: string) {
      return [...activity.values()]
        .filter((item) => item.task_id === taskId)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    },
    async listRecentActivity(opts: { limit: number; taskIds?: string[] }) {
      let rows = [...activity.values()];
      if (opts.taskIds?.length) {
        const allowed = new Set(opts.taskIds);
        rows = rows.filter((item) => allowed.has(item.task_id));
      }
      return rows
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        .slice(0, opts.limit);
    },
    async appendActivity(input: {
      task_id: string;
      event_type: string;
      payload?: Record<string, unknown>;
      actor_user_id?: string | null;
      actor_agent_type_key?: string | null;
    }) {
      const row: TaskActivity = {
        id: randomUUID(),
        tenant_id: "tenant",
        scope_id: "scope",
        task_id: input.task_id,
        event_type: input.event_type,
        payload: input.payload ?? {},
        actor_user_id: input.actor_user_id ?? null,
        actor_agent_type_key: input.actor_agent_type_key ?? null,
        created_at: now(),
      };
      activity.set(row.id, row);
      return row;
    },
  } as TasksRepo;
}

export const defaultAuth = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  scopeId: "default",
  principalId: "00000000-0000-4000-8000-000000000002",
};

export function makeMockApi() {
  const httpRoutes: PluginHttpRoute[] = [];
  const serverOperations: PluginServerOperation[] = [];
  const noopReceipt = (): PluginRegistrationReceipt => ({
    dispose: () => {},
  });
  const api: PluginServerApi = {
    callGatewayMethod: async () => null,
    hasOperation: () => false,
    registerHttpRoute: (route) => {
      httpRoutes.push(route);
      return noopReceipt();
    },
    registerOperation: (operation) => {
      serverOperations.push(operation);
      return noopReceipt();
    },
    registerAiRegistration: () => {},
    registerFeatureFlags: () => [],
    registerProfilePolicy: () => {},
    registerRoleProfiles: () => {},
    registerResultPolicy: () => {},
    registerService: () => {},
    registerTestDataType: () => noopReceipt(),
    registerCli: () => {},
    resolvePath: (p: string) => p,
  };
  return { api, httpRoutes, serverOperations, defaultAuth };
}
