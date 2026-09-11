import { actorUserIdFromAuth, type PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import { performTaskCheckout } from "../lib/perform-task-checkout.js";
import { TaskCheckoutConflictError } from "../lib/task-checkout-errors.js";
import {
  taskActivityListSchema,
  taskAddCommentOperationInputSchema,
  taskCheckoutInputRawSchema,
  taskCheckoutInputSchema,
  taskClearOnceApprovalsInputSchema,
  taskCommentSchema,
  taskIdParamsSchema,
  taskReleaseInputRawSchema,
  taskReleaseInputSchema,
  taskRunNowResponseSchema,
  taskRunsListSchema,
  taskSchema,
  taskToolApprovalInputSchema,
} from "../schema/zod.js";
import {
  getRepo,
  type RepoOrFactory,
  type TasksGatewayOptions,
  taskAssignmentValidator,
  tasksReadOp,
  tasksWriteOp,
  validateAgentAssignment,
} from "./gateway-shared.js";
import {
  TASKS_COLLECTION_SPACE_POLICY,
  tasksRecordSpacePolicy,
} from "./operation-space-policy.js";
import {
  assertHumanApprovalActor,
  resolveTaskToolApproval,
} from "./task-approval-service.js";
import { reapStaleCheckouts } from "./task-reaper-service.js";
import { runTaskNow } from "./task-run-now-service.js";

const taskRecordPolicy = tasksRecordSpacePolicy("id");

const reapStaleCheckoutsInputSchema = z.object({
  space_id: z.string().uuid().optional(),
});

export function registerTasksWorkflowGatewayMethods(
  api: PluginServerApi,
  repoOrFactory: RepoOrFactory,
  options?: TasksGatewayOptions
) {
  api.registerOperation({
    operationId: "tasks_resolve_tool_approval",
    summary: "Approve or deny a pending tool approval on a task",
    // This op IS the human approval act; it must not itself require approval.
    ...tasksWriteOp(["module.tasks.write"]),
    spacePolicy: taskRecordPolicy,
    requiresApproval: false,
    inputSchema: taskToolApprovalInputSchema,
    outputSchema: taskSchema,
    handler: async (input, ctx) => {
      assertHumanApprovalActor(ctx.auth);
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = taskToolApprovalInputSchema.parse(input);
      return resolveTaskToolApproval(
        {
          actorUserId: actorUserIdFromAuth(ctx.auth),
          coreGrants:
            options?.coreGrantsFactory && ctx.auth
              ? options.coreGrantsFactory(ctx.auth)
              : null,
          queue: options?.queue ?? null,
          tasksRepo: repo,
          tenantId: ctx.auth?.tenantId ?? null,
          validateAgentAssignment: taskAssignmentValidator(options),
        },
        {
          decision: parsed.decision,
          operationId: parsed.operation_id,
          operationIds: parsed.operation_ids,
          scope: parsed.scope,
          taskId: parsed.id,
        }
      );
    },
  });

  api.registerOperation({
    operationId: "tasks_approval_grants_effective",
    summary: "Effective tool-approval grant set for a task's next run",
    ...tasksReadOp(["module.tasks.read"]),
    spacePolicy: taskRecordPolicy,
    inputSchema: taskClearOnceApprovalsInputSchema,
    outputSchema: z.object({ approval_grants: z.array(z.string()) }),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = taskClearOnceApprovalsInputSchema.parse(input);
      const task = await repo.getTask(parsed.id);
      if (!task) {
        throw new Error("task_not_found");
      }
      // core.approval_grants is the ONE grant store, and the task is the ONE
      // subject: a run that has this task as its subject carries no other
      // grantable identity. Anything a routine may do without asking is
      // granted on the routine and resolved there, not here.
      const coreGrants =
        options?.coreGrantsFactory && ctx.auth
          ? options.coreGrantsFactory(ctx.auth)
          : null;
      const fromCore =
        (await coreGrants?.listOperationIds({ subjectIds: [parsed.id] })) ?? [];
      return { approval_grants: [...new Set(fromCore)] };
    },
  });

  api.registerOperation({
    operationId: "tasks_clear_once_approvals",
    summary: "Clear a task's one-shot tool-approval grants",
    ...tasksWriteOp(["module.tasks.write"]),
    spacePolicy: taskRecordPolicy,
    requiresApproval: false,
    inputSchema: taskClearOnceApprovalsInputSchema,
    outputSchema: z.object({ ok: z.boolean() }),
    handler: async (input, ctx) => {
      const parsed = taskClearOnceApprovalsInputSchema.parse(input);
      // The core once-rows outlive dispatch on purpose (a core-side gate
      // spends them DURING the run); this call, after the run, is what ends
      // the ones nobody spent.
      if (options?.coreGrantsFactory && ctx.auth) {
        await options.coreGrantsFactory(ctx.auth).revokeOnce({
          subjectId: parsed.id,
        });
      }
      return { ok: true };
    },
  });

  api.registerOperation({
    operationId: "tasks_reap_stale_checkouts",
    summary: "Release checkouts whose backing run is dead",
    // Maintenance/liveness op run by the coordinator heartbeat: it only ever
    // releases checkouts of dead runs (live runs are never touched), so it is
    // safe, idempotent, and must run headless without an approval pause.
    ...tasksWriteOp(["module.tasks.write"]),
    spacePolicy: TASKS_COLLECTION_SPACE_POLICY,
    riskLevel: "low" as const,
    requiresApproval: false,
    inputSchema: reapStaleCheckoutsInputSchema,
    outputSchema: z.object({
      checked: z.number().int(),
      reaped: z.array(
        z.object({
          id: z.string(),
          identifier: z.string().nullable(),
          run_id: z.string(),
        })
      ),
    }),
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = reapStaleCheckoutsInputSchema.parse(input ?? {});
      return reapStaleCheckouts({
        queue: options?.queue ?? null,
        repo,
        spaceId: parsed.space_id,
        tenantId: ctx.auth?.tenantId ?? null,
        validateAgentAssignment: taskAssignmentValidator(options),
      });
    },
  });

  api.registerOperation({
    operationId: "tasks_run_now",
    summary: "Queue an agent run for this task now",
    // The human pressing "work on this task" IS the authorization; gating it
    // behind a second approval would ask them to approve their own click.
    ...tasksWriteOp(["module.tasks.write"]),
    spacePolicy: taskRecordPolicy,
    riskLevel: "low" as const,
    requiresApproval: false,
    inputSchema: taskIdParamsSchema,
    outputSchema: taskRunNowResponseSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = taskIdParamsSchema.parse(input);
      return runTaskNow(
        {
          actorUserId: actorUserIdFromAuth(ctx.auth),
          queue: options?.queue ?? null,
          repo,
          tenantId: ctx.auth?.tenantId ?? null,
          validateAgentAssignment: taskAssignmentValidator(options),
        },
        { taskId: parsed.id }
      );
    },
  });

  api.registerOperation({
    operationId: "tasks_add_comment",
    summary: "Add task comment",
    // Commenting is how an agent reports progress and asks for input; it is
    // additive, reversible and low-risk, so it must never sit behind approval.
    ...tasksWriteOp(["module.tasks.write"]),
    spacePolicy: taskRecordPolicy,
    riskLevel: "low" as const,
    requiresApproval: false,
    inputSchema: taskAddCommentOperationInputSchema,
    outputSchema: taskCommentSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const raw = input as z.infer<typeof taskAddCommentOperationInputSchema>;
      const { id, content, created_by_agent_type_key, kind, metadata } = raw;
      const existing = await repo.getTask(id);
      if (!existing) {
        throw new Error("task_not_found");
      }
      return repo.addComment(id, content, {
        ...(kind ? { kind } : {}),
        ...(metadata ? { metadata } : {}),
        ...(created_by_agent_type_key
          ? {
              createdByAgentTypeKey: created_by_agent_type_key,
              createdByUserId: null,
            }
          : { createdByUserId: actorUserIdFromAuth(ctx.auth) }),
      });
    },
  });

  api.registerOperation({
    operationId: "tasks_checkout",
    summary: "Checkout task for agent work",
    ...tasksWriteOp(["module.tasks.write"]),
    spacePolicy: taskRecordPolicy,
    inputSchema: taskCheckoutInputRawSchema.extend({ id: z.string().uuid() }),
    outputSchema: taskSchema,
    handler: async (input, ctx) => {
      const repo = getRepo(repoOrFactory, ctx.auth, ctx.recordAuditEvent);
      const parsed = taskCheckoutInputSchema.parse(input);
      const id = (input as { id: string }).id;
      try {
        const existing = await repo.getTask(id);
        if (!existing) {
          throw new Error("task_not_found");
        }
        await validateAgentAssignment(
          {
            agentTypeKey: parsed.agent_type_key,
            spaceId: existing.space_id,
            tenantId: ctx.auth?.tenantId ?? existing.tenant_id,
          },
          options
        );
        return await performTaskCheckout(
          {
            repo,
            spaceId: ctx.auth
              ? await options?.resolveSpaceId?.(ctx.auth).catch(() => null)
              : null,
            storage: api.getStorageService?.("files") ?? null,
            tenantId: ctx.auth?.tenantId ?? "",
          },
          id,
          parsed,
          {
            actorUserId: actorUserIdFromAuth(ctx.auth),
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
    ...tasksWriteOp(["module.tasks.write"]),
    spacePolicy: taskRecordPolicy,
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
        actorUserId: actorUserIdFromAuth(ctx.auth),
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
    ...tasksReadOp(["module.tasks.read"]),
    spacePolicy: taskRecordPolicy,
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
    ...tasksReadOp(["module.tasks.read"]),
    spacePolicy: taskRecordPolicy,
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
}
