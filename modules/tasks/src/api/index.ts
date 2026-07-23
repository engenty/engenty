import type { PluginServerApi } from "@engenty/plugin-sdk";
import type { z } from "zod";
import { validateBlockedBy } from "../domain/task-blockers.js";
import { performTaskCheckout } from "../lib/perform-task-checkout.js";
import { TaskCheckoutConflictError } from "../lib/task-checkout-errors.js";
import { buildTasksBriefingResponse } from "../lib/tasks-briefing-service.js";
import {
  goalCreateInputSchema,
  goalHandoffResponseSchema,
  goalIdParamsSchema,
  goalSchema,
  goalsListQuerySchema,
  goalsPaginatedResponseSchema,
  goalUpdateInputSchema,
  notFoundSchema,
  taskActivityListSchema,
  taskCheckoutConflictSchema,
  taskCheckoutInputSchema,
  taskCommentCreateSchema,
  taskCreateInputSchema,
  taskDetailSchema,
  taskIdParamsSchema,
  taskReleaseInputSchema,
  taskRunNowResponseSchema,
  taskRunsListSchema,
  taskSchema,
  taskSettingsSchema,
  taskSettingsUpdateSchema,
  tasksBriefingQuerySchema,
  tasksBriefingResponseSchema,
  tasksListQuerySchema,
  tasksPaginatedResponseSchema,
  taskToolApprovalBodySchema,
  taskUpdateInputSchema,
} from "../schema/zod.js";
import {
  getRepo,
  type RepoOrFactory,
  registerTasksGatewayMethods,
  type TasksGatewayOptions,
} from "./gateway-methods.js";
import { handoffGoalToCoordinator } from "./goal-handoff-service.js";
import { resolveTaskToolApproval } from "./task-approval-service.js";
import {
  dispatchTaskIfReady,
  wakeBlockedDependents,
} from "./task-dispatch-service.js";
import { runTaskNow } from "./task-run-now-service.js";

const UUID_PARAM =
  "{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}";

export const TASK_BY_ID_PATH = `/api/tasks/:id${UUID_PARAM}`;
export const GOAL_BY_ID_PATH = `/api/tasks/goals/:id${UUID_PARAM}`;

function parseQuery(
  url: URL,
  keys: string[]
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = url.searchParams.get(key);
    out[key] = value ?? undefined;
  }
  return out;
}

