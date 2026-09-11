import {
  actorUserIdFromAuth,
  createRecordLinker,
  type PluginServerApi,
  type RecordLinkAuth,
  withRecordLink,
  withRecordLinks,
} from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import { validateBlockedBy } from "../domain/task-blockers.js";
import { startsOnCreate } from "../domain/task-lifecycle.js";
import {
  taskCreateInputSchema,
  taskDetailSchema,
  taskIdParamsSchema,
  taskSchema,
  taskSettingsSchema,
  taskSettingsUpdateSchema,
  tasksListQuerySchema,
  tasksPaginatedResponseSchema,
  taskUpdateInputSchema,
} from "../schema/zod.js";
import {
  getRepo,
  type RepoOrFactory,
  resolveAssignmentFallbackSpace,
  type TasksGatewayOptions,
  taskAssignmentValidator,
  tasksDestructiveOp,
  tasksReadOp,
  tasksWriteOp,
  validateAgentAssignment,
} from "./gateway-shared.js";
import { registerTasksWorkflowGatewayMethods } from "./gateway-task-workflow-methods.js";
import {
  TASKS_COLLECTION_SPACE_POLICY,
  TASKS_SETTINGS_SPACE_POLICY,
  tasksRecordSpacePolicy,
} from "./operation-space-policy.js";
import {
  dispatchTaskIfReady,
  wakeBlockedDependents,
} from "./task-dispatch-service.js";

const taskRecordPolicy = tasksRecordSpacePolicy("id");

const taskUpdateOperationInputSchema = taskUpdateInputSchema.extend({
  id: z.string().uuid(),
  actor_agent_type_key: z.string().optional(),
});

