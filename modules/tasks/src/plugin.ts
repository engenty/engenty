import {
  capabilitiesForModuleAccess,
  createPluginServerGatewayCaller,
  type EngentyPluginFactory,
  resolveDefaultSpaceId,
  resolveSpaceAgentMount,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tasksAiRegistration } from "../ai/registrar.js";
import { subscribeConnectionsApprovalResume } from "./api/connections-approval-subscriber.js";
import {
  type TasksGatewayOptions,
  taskAssignmentValidator,
} from "./api/gateway-shared.js";
import { registerTasksApi } from "./api/index.js";
import { createCoreGrantsWriter } from "./dal/core-grants.js";
import { createTasksRepoSupabase } from "./dal/supabase.js";

const registerTasksPlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "tasks.viewer",
      title: "Tasks viewer",
      capabilities: capabilitiesForModuleAccess("tasks", "read"),
    },
    {
      id: "tasks.editor",
      title: "Tasks editor",
      capabilities: capabilitiesForModuleAccess("tasks", "write"),
    },
  ]);
  const { server } = engenty;
  // Phase A seam (PLAN-tenant-isolation-a-rls-seam.md): ALL work in this module
  // runs on tenant-locked handles (engenty_server lane, RLS-enforced). There is
  // no service-client path left — the two context-less reads that needed one
  // (webhook lookup by id+secret, boot-time resource replay) went with the
  // triggers surface. A deployment without a tenant handle has no database at
  // all, so that is the only thing worth aborting on.
  const getTenantDb = server.getTenantDb;
  if (!getTenantDb) {
    return;
  }
  const getDb = (auth: { tenantId: string }) =>
    getTenantDb(auth) as SupabaseClient;

  const { invokeOperation } = createPluginServerGatewayCaller(server);
  server.registerAiRegistration(
    tasksAiRegistration({ invokeTasksOperation: invokeOperation })
  );

  // Task activity fan-out to the module event bus (canonical
  // `tasks.task.activity`), enriched with the task's contexts so subscribers
  // (e.g. team-chat's project channels) never reach into module_tasks.
  const emitTaskActivity = async (
    activity: {
      actor_agent_type_key: string | null;
      actor_user_id: string | null;
      event_type: string;
      payload: Record<string, unknown>;
      task_id: string;
    },
    scope: { scopeId: string; tenantId: string }
  ) => {
    const { data } = await getDb({ tenantId: scope.tenantId })
      .schema("module_tasks")
      .from("task_contexts")
      .select("context_type, context_id")
      .eq("task_id", activity.task_id);
    await engenty.events.modules.emit(
      "tasks.task.activity",
      {
        actor_agent_type_key: activity.actor_agent_type_key,
        actor_id: activity.actor_user_id ?? undefined,
        contexts: (data ?? []) as {
          context_id: string;
          context_type: string;
        }[],
        event_type: activity.event_type,
        payload: activity.payload,
        scope_id: scope.scopeId,
        task_id: activity.task_id,
        tenant_id: scope.tenantId,
      },
      { tenantId: scope.tenantId }
    );
  };

  const repoOrFactory = (
    auth: { tenantId: string; scopeId: string },
    recordAuditEvent?: (event: {
      type: string;
      detail?: Record<string, unknown>;
    }) => void
  ) =>
    createTasksRepoSupabase(getDb(auth), auth.tenantId, auth.scopeId, {
      onActivity: emitTaskActivity,
      ...(recordAuditEvent ? { recordAuditEvent } : {}),
    });

  // Queue powers agent-task auto-dispatch (phase 2); without it, tasks assigned
  // to agents sit in `todo` forever — say so loudly instead of skipping silently.
  const queue = server.getQueueService?.() ?? null;
  if (!queue) {
    createLogger({ name: "tasks-plugin" }).warn(
      "queue service unavailable — agent task auto-dispatch disabled"
    );
  }
  // Tool approvals live in core.approval_grants — the ONE grant store. The
  // task-row grant columns this used to dual-write were dropped in
  // 20260803210000; the task DTO's approval_grants fields are hydrated from
  // core on read.
  const coreGrantsFactory = (auth: { tenantId: string }) =>
    createCoreGrantsWriter(getDb(auth), auth.tenantId);
  const resolveSpaceId: NonNullable<
    TasksGatewayOptions["resolveSpaceId"]
  > = async (auth) => {
    const fromAuth = auth.spaceId?.trim();
    if (fromAuth) {
      return fromAuth;
    }
    return resolveDefaultSpaceId(getDb(auth) as never, auth.tenantId);
  };
  const gatewayOptions: TasksGatewayOptions = {
    coreGrantsFactory,
    queue,
    // Checkout workspace bytes: task-row Space, then validated auth Space,
    // then the tenant default only for a true global/legacy run.
    // `as never`: resolveDefaultSpaceId takes a structural client slice, and
    // matching it against SupabaseClient's full generic chain exceeds tsc's
    // instantiation depth (TS2589). The shape is asserted by its own unit test.
    resolveSpaceAgentMount: (input) =>
      resolveSpaceAgentMount(
        getDb({ tenantId: input.tenantId }) as never,
        input
      ),
    resolveSpaceId,
  };
  const validateMountedTaskAssignment = taskAssignmentValidator(gatewayOptions);
  registerTasksApi(server, repoOrFactory, gatewayOptions);

  // Approving a task-linked connections request resumes the blocked task.
  subscribeConnectionsApprovalResume({
    events: engenty.events,
    getDb,
    queue,
    validateAgentAssignment: validateMountedTaskAssignment,
  });
};

export default registerTasksPlugin;