export function registerTasksApi(
  api: PluginServerApi,
  repoOrFactory: RepoOrFactory,
  gatewayOptions?: TasksGatewayOptions
) {
  const readTasks = () => ({
    moduleId: "tasks",
    requiredCapabilities: ["module.tasks.read"],
    riskLevel: "low" as const,
    idempotent: true,
    requiresApproval: false,
  });
  const writeTasks = () => ({
    moduleId: "tasks",
    requiredCapabilities: ["module.tasks.write"],
    riskLevel: "high" as const,
    idempotent: false,
    requiresApproval: true,
  });
  const readGoals = () => ({
    moduleId: "tasks",
    requiredCapabilities: ["module.goals.read"],
    riskLevel: "low" as const,
    idempotent: true,
    requiresApproval: false,
  });
  const writeGoals = () => ({
    moduleId: "tasks",
    requiredCapabilities: ["module.goals.write"],
    riskLevel: "high" as const,
    idempotent: false,
    requiresApproval: true,
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/tasks/settings",
    operation: readTasks(),
    summary: "Get task settings",
    tags: ["tasks", "settings"],
    responses: {
      200: { description: "Task settings", schema: taskSettingsSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      return repo.getSettings();
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/tasks/settings",
    operation: writeTasks(),
    summary: "Update task settings",
    tags: ["tasks", "settings"],
    request: { body: taskSettingsUpdateSchema },
    responses: {
      200: { description: "Updated settings", schema: taskSettingsSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const body = taskSettingsUpdateSchema.parse(ctx.body ?? {});
      return repo.updateSettings(body);
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/tasks/goals",
    operation: readGoals(),
    summary: "List goals",
    tags: ["tasks", "goals"],
    request: { query: goalsListQuerySchema },
    responses: {
      200: { description: "Goals list", schema: goalsPaginatedResponseSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const url = new URL(ctx.request.url);
      const parsed = goalsListQuerySchema.parse(
        parseQuery(url, [
          "page",
          "pageSize",
          "search",
          "status",
          "owner_agent_type_key",
          "owner_kind",
          "sortBy",
          "sortOrder",
        ])
      );
      return repo.listGoalsPaginated(parsed);
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/tasks/goals",
    operation: writeGoals(),
    summary: "Create goal",
    tags: ["tasks", "goals"],
    request: { body: goalCreateInputSchema },
    responses: {
      201: { description: "Created goal", schema: goalSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const body = goalCreateInputSchema.parse(ctx.body ?? {});
      const goal = await repo.createGoal(body);
      return new Response(JSON.stringify(goal), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: GOAL_BY_ID_PATH,
    operation: readGoals(),
    summary: "Get goal",
    tags: ["tasks", "goals"],
    request: { params: goalIdParamsSchema },
    responses: {
      200: { description: "Goal", schema: goalSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof goalIdParamsSchema>;
      const goal = await repo.getGoal(params.id);
      if (!goal) {
        return new Response(JSON.stringify({ error: "goal_not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return goal;
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: GOAL_BY_ID_PATH,
    operation: writeGoals(),
    summary: "Update goal",
    tags: ["tasks", "goals"],
    request: { params: goalIdParamsSchema, body: goalUpdateInputSchema },
    responses: {
      200: { description: "Updated goal", schema: goalSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof goalIdParamsSchema>;
      const body = goalUpdateInputSchema.parse(ctx.body ?? {});
      try {
        const goal = await repo.updateGoal(params.id, body);
        if (!goal) {
          return new Response(JSON.stringify({ error: "goal_not_found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        return goal;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "goal_update_failed";
        return new Response(JSON.stringify({ error: message }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: GOAL_BY_ID_PATH,
    operation: writeGoals(),
    summary: "Delete goal",
    tags: ["tasks", "goals"],
    request: { params: goalIdParamsSchema },
    responses: {
      204: { description: "Deleted" },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof goalIdParamsSchema>;
      const existing = await repo.getGoal(params.id);
      if (!existing) {
        return new Response(JSON.stringify({ error: "goal_not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      await repo.deleteGoal(params.id);
      return new Response(null, { status: 204 });
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: `${GOAL_BY_ID_PATH}/handoff`,
    operation: writeGoals(),
    summary: "Hand a goal to the coordinator (assign + plan)",
    tags: ["tasks", "goals"],
    request: { params: goalIdParamsSchema },
    responses: {
      200: { description: "Handed off", schema: goalHandoffResponseSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof goalIdParamsSchema>;
      try {
        const result = await handoffGoalToCoordinator(
          {
            queue: gatewayOptions?.queue ?? null,
            repo,
            tenantId: ctx.auth?.tenantId ?? null,
          },
          params.id,
          ctx.auth?.principalId ?? null
        );
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "goal_handoff_failed";
        const status = message === "goal_not_found" ? 404 : 400;
        return new Response(JSON.stringify({ error: message }), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/tasks/briefing",
    operation: readTasks(),
    summary: "Tasks briefing aggregate",
    tags: ["tasks", "briefing"],
    request: { query: tasksBriefingQuerySchema },
    responses: {
      200: {
        description: "Briefing snapshot",
        schema: tasksBriefingResponseSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const url = new URL(ctx.request.url);
      const parsed = tasksBriefingQuerySchema.parse(parseQuery(url, ["mode"]));
      const mode = parsed.mode ?? "personal";
      return buildTasksBriefingResponse(repo, mode, ctx.auth?.principalId);
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/tasks",
    operation: readTasks(),
    summary: "List tasks",
    tags: ["tasks"],
    request: { query: tasksListQuerySchema },
    responses: {
      200: { description: "Tasks list", schema: tasksPaginatedResponseSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const url = new URL(ctx.request.url);
      const parsed = tasksListQuerySchema.parse(
        parseQuery(url, [
          "page",
          "pageSize",
          "search",
          "status",
          "goal_id",
          "parent_id",
          "assigned_to",
          "assignee_kind",
          "context_type",
          "context_id",
          "context_metadata_phase_id",
          "scope",
          "sortBy",
          "sortOrder",
        ])
      );
      return repo.listTasksPaginated(parsed, ctx.auth?.principalId);
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/tasks",
    operation: writeTasks(),
    summary: "Create task",
    tags: ["tasks"],
    request: { body: taskCreateInputSchema },
    responses: {
      201: { description: "Created task", schema: taskSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const body = taskCreateInputSchema.parse(ctx.body ?? {});
      try {
        if (body.blocked_by_task_ids?.length) {
          body.blocked_by_task_ids = await validateBlockedBy(
            null,
            body.blocked_by_task_ids,
            { loadBlockedBy: (id) => repo.getBlockedByIds(id) }
          );
        }
        const task = await repo.createTask(body, {
          createdByUserId: ctx.auth?.principalId ?? null,
          actorKind: body.created_by_agent_type_key ? "agent" : "user",
        });
        // Agent-assigned tasks auto-dispatch regardless of entry path (REST
        // here mirrors the tasks_create gateway op).
        if (gatewayOptions?.queue && ctx.auth?.tenantId) {
          await dispatchTaskIfReady(
            { queue: gatewayOptions.queue, repo, tenantId: ctx.auth.tenantId },
            task
          );
        }
        return new Response(JSON.stringify(task), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "task_create_failed";
        return new Response(JSON.stringify({ error: message }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: TASK_BY_ID_PATH,
    operation: readTasks(),
    summary: "Get task",
    tags: ["tasks"],
    request: { params: taskIdParamsSchema },
    responses: {
      200: { description: "Task detail", schema: taskDetailSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof taskIdParamsSchema>;
      const task = await repo.getTask(params.id);
      if (!task) {
        return new Response(JSON.stringify({ error: "task_not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return task;
    },
  });

  api.registerHttpRoute({
    method: "patch",
    path: TASK_BY_ID_PATH,
    operation: writeTasks(),
    summary: "Update task",
    tags: ["tasks"],
    request: { params: taskIdParamsSchema, body: taskUpdateInputSchema },
    responses: {
      200: { description: "Updated task", schema: taskSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof taskIdParamsSchema>;
      const body = taskUpdateInputSchema.parse(ctx.body ?? {});
      try {
        const existing = await repo.getTask(params.id);
        if (body.blocked_by_task_ids !== undefined) {
          body.blocked_by_task_ids = await validateBlockedBy(
            params.id,
            body.blocked_by_task_ids,
            { loadBlockedBy: (id) => repo.getBlockedByIds(id) }
          );
        }
        const task = await repo.updateTask(params.id, body, {
          actorKind: "user",
          hasActiveCheckout: !!existing?.checkout_run_id,
          actorUserId: ctx.auth?.principalId ?? null,
        });
        if (!task) {
          return new Response(JSON.stringify({ error: "task_not_found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        if (gatewayOptions?.queue && ctx.auth?.tenantId) {
          const deps = {
            queue: gatewayOptions.queue,
            repo,
            tenantId: ctx.auth.tenantId,
          };
          await dispatchTaskIfReady(deps, task);
          if (task.status === "done" && existing?.status !== "done") {
            await wakeBlockedDependents(deps, task);
          }
        }
        return task;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "task_update_failed";
        const status =
          message === "task_checkout_required" ||
          message === "task_status_transition_denied"
            ? 403
            : 400;
        return new Response(JSON.stringify({ error: message }), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: TASK_BY_ID_PATH,
    operation: writeTasks(),
    summary: "Delete task",
    tags: ["tasks"],
    request: { params: taskIdParamsSchema },
    responses: {
      204: { description: "Deleted" },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof taskIdParamsSchema>;
      const existing = await repo.getTask(params.id);
      if (!existing) {
        return new Response(JSON.stringify({ error: "task_not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      await repo.deleteTask(params.id);
      return new Response(null, { status: 204 });
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: `${TASK_BY_ID_PATH}/comments`,
    operation: writeTasks(),
    summary: "Add task comment",
    tags: ["tasks", "comments"],
    request: { params: taskIdParamsSchema, body: taskCommentCreateSchema },
    responses: {
      201: { description: "Comment created" },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof taskIdParamsSchema>;
      const existing = await repo.getTask(params.id);
      if (!existing) {
        return new Response(JSON.stringify({ error: "task_not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      const body = taskCommentCreateSchema.parse(ctx.body ?? {});
      const comment = await repo.addComment(params.id, body.content, {
        createdByUserId: ctx.auth?.principalId ?? null,
      });
      return new Response(JSON.stringify(comment), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: `${TASK_BY_ID_PATH}/checkout`,
    operation: writeTasks(),
    summary: "Checkout task for agent work",
    tags: ["tasks", "checkout"],
    request: { params: taskIdParamsSchema, body: taskCheckoutInputSchema },
    responses: {
      200: { description: "Checked out task", schema: taskSchema },
      404: { description: "Not found", schema: notFoundSchema },
      409: {
        description: "Checkout conflict",
        schema: taskCheckoutConflictSchema,
      },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof taskIdParamsSchema>;
      const body = taskCheckoutInputSchema.parse(ctx.body ?? {});
      try {
        const task = await performTaskCheckout(
          {
            repo,
            storage: api.getStorageService?.("files") ?? null,
            tenantId: ctx.auth?.tenantId ?? "",
          },
          params.id,
          body,
          {
            actorUserId: ctx.auth?.principalId ?? null,
          }
        );
        return task;
      } catch (err) {
        if (err instanceof TaskCheckoutConflictError) {
          return new Response(
            JSON.stringify({
              error: err.code,
              ...err.conflict,
            }),
            {
              status: 409,
              headers: { "content-type": "application/json" },
            }
          );
        }
        const message =
          err instanceof Error ? err.message : "task_checkout_failed";
        const status = message === "task_not_found" ? 404 : 400;
        return new Response(JSON.stringify({ error: message }), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: `${TASK_BY_ID_PATH}/release`,
    operation: writeTasks(),
    summary: "Release agent checkout on task",
    tags: ["tasks", "checkout"],
    request: { params: taskIdParamsSchema, body: taskReleaseInputSchema },
    responses: {
      200: { description: "Released task", schema: taskSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof taskIdParamsSchema>;
      const body = taskReleaseInputSchema.parse(ctx.body ?? {});
      try {
        const task = await repo.releaseTask(params.id, body, {
          actorKind: "user",
          actorUserId: ctx.auth?.principalId ?? null,
        });
        if (!task) {
          return new Response(JSON.stringify({ error: "task_not_found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        return task;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "task_release_failed";
        const status = message === "task_release_run_mismatch" ? 403 : 400;
        return new Response(JSON.stringify({ error: message }), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: `${TASK_BY_ID_PATH}/run`,
    operation: writeTasks(),
    summary: "Queue an agent run for this task now",
    tags: ["tasks", "runs"],
    request: { params: taskIdParamsSchema },
    responses: {
      200: {
        description: "Dispatch result",
        schema: taskRunNowResponseSchema,
      },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof taskIdParamsSchema>;
      try {
        return await runTaskNow(
          {
            actorUserId: ctx.auth?.principalId ?? null,
            queue: gatewayOptions?.queue ?? null,
            repo,
            tenantId: ctx.auth?.tenantId ?? null,
          },
          { taskId: params.id }
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "task_run_failed";
        const status = message === "task_not_found" ? 404 : 400;
        return new Response(JSON.stringify({ error: message }), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: `${TASK_BY_ID_PATH}/tool-approvals`,
    operation: writeTasks(),
    summary: "Approve or deny a pending tool approval on a task",
    tags: ["tasks", "approvals"],
    request: {
      params: taskIdParamsSchema,
      body: taskToolApprovalBodySchema,
    },
    responses: {
      200: { description: "Resolved task", schema: taskSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof taskIdParamsSchema>;
      const body = taskToolApprovalBodySchema.parse(ctx.body ?? {});
      const triggersRepo =
        gatewayOptions?.triggersRepoFactory && ctx.auth
          ? gatewayOptions.triggersRepoFactory(ctx.auth)
          : null;
      try {
        const task = await resolveTaskToolApproval(
          {
            actorUserId: ctx.auth?.principalId ?? null,
            queue: gatewayOptions?.queue ?? null,
            tasksRepo: repo,
            tenantId: ctx.auth?.tenantId ?? null,
            triggersRepo,
          },
          {
            decision: body.decision,
            operationId: body.operation_id,
            scope: body.scope,
            taskId: params.id,
          }
        );
        return task;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "tool_approval_failed";
        const status = message === "task_not_found" ? 404 : 400;
        return new Response(JSON.stringify({ error: message }), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: `${TASK_BY_ID_PATH}/runs`,
    operation: readTasks(),
    summary: "List task runs",
    tags: ["tasks", "runs"],
    request: { params: taskIdParamsSchema },
    responses: {
      200: { description: "Task runs", schema: taskRunsListSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof taskIdParamsSchema>;
      const existing = await repo.getTask(params.id);
      if (!existing) {
        return new Response(JSON.stringify({ error: "task_not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      const data = await repo.listTaskRuns(params.id);
      return { data };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: `${TASK_BY_ID_PATH}/activity`,
    operation: readTasks(),
    summary: "List task activity",
    tags: ["tasks", "activity"],
    request: { params: taskIdParamsSchema },
    responses: {
      200: { description: "Task activity", schema: taskActivityListSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof taskIdParamsSchema>;
      const existing = await repo.getTask(params.id);
      if (!existing) {
        return new Response(JSON.stringify({ error: "task_not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      const data = await repo.listTaskActivity(params.id);
      return { data };
    },
  });

  registerTasksGatewayMethods(api, repoOrFactory, gatewayOptions);
}
