import {
  createPluginServerGatewayCaller,
  type EngentyPluginFactory,
} from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tasksAiRegistration } from "../ai/registrar.js";
import { registerTasksApi } from "./api/index.js";
import { createTriggerEventSubscriber } from "./api/trigger-event-subscriber.js";
import {
  createTriggersRepoFactory,
  registerTriggerGatewayMethods,
} from "./api/trigger-gateway-methods.js";
import { registerTriggerWebhookRoute } from "./api/trigger-webhook-route.js";
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
      recordAuditEvent ? { recordAuditEvent } : undefined
    );

  // Queue powers agent-task auto-dispatch (phase 2); without it, tasks assigned
  // to agents sit in `todo` forever — say so loudly instead of skipping silently.
  const queue = server.getQueueService?.() ?? null;
  if (!queue) {
    createLogger({ name: "tasks-plugin" }).warn(
      "queue service unavailable — agent task auto-dispatch disabled"
    );
  }
  registerTasksApi(server, repoOrFactory, { queue });

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

  registerTriggerGatewayMethods(
    server,
    createTriggersRepoFactory(supabase as SupabaseClient),
    {
      onEventResourceAdded: eventSubscriber.ensureSubscribed,
      queue,
      supabase: supabase as SupabaseClient,
    }
  );
};

export default registerTasksPlugin;
