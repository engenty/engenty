import { randomUUID } from "node:crypto";
import type {
  PluginHttpRoute,
  PluginServerApi,
  PluginServerOperation,
} from "@engenty/plugin-sdk";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { TASK_AGENT_CHECKOUT_ENTRY_STATUSES } from "../domain/task-lifecycle.js";
import { TaskCheckoutConflictError } from "../lib/task-checkout-errors.js";
import { definitionsToSettingsSlice } from "../lib/task-status-settings.js";
import type {
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
import type { TasksRepo } from "./gateway-shared.js";

/**
 * Stands in for the tenant's default space. The real repo resolves this through
 * resolveCreateSpaceId (explicit → inherit → tenant default); the fake keeps
 * only the "explicit wins, else default" half, which is what its callers test.
 */
const DEFAULT_SPACE_ID = "00000000-0000-4000-8000-0000000space";

const defaultSettings: TaskSettings = {
  identifier_prefix: "ENG",
  stale_after_days: 7,
  ...definitionsToSettingsSlice(
    BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => ({ ...d }))
  ),
};

export function makeMockTasksRepo(): TasksRepo {
  const tasks = new Map<string, Task>();
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
      const data = [...tasks.values()].filter((t) => {
        if (params.project_id && t.project_id !== params.project_id) {
          return false;
        }
        if (params.space_id && t.space_id !== params.space_id) {
          return false;
        }
        if (params.status && t.status !== params.status) {
          return false;
        }
        if (
          params.primary_assignee_agent_type_key &&
          t.primary_assignee_agent_type_key !==
            params.primary_assignee_agent_type_key
        ) {
          return false;
        }
        return true;
      });
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
        space_id: input.space_id ?? DEFAULT_SPACE_ID,
        identifier: `ENG-${sequence}`,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? "todo",
        priority: input.priority ?? "medium",
        parent_id: input.parent_id ?? null,
        primary_assignee_kind: input.primary_assignee_kind ?? "none",
        primary_assignee_user_id: input.primary_assignee_user_id ?? null,
        primary_assignee_agent_type_key:
          input.primary_assignee_agent_type_key ?? null,
        created_by_user_id: null,
        created_by_agent_type_key: input.created_by_agent_type_key ?? null,
        due_date: input.due_date ?? null,
        blocked_by_task_ids: input.blocked_by_task_ids ?? [],
        started_at: null,
        completed_at: null,
        cancelled_at: null,
        checkout_run_id: null,
        created_at: now(),
        updated_at: now(),
        collaborator_user_ids: input.collaborator_user_ids ?? [],
        project_id: input.project_id ?? null,
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
    async getLatestAgentResultComment(taskId: string) {
      const task = tasks.get(taskId);
      const comments = (
        task as { comments?: Array<{ content?: string }> } | undefined
      )?.comments;
      if (!comments?.length) {
        return null;
      }
      for (let i = comments.length - 1; i >= 0; i -= 1) {
        const content = comments[i]?.content?.trim() ?? "";
        if (content.startsWith("🤖")) {
          return content;
        }
      }
      return null;
    },
    async loadTaskStatuses(ids: string[]) {
      return new Map(ids.map((id) => [id, tasks.get(id)?.status]));
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
      // One row per run, like the real DAL: a resumed run re-enters checkout
      // under the same run id, and a second row would list it twice.
      const priorRun = [...runs.values()].find(
        (candidate) =>
          candidate.task_id === taskId &&
          candidate.agent_session_run_id === runId &&
          candidate.role === "checkout"
      );
      if (priorRun) {
        runs.set(priorRun.id, {
          ...priorRun,
          finished_at: null,
          outcome: null,
        });
      } else {
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
      }
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
        status: input.resting_status ?? "todo",
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
  const api = {
    callGatewayMethod: async () => null,
    hasOperation: () => false,
    registerHttpRoute: (route: PluginHttpRoute) => {
      httpRoutes.push(route);
    },
    registerOperation: (operation: PluginServerOperation) => {
      serverOperations.push(operation);
    },
    registerAiRegistration: () => {},
    registerFeatureFlags: () => [],
    registerProfilePolicy: () => {},
    registerRoleProfiles: () => {},
    registerResultPolicy: () => {},
    registerService: () => {},
    registerTestDataType: () => {},
    registerCli: () => {},
    resolvePath: (p: string) => p,
  } as unknown as PluginServerApi;
  return { api, httpRoutes, serverOperations, defaultAuth };
}
