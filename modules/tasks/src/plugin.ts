import {
  createPluginServerGatewayCaller,
  type EngentyPluginFactory,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tasksAiRegistration } from "../ai/registrar.js";
import { subscribeConnectionsApprovalResume } from "./api/connections-approval-subscriber.js";
import { registerTasksApi } from "./api/index.js";
import { createTriggerEventSubscriber } from "./api/trigger-event-subscriber.js";
import {
  createTriggersRepoFactory,
  registerTriggerGatewayMethods,
} from "./api/trigger-gateway-methods.js";
import { registerTriggerWebhookRoute } from "./api/trigger-webhook-route.js";
import { createCoreGrantsWriter } from "./dal/core-grants.js";
import { createTasksRepoSupabase } from "./dal/supabase.js";

const registerTasksPlugin: EngentyPluginFactory = (engenty) => {
  // Phase 5 — role bundles (named capability bundles assignable to users/agents).
  engenty.server.registerRoleProfiles([
    {
      id: "tasks.viewer",
      title: "Tasks viewer",
      capabilities: ["module.tasks.read"],
    },
    {
      id: "tasks.editor",
      title: "Tasks editor",
      capabilities: [
        "module.tasks.read",
        "module.tasks.write",
        "module.goals.read",
        "module.goals.write",
      ],
    },
  ]);
  const { server } = engenty;
  const supabase = server.getDatabaseAdapter?.() ?? null;
  if (!supabase) {
    return;
  }

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
    const { data } = await (supabase as SupabaseClient)
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
    createTasksRepoSupabase(
      supabase as SupabaseClient,
      auth.tenantId,
      auth.scopeId,
      {
        onActivity: emitTaskActivity,
        ...(recordAuditEvent ? { recordAuditEvent } : {}),
      }
    );

  // Queue powers agent-task auto-dispatch (phase 2); without it, tasks assigned
  // to agents sit in `todo` forever — say so loudly instead of skipping silently.
  const queue = server.getQueueService?.() ?? null;
  if (!queue) {
    createLogger({ name: "tasks-plugin" }).warn(
      "queue service unavailable — agent task auto-dispatch disabled"
    );
  }
  const triggersRepoFactory = createTriggersRepoFactory(
    supabase as SupabaseClient
  );
  // Tool approvals dual-write: the task-row grant columns stay the run
  // transport, while core.approval_grants is what core-side gates spend.
  const coreGrantsFactory = (auth: { tenantId: string }) =>
    createCoreGrantsWriter(supabase as SupabaseClient, auth.tenantId);
  registerTasksApi(server, repoOrFactory, {
    coreGrantsFactory,
    queue,
    triggersRepoFactory,
  });

  // Event-trigger ingestion edges: the in-process module event bus and the
  // public webhook route. Bus subscriptions are exact-name, replayed from the
  // database — DEFERRED off the boot path (awaiting module capabilities during
  // createApp deadlocks the loader).
  const eventSubscriber = createTriggerEventSubscriber({
    events: engenty.events,
    queue,
    supabase: supabase as SupabaseClient,
  });
  setTimeout(() => {
    eventSubscriber.replayFromDatabase().catch((error: unknown) => {
      createLogger({ name: "tasks-plugin" }).warn(
        "event trigger subscription replay failed",
        { message: error instanceof Error ? error.message : String(error) }
      );
    });
  }, 3000);
  registerTriggerWebhookRoute(server, {
    queue,
    supabase: supabase as SupabaseClient,
  });

  // Approving a task-linked connections request resumes the blocked task.
  subscribeConnectionsApprovalResume({
    events: engenty.events,
    queue,
    supabase: supabase as SupabaseClient,
  });

  registerTriggerGatewayMethods(server, triggersRepoFactory, {
    onEventResourceAdded: eventSubscriber.ensureSubscribed,
    queue,
    supabase: supabase as SupabaseClient,
  });
};

export default registerTasksPlugin;
