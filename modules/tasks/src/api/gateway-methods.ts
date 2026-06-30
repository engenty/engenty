import type {
  PluginAuthContext,
  PluginHttpRouteContext,
  PluginServerApi,
  QueueServiceLike,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import type { createTasksRepoSupabase } from "../dal/supabase.js";
import { performTaskCheckout } from "../lib/perform-task-checkout.js";
import { TaskCheckoutConflictError } from "../lib/task-checkout-errors.js";
import {
  goalCreateInputSchema,
  goalIdParamsSchema,
  goalSchema,
  goalsListQuerySchema,
  goalsPaginatedResponseSchema,
  goalUpdateInputSchema,
  taskActivityListSchema,
  taskAddCommentOperationInputSchema,
  taskCheckoutInputRawSchema,
  taskCheckoutInputSchema,
  taskCommentSchema,
  taskCreateInputSchema,
  taskDetailSchema,
  taskIdParamsSchema,
  taskReleaseInputRawSchema,
  taskReleaseInputSchema,
  taskRunsListSchema,
  taskSchema,
  taskSettingsSchema,
  taskSettingsUpdateSchema,
  tasksListQuerySchema,
  tasksPaginatedResponseSchema,
  taskUpdateInputSchema,
} from "../schema/zod.js";
import { fetchRegisteredAgentIds } from "./agent-key-validator.js";
import {
  enqueueTaskDispatch,
  isDispatchableTask,
} from "./task-dispatch-queue.js";

export type TasksRepo = ReturnType<typeof createTasksRepoSupabase>;

export type RepoOrFactory =
  | TasksRepo
  | ((
      auth: PluginAuthContext,
      recordAuditEvent?: PluginHttpRouteContext["recordAuditEvent"]
    ) => TasksRepo);

export function getRepo(
  repoOrFactory: RepoOrFactory,
  auth?: PluginAuthContext,
  recordAuditEvent?: PluginHttpRouteContext["recordAuditEvent"]
): TasksRepo {
  if (typeof repoOrFactory === "function") {
    if (!auth) {
      throw new Error("Auth context required");
    }
    return repoOrFactory(auth, recordAuditEvent);
  }
  return repoOrFactory;
}

const readOp = (moduleCaps: string[]) => ({
  moduleId: "tasks",
  requiredCapabilities: moduleCaps,
  riskLevel: "low" as const,
  idempotent: true,
  dryRunSupported: false,
  requiresApproval: false,
});

const writeOp = (moduleCaps: string[]) => ({
  moduleId: "tasks",
  requiredCapabilities: moduleCaps,
  riskLevel: "high" as const,
  idempotent: false,
  dryRunSupported: false,
  requiresApproval: true,
});

const taskUpdateOperationInputSchema = taskUpdateInputSchema.extend({
  id: z.string().uuid(),
  actor_agent_type_key: z.string().optional(),
});

export interface TasksGatewayOptions {
  /** Base URL of apps/ai (e.g. http://localhost:3100). When absent, agent key validation is skipped. */
  aiBaseUrl?: string | null;
  /** Service JWT for apps/ai registry calls. When absent, agent key validation is skipped. */
  aiServiceJwt?: string | null;
  /** Queue service for dispatching agent tasks. When absent, auto-dispatch is skipped. */
  queue?: QueueServiceLike | null;
}

async function validateAgentKey(
  agentTypeKey: string | null | undefined,
  options: TasksGatewayOptions | undefined
): Promise<void> {
  if (!agentTypeKey) {
    return;
  }
  const { aiBaseUrl, aiServiceJwt } = options ?? {};
  if (!(aiBaseUrl && aiServiceJwt)) {
    return;
  }
  const known = await fetchRegisteredAgentIds(aiBaseUrl, aiServiceJwt);
  if (!known.has(agentTypeKey)) {
    const err = new Error("unknown_agent_type_key") as Error & {
      details: unknown;
    };
    err.details = { agent_type_key: agentTypeKey, known: [...known] };
    throw err;
  }
}

export function registerTasksGatewayMethods(
  api: PluginServerApi,
  repoOrFactory: RepoOrFactory,
  options?: TasksGatewayOptions
) {
  api.registerOperation({
    operationId: "tasks_list",
    summary: "List tasks",
    ...readOp(["module.tasks.read"]),
    inputSchema: tasksListQuerySchema.partial(),
    outputSchema: tasksPaginatedResponseSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      return repo.listTasksPaginated(
        tasksListQuerySchema.parse(input ?? {}),
        ctx.auth?.principalId
      );
    },
  });

  api.registerOperation({
    operationId: "tasks_get",
    summary: "Get task by ID",
    ...readOp(["module.tasks.read"]),
    inputSchema: taskIdParamsSchema,
    outputSchema: taskDetailSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = taskIdParamsSchema.parse(input);
      const task = await repo.getTask(params.id);
      if (!task) {
        throw new Error("task_not_found");
      }
      return task;
    },
  });

  api.registerOperation({
    operationId: "tasks_create",
    summary: "Create task",
    ...writeOp(["module.tasks.write"]),
    inputSchema: taskCreateInputSchema,
    outputSchema: taskSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = taskCreateInputSchema.parse(input);
      if (parsed.primary_assignee_kind === "agent") {
        await validateAgentKey(parsed.primary_assignee_agent_type_key, options);
      }
      const task = await repo.createTask(parsed, {
        createdByUserId: ctx.auth?.principalId ?? null,
        actorKind: parsed.created_by_agent_type_key ? "agent" : "user",
      });
      if (options?.queue && ctx.auth?.tenantId && isDispatchableTask(task)) {
        await enqueueTaskDispatch(options.queue, task, ctx.auth.tenantId);
      }
      return task;
    },
  });

  api.registerOperation({
    operationId: "tasks_update",
    summary: "Update task",
    ...writeOp(["module.tasks.write"]),
    inputSchema: taskUpdateOperationInputSchema,
    outputSchema: taskSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const raw = input as z.infer<typeof taskUpdateOperationInputSchema>;
      const { id, actor_agent_type_key, ...patch } = raw;
      if (patch.primary_assignee_kind === "agent") {
        await validateAgentKey(patch.primary_assignee_agent_type_key, options);
      }
      const existing = await repo.getTask(id);
      if (!existing) {
        throw new Error("task_not_found");
      }
      const actorKind = actor_agent_type_key ? "agent" : "user";
      const updated = await repo.updateTask(id, patch, {
        actorKind,
        hasActiveCheckout: !!existing.checkout_run_id,
        actorUserId: ctx.auth?.principalId ?? null,
        actorAgentTypeKey: actor_agent_type_key ?? null,
      });
      if (!updated) {
        throw new Error("task_not_found");
      }
      if (options?.queue && ctx.auth?.tenantId && isDispatchableTask(updated)) {
        await enqueueTaskDispatch(options.queue, updated, ctx.auth.tenantId);
      }
      return updated;
    },
  });

  api.registerOperation({
    operationId: "tasks_delete",
    summary: "Delete task",
    ...writeOp(["module.tasks.write"]),
    inputSchema: taskIdParamsSchema,
    outputSchema: z.object({ ok: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = taskIdParamsSchema.parse(input);
      const ok = await repo.deleteTask(params.id);
      if (!ok) {
        throw new Error("task_not_found");
      }
      return { ok: true };
    },
  });

  api.registerOperation({
    operationId: "tasks_add_comment",
    summary: "Add task comment",
    ...writeOp(["module.tasks.write"]),
    inputSchema: taskAddCommentOperationInputSchema,
    outputSchema: taskCommentSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const raw = input as z.infer<typeof taskAddCommentOperationInputSchema>;
      const { id, content, created_by_agent_type_key } = raw;
      const existing = await repo.getTask(id);
      if (!existing) {
        throw new Error("task_not_found");
      }
      return repo.addComment(id, content, {
        ...(created_by_agent_type_key
          ? {
              createdByAgentTypeKey: created_by_agent_type_key,
              createdByUserId: null,
            }
          : { createdByUserId: ctx.auth?.principalId ?? null }),
      });
    },
  });

  api.registerOperation({
    operationId: "tasks_checkout",
    summary: "Checkout task for agent work",
    ...writeOp(["module.tasks.write"]),
    inputSchema: taskCheckoutInputRawSchema.extend({ id: z.string().uuid() }),
    outputSchema: taskSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = taskCheckoutInputSchema.parse(input);
      const id = (input as { id: string }).id;
      try {
        return await performTaskCheckout(
          {
            repo,
            storage: api.getStorageService?.("files") ?? null,
            tenantId: ctx.auth?.tenantId ?? "",
          },
          id,
          parsed,
          {
            actorUserId: ctx.auth?.principalId ?? null,
          }
        );
      } catch (err) {
        if (err instanceof TaskCheckoutConflictError) {
          const conflict = new Error(err.code);
          (conflict as Error & { details: unknown }).details = err.conflict;
          throw conflict;
        }
        throw err;
      }
    },
  });

  api.registerOperation({
    operationId: "tasks_release",
    summary: "Release agent checkout on task",
    ...writeOp(["module.tasks.write"]),
    inputSchema: taskReleaseInputRawSchema.extend({ id: z.string().uuid() }),
    outputSchema: taskSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = taskReleaseInputSchema.parse(input);
      const raw = {
        id: (input as { id: string }).id,
        ...parsed,
        actor_agent_type_key: (input as { actor_agent_type_key?: string })
          .actor_agent_type_key,
      };
      const { id, actor_agent_type_key, ...releaseInput } = raw;
      const released = await repo.releaseTask(id, releaseInput, {
        actorKind: actor_agent_type_key ? "agent" : "user",
        actorUserId: ctx.auth?.principalId ?? null,
        actorAgentTypeKey: actor_agent_type_key ?? null,
      });
      if (!released) {
        throw new Error("task_not_found");
      }
      return released;
    },
  });

  api.registerOperation({
    operationId: "tasks_list_runs",
    summary: "List task runs",
    ...readOp(["module.tasks.read"]),
    inputSchema: taskIdParamsSchema,
    outputSchema: taskRunsListSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = taskIdParamsSchema.parse(input);
      const existing = await repo.getTask(params.id);
      if (!existing) {
        throw new Error("task_not_found");
      }
      const data = await repo.listTaskRuns(params.id);
      return { data };
    },
  });

  api.registerOperation({
    operationId: "tasks_list_activity",
    summary: "List task activity",
    ...readOp(["module.tasks.read"]),
    inputSchema: taskIdParamsSchema,
    outputSchema: taskActivityListSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = taskIdParamsSchema.parse(input);
      const existing = await repo.getTask(params.id);
      if (!existing) {
        throw new Error("task_not_found");
      }
      const data = await repo.listTaskActivity(params.id);
      return { data };
    },
  });

  api.registerOperation({
    operationId: "tasks_settings_get",
    summary: "Get task module settings",
    ...readOp(["module.tasks.read"]),
    inputSchema: z.object({}),
    outputSchema: taskSettingsSchema,
    handler: async (_input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      return repo.getSettings();
    },
  });

  api.registerOperation({
    operationId: "tasks_settings_update",
    summary: "Update task module settings",
    ...writeOp(["module.tasks.write"]),
    inputSchema: taskSettingsUpdateSchema,
    outputSchema: taskSettingsSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      return repo.updateSettings(taskSettingsUpdateSchema.parse(input ?? {}));
    },
  });

  api.registerOperation({
    operationId: "goals_list",
    summary: "List goals",
    ...readOp(["module.goals.read"]),
    inputSchema: goalsListQuerySchema.partial(),
    outputSchema: goalsPaginatedResponseSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      return repo.listGoalsPaginated(goalsListQuerySchema.parse(input ?? {}));
    },
  });

  api.registerOperation({
    operationId: "goals_get",
    summary: "Get goal by ID",
    ...readOp(["module.goals.read"]),
    inputSchema: goalIdParamsSchema,
    outputSchema: goalSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = goalIdParamsSchema.parse(input);
      const goal = await repo.getGoal(params.id);
      if (!goal) {
        throw new Error("goal_not_found");
      }
      return goal;
    },
  });

  api.registerOperation({
    operationId: "goals_create",
    summary: "Create goal",
    ...writeOp(["module.goals.write"]),
    inputSchema: goalCreateInputSchema,
    outputSchema: goalSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      return repo.createGoal(goalCreateInputSchema.parse(input));
    },
  });

  api.registerOperation({
    operationId: "goals_update",
    summary: "Update goal",
    ...writeOp(["module.goals.write"]),
    inputSchema: goalUpdateInputSchema.extend({ id: z.string().uuid() }),
    outputSchema: goalSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const raw = input as { id: string } & z.infer<
        typeof goalUpdateInputSchema
      >;
      const { id, ...patch } = raw;
      const updated = await repo.updateGoal(id, patch);
      if (!updated) {
        throw new Error("goal_not_found");
      }
      return updated;
    },
  });

  api.registerOperation({
    operationId: "goals_delete",
    summary: "Delete goal",
    ...writeOp(["module.goals.write"]),
    inputSchema: goalIdParamsSchema,
    outputSchema: z.object({ ok: z.boolean() }),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = goalIdParamsSchema.parse(input);
      const ok = await repo.deleteGoal(params.id);
      if (!ok) {
        throw new Error("goal_not_found");
      }
      return { ok: true };
    },
  });
}
