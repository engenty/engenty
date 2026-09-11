import type { PluginServerApi } from "@engenty/plugin-sdk";
import { actorUserIdFromAuth } from "@engenty/plugin-sdk";
import type { z } from "zod";
import { validateBlockedBy } from "../domain/task-blockers.js";
import { startsOnCreate } from "../domain/task-lifecycle.js";
import { performTaskCheckout } from "../lib/perform-task-checkout.js";
import { TaskCheckoutConflictError } from "../lib/task-checkout-errors.js";
import { buildTasksBriefingResponse } from "../lib/tasks-briefing-service.js";
import {
  notFoundSchema,
  taskActivityListSchema,
  taskCheckoutConflictSchema,
  taskCheckoutInputSchema,
  taskCommentCreateSchema,
  taskCreateInputSchema,
  taskDetailSchema,
  taskIdParamsSchema,
  taskReleaseInputSchema,
  taskRevokeApprovalGrantInputSchema,
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
import { registerTasksGatewayMethods } from "./gateway-methods.js";
import {
  getRepo,
  type RepoOrFactory,
  resolveAssignmentFallbackSpace,
  type TasksGatewayOptions,
  taskAssignmentValidator,
  validateAgentAssignment,
} from "./gateway-shared.js";
import {
  assertHumanApprovalActor,
  resolveTaskToolApproval,
} from "./task-approval-service.js";
import {
  dispatchTaskIfReady,
  wakeBlockedDependents,
} from "./task-dispatch-service.js";
import { runTaskNow } from "./task-run-now-service.js";

const UUID_PARAM =
  "{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}";

export const TASK_BY_ID_PATH = `/api/tasks/:id${UUID_PARAM}`;

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
  // Same grading as the gateway ops (gateway-shared.ts): ordinary writes are
  // medium — `manual` still asks, `auto` passes with the space's write mount.
  const writeTasks = () => ({
    moduleId: "tasks",
    requiredCapabilities: ["module.tasks.write"],
    riskLevel: "medium" as const,
    idempotent: false,
    requiresApproval: true,
  });
  const destructiveTasks = () => ({
    ...writeTasks(),
    riskLevel: "high" as const,
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
      // Derived from the schema so the allow-list cannot drift from what
      // OpenAPI advertises — same rule as the tasks list.
      const parsed = tasksBriefingQuerySchema.parse(
        parseQuery(url, Object.keys(tasksBriefingQuerySchema.shape))
      );
      const mode = parsed.mode ?? "personal";
      return buildTasksBriefingResponse(repo, mode, ctx.auth?.principalId, {
        ...(parsed.space_id ? { spaceId: parsed.space_id } : {}),
      });
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
      // Derived from the schema, not hand-written: the old list silently
      // dropped `project_id`.
      const parsed = tasksListQuerySchema.parse(
        parseQuery(url, Object.keys(tasksListQuerySchema.shape))
      );
      // No space named = every space the caller may see, not every space.
      // A named space was already checked by core's route gate.
      const spaceIds =
        !parsed.space_id && ctx.accessibleSpaceIds
          ? await ctx.accessibleSpaceIds()
          : undefined;
      return repo.listTasksPaginated(
        { ...parsed, ...(spaceIds ? { space_ids: spaceIds } : {}) },
        ctx.auth?.principalId
      );
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
        if (body.primary_assignee_kind === "agent") {
          const inheritedSpace = (
            body.parent_id ? await repo.getTask(body.parent_id) : null
          )?.space_id;
          const fallbackSpace =
            !(body.space_id || inheritedSpace) && ctx.auth
              ? await resolveAssignmentFallbackSpace(ctx.auth, gatewayOptions)
              : null;
          await validateAgentAssignment(
            {
              agentTypeKey: body.primary_assignee_agent_type_key,
              spaceId: body.space_id ?? inheritedSpace ?? fallbackSpace,
              tenantId: ctx.auth?.tenantId,
            },
            gatewayOptions
          );
        }
        if (body.blocked_by_task_ids?.length) {
          body.blocked_by_task_ids = await validateBlockedBy(
            null,
            body.blocked_by_task_ids,
            { loadBlockedBy: (id) => repo.getBlockedByIds(id) }
          );
        }
        const task = await repo.createTask(body, {
          createdByUserId: actorUserIdFromAuth(ctx.auth),
          actorKind: body.created_by_agent_type_key ? "agent" : "user",
        });
        // Agent-assigned tasks auto-dispatch regardless of entry path (REST
        // here mirrors the tasks_create gateway op) — but only when created
        // into a status that means "start it". Creating into a resting status
        // is the caller saying "plan it, don't run it".
        if (
          gatewayOptions?.queue &&
          ctx.auth?.tenantId &&
          startsOnCreate(task.status)
        ) {
          await dispatchTaskIfReady(
            {
              queue: gatewayOptions.queue,
              repo,
              tenantId: ctx.auth.tenantId,
              validateAgentAssignment: taskAssignmentValidator(gatewayOptions),
            },
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
      // Approved tools live in core.approval_grants (subject = task id) since
      // the task-row grant columns were dropped; the detail view is the one
      // read that still wants them split standing vs once.
      if (gatewayOptions?.coreGrantsFactory && ctx.auth) {
        const grants = await gatewayOptions
          .coreGrantsFactory(ctx.auth)
          .listBySubject({ subjectId: params.id })
          .catch(() => null);
        if (grants) {
          task.approval_grants = grants.standing;
          task.approval_grants_once = grants.once;
        }
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
        const nextAssigneeKind =
          body.primary_assignee_kind ?? existing?.primary_assignee_kind;
        const nextAgentTypeKey =
          body.primary_assignee_agent_type_key === undefined
            ? existing?.primary_assignee_agent_type_key
            : body.primary_assignee_agent_type_key;
        if (
          existing &&
          nextAssigneeKind === "agent" &&
          (body.primary_assignee_kind !== undefined ||
            body.primary_assignee_agent_type_key !== undefined ||
            body.space_id !== undefined)
        ) {
          await validateAgentAssignment(
            {
              agentTypeKey: nextAgentTypeKey,
              spaceId: body.space_id ?? existing.space_id,
              tenantId: ctx.auth?.tenantId ?? existing.tenant_id,
            },
            gatewayOptions
          );
        }
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
          actorUserId: actorUserIdFromAuth(ctx.auth),
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
            validateAgentAssignment: taskAssignmentValidator(gatewayOptions),
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
    operation: destructiveTasks(),
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
        createdByUserId: actorUserIdFromAuth(ctx.auth),
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
        const existing = await repo.getTask(params.id);
        if (!existing) {
          throw new Error("task_not_found");
        }
        await validateAgentAssignment(
          {
            agentTypeKey: body.agent_type_key,
            spaceId: existing.space_id,
            tenantId: ctx.auth?.tenantId ?? existing.tenant_id,
          },
          gatewayOptions
        );
        const task = await performTaskCheckout(
          {
            repo,
            spaceId: ctx.auth
              ? await gatewayOptions
                  ?.resolveSpaceId?.(ctx.auth)
                  .catch(() => null)
              : null,
            storage: api.getStorageService?.("files") ?? null,
            tenantId: ctx.auth?.tenantId ?? "",
          },
          params.id,
          body,
          {
            actorUserId: actorUserIdFromAuth(ctx.auth),
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
          actorUserId: actorUserIdFromAuth(ctx.auth),
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
            actorUserId: actorUserIdFromAuth(ctx.auth),
            queue: gatewayOptions?.queue ?? null,
            repo,
            tenantId: ctx.auth?.tenantId ?? null,
            validateAgentAssignment: taskAssignmentValidator(gatewayOptions),
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
      try {
        assertHumanApprovalActor(ctx.auth);
        const task = await resolveTaskToolApproval(
          {
            actorUserId: actorUserIdFromAuth(ctx.auth),
            coreGrants:
              gatewayOptions?.coreGrantsFactory && ctx.auth
                ? gatewayOptions.coreGrantsFactory(ctx.auth)
                : null,
            queue: gatewayOptions?.queue ?? null,
            tasksRepo: repo,
            tenantId: ctx.auth?.tenantId ?? null,
            validateAgentAssignment: taskAssignmentValidator(gatewayOptions),
          },
          {
            decision: body.decision,
            operationId: body.operation_id,
            operationIds: body.operation_ids,
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
    method: "post",
    path: `${TASK_BY_ID_PATH}/approval-grants/revoke`,
    operation: writeTasks(),
    summary: "Revoke an approved tool from a task",
    tags: ["tasks", "approvals"],
    request: {
      params: taskIdParamsSchema,
      body: taskRevokeApprovalGrantInputSchema,
    },
    responses: {
      200: { description: "Revoked", schema: taskSchema },
      404: { description: "Not found", schema: notFoundSchema },
    },
    handler: async (ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = ctx.params as z.infer<typeof taskIdParamsSchema>;
      const body = taskRevokeApprovalGrantInputSchema.parse(ctx.body ?? {});
      const task = await repo.getTask(params.id);
      if (!task) {
        return new Response(JSON.stringify({ error: "task_not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      if (gatewayOptions?.coreGrantsFactory && ctx.auth) {
        const coreGrants = gatewayOptions.coreGrantsFactory(ctx.auth);
        await coreGrants.revoke({
          operationId: body.operation_id,
          subjectId: params.id,
        });
        const grants = await coreGrants
          .listBySubject({ subjectId: params.id })
          .catch(() => null);
        if (grants) {
          task.approval_grants = grants.standing;
          task.approval_grants_once = grants.once;
        }
      }
      return task;
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