export function registerTasksGatewayMethods(
  api: PluginServerApi,
  repoOrFactory: RepoOrFactory,
  options?: TasksGatewayOptions
) {
  // A task lives in its own space; the link follows the record, not the run.
  const link = createRecordLinker(api);
  const taskLink = (
    auth: RecordLinkAuth | undefined,
    task: { id: string; space_id?: string | null }
  ) => link(auth, "tasks", [task.id], task.space_id);

  api.registerOperation({
    operationId: "tasks_list",
    summary: "List tasks",
    ...tasksReadOp(["module.tasks.read"]),
    spacePolicy: TASKS_COLLECTION_SPACE_POLICY,
    inputSchema: tasksListQuerySchema.partial(),
    outputSchema: tasksPaginatedResponseSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const result = await repo.listTasksPaginated(
        tasksListQuerySchema.parse(input ?? {}),
        ctx.auth?.principalId
      );
      return {
        ...result,
        data: await withRecordLinks(result.data, (task) =>
          taskLink(ctx.auth, task)
        ),
      };
    },
  });

  api.registerOperation({
    operationId: "tasks_get",
    summary: "Get task by ID",
    ...tasksReadOp(["module.tasks.read"]),
    spacePolicy: taskRecordPolicy,
    inputSchema: taskIdParamsSchema,
    outputSchema: taskDetailSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const params = taskIdParamsSchema.parse(input);
      const task = await repo.getTask(params.id);
      if (!task) {
        throw new Error("task_not_found");
      }
      return withRecordLink(task, (row) => taskLink(ctx.auth, row));
    },
  });

  api.registerOperation({
    operationId: "tasks_create",
    summary: "Create task",
    ...tasksWriteOp(["module.tasks.write"]),
    spacePolicy: TASKS_COLLECTION_SPACE_POLICY,
    inputSchema: taskCreateInputSchema,
    outputSchema: taskSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = taskCreateInputSchema.parse(input);
      if (parsed.primary_assignee_kind === "agent") {
        const inheritedSpace = (
          parsed.parent_id ? await repo.getTask(parsed.parent_id) : null
        )?.space_id;
        const fallbackSpace =
          !(parsed.space_id || inheritedSpace) && ctx.auth
            ? await resolveAssignmentFallbackSpace(ctx.auth, options)
            : null;
        await validateAgentAssignment(
          {
            agentTypeKey: parsed.primary_assignee_agent_type_key,
            spaceId: parsed.space_id ?? inheritedSpace ?? fallbackSpace,
            tenantId: ctx.auth?.tenantId,
          },
          options
        );
      }
      if (parsed.blocked_by_task_ids?.length) {
        parsed.blocked_by_task_ids = await validateBlockedBy(
          null,
          parsed.blocked_by_task_ids,
          { loadBlockedBy: (id) => repo.getBlockedByIds(id) }
        );
      }
      const task = await repo.createTask(parsed, {
        createdByUserId: actorUserIdFromAuth(ctx.auth),
        actorKind: parsed.created_by_agent_type_key ? "agent" : "user",
      });
      // Creating straight into a resting status means "plan it, don't run it".
      // `isDispatchableTask` alone would still admit `backlog`, which stays
      // checkout-eligible so an existing task can be re-dispatched from there.
      if (options?.queue && ctx.auth?.tenantId && startsOnCreate(task.status)) {
        await dispatchTaskIfReady(
          {
            queue: options.queue,
            repo,
            tenantId: ctx.auth.tenantId,
            validateAgentAssignment: taskAssignmentValidator(options),
          },
          task
        );
      }
      return withRecordLink(task, (row) => taskLink(ctx.auth, row));
    },
  });

  api.registerOperation({
    operationId: "tasks_update",
    summary: "Update task",
    ...tasksWriteOp(["module.tasks.write"]),
    spacePolicy: taskRecordPolicy,
    inputSchema: taskUpdateOperationInputSchema,
    outputSchema: taskSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const raw = input as z.infer<typeof taskUpdateOperationInputSchema>;
      const { id, actor_agent_type_key, ...patch } = raw;
      const existing = await repo.getTask(id);
      if (!existing) {
        throw new Error("task_not_found");
      }
      const nextAssigneeKind =
        patch.primary_assignee_kind ?? existing.primary_assignee_kind;
      const nextAgentTypeKey =
        patch.primary_assignee_agent_type_key === undefined
          ? existing.primary_assignee_agent_type_key
          : patch.primary_assignee_agent_type_key;
      if (
        nextAssigneeKind === "agent" &&
        (patch.primary_assignee_kind !== undefined ||
          patch.primary_assignee_agent_type_key !== undefined ||
          patch.space_id !== undefined)
      ) {
        await validateAgentAssignment(
          {
            agentTypeKey: nextAgentTypeKey,
            spaceId: patch.space_id ?? existing.space_id,
            tenantId: ctx.auth?.tenantId ?? existing.tenant_id,
          },
          options
        );
      }
      if (patch.blocked_by_task_ids !== undefined) {
        patch.blocked_by_task_ids = await validateBlockedBy(
          id,
          patch.blocked_by_task_ids,
          { loadBlockedBy: (bid) => repo.getBlockedByIds(bid) }
        );
      }
      const actorKind = actor_agent_type_key ? "agent" : "user";
      const updated = await repo.updateTask(id, patch, {
        actorKind,
        hasActiveCheckout: !!existing.checkout_run_id,
        actorUserId: actorUserIdFromAuth(ctx.auth),
        actorAgentTypeKey: actor_agent_type_key ?? null,
      });
      if (!updated) {
        throw new Error("task_not_found");
      }
      if (options?.queue && ctx.auth?.tenantId) {
        const deps = {
          queue: options.queue,
          repo,
          tenantId: ctx.auth.tenantId,
          validateAgentAssignment: taskAssignmentValidator(options),
        };
        await dispatchTaskIfReady(deps, updated);
        // A task reaching 'done' can unblock dependents and complete a parent.
        if (updated.status === "done" && existing.status !== "done") {
          await wakeBlockedDependents(deps, updated);
        }
      }
      return withRecordLink(updated, (row) => taskLink(ctx.auth, row));
    },
  });

  api.registerOperation({
    operationId: "tasks_delete",
    summary: "Delete task",
    ...tasksDestructiveOp(["module.tasks.write"]),
    spacePolicy: taskRecordPolicy,
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
    operationId: "tasks_settings_get",
    summary: "Get task module settings",
    ...tasksReadOp(["module.tasks.read"]),
    spacePolicy: TASKS_SETTINGS_SPACE_POLICY,
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
    ...tasksWriteOp(["module.tasks.write"]),
    spacePolicy: TASKS_SETTINGS_SPACE_POLICY,
    inputSchema: taskSettingsUpdateSchema,
    outputSchema: taskSettingsSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      return repo.updateSettings(taskSettingsUpdateSchema.parse(input ?? {}));
    },
  });

  registerTasksWorkflowGatewayMethods(api, repoOrFactory, options);
}
