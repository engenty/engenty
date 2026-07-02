import type {
  AiUsageStore,
  DynamicAiModuleCapabilityLoader,
} from "@engenty/ai-core";
import { isEngentyCorsOriginAllowed } from "@engenty/environment";
import {
  createPluginEventsRuntime,
  createSearchIndexHost,
  type PluginEventsApi,
} from "@engenty/plugin-sdk";
import { createQueueService, type QueueService } from "@engenty/queue";
import {
  createSearchIndexRegistry,
  type SearchIndexRegistry,
} from "@engenty/search-index";
import { createLogger } from "@engenty/telemetry";
import {
  type HonoBindings,
  type HonoVariables,
  MastraServer,
} from "@mastra/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { mastra } from "../ai/index.js";
import { engentyToolsRunAls } from "../ai/tools/engenty-tools/lib/run-context.js";
import type { ExternalChannelConfig } from "./ai/channels.js";
import {
  createActionRequestStoreFromEnv,
  createAgentRunStoreFromEnv,
  createAgentSessionStoreFromEnv,
  createAiChatSearchStoreFromEnv,
  createAiService,
  createAiUsageStoreFromEnv,
  createDefaultAiRegistry,
  createDefaultModuleCapabilityLoader,
  createTenantModelConfigResolverFromEnv,
} from "./ai/index.js";
import { registerActionRoutes } from "./api/action-routes.js";
import { registerAgentRunRoutes } from "./api/agent-run-routes.js";
import { registerAgentSessionRunRoutes } from "./api/agent-session-runs-routes.js";
import { registerAgentSessionRoutes } from "./api/agent-sessions-routes.js";
import { registerAudioTranscriptionRoutes } from "./api/audio-transcription-routes.js";
import {
  createAgUiDebugEventBus,
  registerCopilotKitDebugEventRoutes,
} from "./api/copilotkit-debug-events.js";
import { registerDispatchRoutes } from "./api/dispatch-routes.js";
import {
  isGatewayModelStore,
  registerGatewayModelRoutes,
} from "./api/gateway-model-routes.js";
import { type AiScopeResolver, createCoreAiScopeResolver } from "./api/http.js";
import { registerInstructionRoutes } from "./api/instruction-routes.js";
import {
  type RealtimeClientSecretFetch,
  type RealtimeVoiceConfigResolver,
  registerRealtimeSessionRoutes,
} from "./api/realtime-session-routes.js";
import { registerRealtimeToolRoutes } from "./api/realtime-tool-routes.js";
import { registerRegistryRoutes } from "./api/registry-routes.js";
import { registerSandboxRoutes } from "./api/sandbox-routes.js";
import { registerAppsAiSearchIndexRoutes } from "./api/search-index-routes.js";
import { registerSkillsRoutes } from "./api/skills-routes.js";
import { startTaskDispatchConsumer } from "./api/task-dispatch-consumer.js";
import { registerTriggerRoutes } from "./api/trigger-routes.js";
import { registerUsageRoutes } from "./api/usage-routes.js";
import { registerWorkspaceRoutes } from "./api/workspace-routes.js";
import { AI_BASE_PATH } from "./config/constants.js";
import type {
  AgentRunStore,
  AgentSessionStore,
} from "./dal/agent-sessions/index.js";
import { createApiCatalogSearchStore } from "./dal/api-catalog/api-catalog-search-store.js";
import type { AiChatSearchStore } from "./dal/chat-search/index.js";
import { seedAiUsageModelPricing } from "./dal/usage/index.js";
import {
  bootstrapGatewayModelsIfEmpty,
  startGatewayModelSyncScheduler,
} from "./gateway-model-sync-scheduler.js";
import { setAiSearchIndexRegistry } from "./runtime/ai-search-runtime.js";

const logger = createLogger({ name: "apps/ai" });

// Shared queue reference: populated by the task dispatch consumer startup,
// consumed by the dispatch status route (returns null / unconfigured until then).
let dispatchQueueService: QueueService | null = null;

/**
 * Hono app with AI service routes under {@link AI_BASE_PATH} (default `/ai`).
 */
export interface CreateAppOptions {
  agentRunStore?: AgentRunStore | null;
  agentSessionStore?: AgentSessionStore | null;
  chatSearchStore?: AiChatSearchStore | null;
  coreBaseUrl?: string;
  coreFetch?: typeof fetch;
  disableGatewayModelScheduler?: boolean;
  disableTaskDispatch?: boolean;
  events?: PluginEventsApi;
  externalChannelsConfig?: ExternalChannelConfig;
  moduleCapabilityLoader?: DynamicAiModuleCapabilityLoader | null;
  openAiRealtimeApiKey?: () => string | null;
  openAiRealtimeFetch?: RealtimeClientSecretFetch;
  realtimeVoiceConfigResolver?: RealtimeVoiceConfigResolver | null;
  registryStore?: any | null;
  scopeResolver?: AiScopeResolver;
  searchIndexRegistry?: SearchIndexRegistry;
  usageStore?: AiUsageStore | null;
}

// Canonical entity event payload for chat-session lifecycle. Subscribers
// (chat-search re-index, telemetry) read this without per-route knowledge.
export interface AiChatSessionEventPayload {
  tenant_id: string;
  thread_id: string;
  user_id: string;
}

// Conventional `<module>.<entity>.{created,updated,deleted}` event names.
// Routes/harness emit `ai.chat_session.updated` after every persistence write
// today; create/delete events are reserved for the upcoming burn-down PR.
export const AI_CHAT_SESSION_UPDATED_EVENT = "ai.chat_session.updated" as const;
export const AI_CHAT_SESSION_DELETED_EVENT = "ai.chat_session.deleted" as const;

export async function createApp(options: CreateAppOptions = {}) {
  // Unit tests boot createApp() without live backing services; skip background
  // tasks that perform real DB/gateway I/O (startup sweep, gateway model sync,
  // task dispatch) so they don't hang on unreachable services. The same tasks
  // are also skipped when a store is injected via options (see below).
  const skipBackgroundTasks = process.env.VITEST === "true";
  const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();

  /**
   * Mastra Studio runs on another origin (e.g. `http://localhost:3000`) while this API
   * listens on `127.0.0.1:8790` — browsers require CORS for those fetches.
   */
  app.use(
    "*",
    cors({
      allowHeaders: [
        "Accept",
        "Authorization",
        "Content-Type",
        "x-mastra-client-type",
      ],
      allowMethods: [
        "DELETE",
        "GET",
        "HEAD",
        "OPTIONS",
        "PATCH",
        "POST",
        "PUT",
      ],
      /**
       * Mastra Studio sends cross-origin requests with `credentials: "include"`.
       * Scope still comes from Authorization where required; this only lets the browser accept
       * credentialed preflights from ENGENTY_CORS_ORIGINS (see pnpm dev:urls:portless).
       */
      credentials: true,
      maxAge: 86_400,
      origin: (origin) => {
        if (!origin) {
          return null;
        }
        return isEngentyCorsOriginAllowed(origin) ? origin : null;
      },
    })
  );
  app.use(`${AI_BASE_PATH}/*`, async (c, next) => {
    const userAccessToken = parseBearerToken(c.req.header("authorization"));
    if (!userAccessToken) {
      return next();
    }
    return engentyToolsRunAls.run({ userAccessToken }, next);
  });

  app.get(`${AI_BASE_PATH}/health`, (c) =>
    c.json({
      ok: true,
      service: "@engenty/ai",
    })
  );

  const agentSessionStore =
    "agentSessionStore" in options
      ? options.agentSessionStore
      : createAgentSessionStoreFromEnv();
  const agentRunStore =
    "agentRunStore" in options
      ? options.agentRunStore
      : createAgentRunStoreFromEnv();
  const actionRequestStore = createActionRequestStoreFromEnv();
  if (agentSessionStore) {
    logger.info("agent session store ready", { schema: "ai" });
  } else if (!("agentSessionStore" in options)) {
    logger.warn(
      "agent session store unavailable — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  if (agentRunStore) {
    logger.info("agent run store ready", { schema: "ai" });
    // D6: startup sweep — any run still "running" from a previous process cannot
    // be live. Mark as failed so clients never wait on a zombie run.
    if (!skipBackgroundTasks) {
      agentRunStore.sweepStalledRuns?.().catch((err: unknown) => {
        logger.warn("startup sweep failed", { error: String(err) });
      });
    }
  }
  const chatSearchStore =
    "chatSearchStore" in options
      ? options.chatSearchStore
      : createAiChatSearchStoreFromEnv();
  const aiUsageStore =
    "usageStore" in options ? options.usageStore : createAiUsageStoreFromEnv();
  const registryStore =
    "registryStore" in options
      ? options.registryStore
      : (await import("./ai/index.js")).createRegistryStoreFromEnv();
  const moduleCapabilityLoader =
    "moduleCapabilityLoader" in options
      ? (options.moduleCapabilityLoader ?? undefined)
      : createDefaultModuleCapabilityLoader();
  if (aiUsageStore && !("usageStore" in options)) {
    try {
      const seeded = await seedAiUsageModelPricing(aiUsageStore);
      if (seeded.inserted > 0) {
        logger.info("AI model pricing seeded", { inserted: seeded.inserted });
      }
    } catch (err) {
      logger.warn("AI model pricing seed skipped", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const aiService = createAiService({
    mastra,
    getRunStore: () => agentRunStore,
    getStore: () => agentSessionStore,
    getUsageStore: () => aiUsageStore,
    resolveTenantModelConfig:
      createTenantModelConfigResolverFromEnv() ?? undefined,
    createRegistry: (scope) =>
      createDefaultAiRegistry({
        databaseStore: registryStore,
        moduleLoader: moduleCapabilityLoader,
        tenantId: scope.tenantId,
      }),
  });
  const baseScopeResolver =
    options.scopeResolver ?? createCoreAiScopeResolver();
  const scopeResolver: AiScopeResolver = async (input) => {
    const resolved = await baseScopeResolver(input);
    if (resolved.ok) {
      return resolved;
    }

    if (input.threadId && agentSessionStore) {
      try {
        const session = await agentSessionStore.getSessionGlobally({
          threadId: input.threadId,
        });
        if (session?.agent_id.startsWith("chatbot.")) {
          return {
            ok: true,
            scope: {
              isSuperAdmin: false,
              isTenantAdmin: false,
              tenantRole: "member",
              tenantId: session.tenant_id,
              userId: session.created_by_user_id,
            },
          };
        }
      } catch (err) {
        logger.warn("failed to lookup chatbot thread for guest auth", {
          err,
          threadId: input.threadId,
        });
      }
    }

    return resolved;
  };

  // Plugin-events runtime + search-index registry wire chat-search through
  // the unified `SearchIndexProvider` contract. Routes emit canonical
  // `ai.chat_session.*` events after each persistence write; a single
  // subscriber translates them into `provider.refreshSession` calls.
  // `apps/ai` runs out-of-process from `apps/core`, so the registry is local
  // to this app — providers are visible to in-process consumers (the Mastra
  // chat-session-search tool, the upcoming `/ai/search-index/*` admin
  // surface) and not yet to the `/api/search-index/*` admin surface in
  // `apps/core`. Cross-process registration is a follow-up.
  const eventsRuntime = createPluginEventsRuntime({
    bridgeModuleEventsToAutomationHooks: false,
    pluginId: "apps/ai",
  });
  const eventsApi = options.events ?? eventsRuntime.api;
  const agUiDebugEvents = createAgUiDebugEventBus();
  registerCopilotKitDebugEventRoutes(app, { bus: agUiDebugEvents });
  const searchIndexRegistry =
    options.searchIndexRegistry ?? createSearchIndexRegistry();
  // Expose the registry to in-process consumers (Mastra `chatSessionSearch`
  // tool resolves `ai_chat_search` here instead of going through HTTP).
  setAiSearchIndexRegistry(searchIndexRegistry);
  const registerSearchIndexProvider = createSearchIndexHost({
    events: eventsApi,
    registry: searchIndexRegistry,
  });
  if (chatSearchStore) {
    registerSearchIndexProvider(chatSearchStore, {
      capabilities: chatSearchStore.capabilities,
      entityName: "chat_session",
      moduleId: "ai",
      // No declarative `onEvents`; chat-search rebuilds the entire session
      // (one session doc + one doc per message) on any persistence write,
      // which the per-doc bindings cannot express. The custom subscriber
      // below handles `ai.chat_session.updated` / `.deleted` instead.
      skipAutoTool: true,
    });
    eventsApi.modules.on<AiChatSessionEventPayload>(
      AI_CHAT_SESSION_UPDATED_EVENT,
      async (payload) => {
        try {
          await chatSearchStore.refreshSession({
            thread_id: payload.thread_id,
            tenant_id: payload.tenant_id,
            user_id: payload.user_id,
          });
        } catch (err) {
          logger.warn("chat search refresh skipped after session.updated", {
            err,
            thread_id: payload.thread_id,
            tenant_id: payload.tenant_id,
            user_id: payload.user_id,
          });
        }
      }
    );
    eventsApi.modules.on<AiChatSessionEventPayload>(
      AI_CHAT_SESSION_DELETED_EVENT,
      async (payload) => {
        // FK cascade on `agent_chat_search_document.thread_id` already
        // removes session/message docs at the DB layer when the session row
        // is deleted; this listener is reserved for follow-up wiring (e.g.
        // partial deletes, cross-store cleanup) so the event surface is
        // already present when those land.
        logger.debug("chat search session.deleted observed", {
          thread_id: payload.thread_id,
          tenant_id: payload.tenant_id,
          user_id: payload.user_id,
        });
      }
    );
  }

  // `core_api_catalog` proxy: the real provider lives in apps/core (it
  // owns the plugin registry + tenant-override gating). Register a thin
  // store here so in-process consumers — most importantly the
  // `engenty_tools_search` Mastra tool — can call `provider.search(...)`
  // through the same `SearchIndexRegistry` they use for `ai_chat_search`,
  // instead of forking their own HTTP path.
  searchIndexRegistry.register(createApiCatalogSearchStore(), {
    capabilities: { hybrid: true, lexical: true, semantic: true },
    entityName: "api_catalog",
    isSystem: false,
    moduleId: "core",
  });

  // Event-emitting hook the routes / channel dispatcher call after every
  // session-scoped persistence write. Replaces the previous direct
  // `chatSearchStore.refreshSession` call.
  const emitChatSessionUpdated = async (params: {
    threadId: string;
    tenantId: string;
    userId: string;
  }) => {
    await eventsApi.modules.emit<AiChatSessionEventPayload>(
      AI_CHAT_SESSION_UPDATED_EVENT,
      {
        thread_id: params.threadId,
        tenant_id: params.tenantId,
        user_id: params.userId,
      },
      { tenantId: params.tenantId }
    );
  };
  registerAgentSessionRoutes(app, {
    getUsageStore: () => aiUsageStore,
    aiService,
    onSessionPersisted: emitChatSessionUpdated,
    scopeResolver,
  });
  registerAgentSessionRunRoutes(app, {
    // Registry + store for the streaming chat runtimes (harness_session default,
    // conversation executor).
    createRegistry: (scope) =>
      createDefaultAiRegistry({
        databaseStore: registryStore,
        moduleLoader: moduleCapabilityLoader,
        tenantId: scope.tenantId,
      }),
    debugEvents: agUiDebugEvents,
    getRunStore: () => agentRunStore,
    getStore: () => agentSessionStore ?? null,
    getUsageStore: () => aiUsageStore ?? null,
    aiService,
    onSessionPersisted: emitChatSessionUpdated,
    scopeResolver,
  });
  registerAgentRunRoutes(app, {
    getRunStore: () => agentRunStore,
    aiService,
    scopeResolver,
  });

  registerSandboxRoutes(app, {
    getRunStore: () => agentRunStore,
    getSessionStore: () => agentSessionStore,
    scopeResolver,
  });
  registerAudioTranscriptionRoutes(app, { scopeResolver });
  registerRealtimeSessionRoutes(app, {
    openAiApiKey: options.openAiRealtimeApiKey,
    openAiFetch: options.openAiRealtimeFetch,
    realtimeVoiceConfig: options.realtimeVoiceConfigResolver ?? null,
    scopeResolver,
  });
  registerRealtimeToolRoutes(app, {
    coreBaseUrl: options.coreBaseUrl,
    coreFetch: options.coreFetch,
    getSessionStore: () => agentSessionStore ?? null,
    scopeResolver,
  });
  // Per-user `/ai/v1/search-index/*` surface — backed by the local
  // `SearchIndexRegistry`, scoped to the caller's tenant/user, and used
  // by the apps/ui dev-settings panel and the engenty-copilot session
  // sidebar to manage their own indexed content. Mirrors the shape of
  // core's admin `/api/search-index/*` surface.
  registerAppsAiSearchIndexRoutes(app, {
    resolveRegistry: () => searchIndexRegistry,
    scopeResolver,
  });
  registerUsageRoutes(app, {
    getUsageStore: () => aiUsageStore ?? null,
    getGatewayModelStore: () =>
      isGatewayModelStore(aiUsageStore) ? aiUsageStore : null,
    scopeResolver,
  });
  registerRegistryRoutes(app, {
    getRegistry: (tenantId) =>
      createDefaultAiRegistry({
        databaseStore: registryStore,
        moduleLoader: moduleCapabilityLoader,
        tenantId,
      }),
    getStore: () => registryStore ?? null,
    moduleLoader: moduleCapabilityLoader,
    scopeResolver,
  });
  registerActionRoutes(app, {
    getActionRequestStore: () => actionRequestStore,
    moduleLoader: moduleCapabilityLoader,
    scopeResolver,
  });
  registerSkillsRoutes(app, { scopeResolver });
  registerWorkspaceRoutes(app, {
    getRegistry: (tenantId) =>
      createDefaultAiRegistry({
        databaseStore: registryStore,
        moduleLoader: moduleCapabilityLoader,
        tenantId,
      }),
    getStore: () => registryStore ?? null,
    scopeResolver,
  });
  {
    const { createAiDatabaseAdapter } = await import("./infra/database.js");
    const actionDb = createAiDatabaseAdapter();
    {
      const { createInstructionOverridesStore } = await import(
        "./dal/instructions/instruction-overrides-store.js"
      );
      const instructionStore = actionDb
        ? createInstructionOverridesStore(actionDb)
        : null;
      registerInstructionRoutes(app, {
        getRegistry: (tenantId) =>
          createDefaultAiRegistry({
            databaseStore: registryStore,
            moduleLoader: moduleCapabilityLoader,
            tenantId,
          }),
        getStore: () => instructionStore,
        scopeResolver,
      });
    }
    registerTriggerRoutes(app, {
      mastra,
      moduleLoader: moduleCapabilityLoader,
      scopeResolver,
      getRegistry: (tenantId) =>
        createDefaultAiRegistry({
          databaseStore: registryStore,
          moduleLoader: moduleCapabilityLoader,
          tenantId,
        }),
    });

    // UI-4 Part A: dispatch status endpoint. getQueue is populated by the
    // task dispatcher below — until then it returns null and the endpoint
    // responds with { enabled, queue: null }.
    registerDispatchRoutes(app, {
      getQueue: () => dispatchQueueService,
      scopeResolver,
    });
  }
  registerGatewayModelRoutes(app, {
    getGatewayModelStore: () =>
      isGatewayModelStore(aiUsageStore) ? aiUsageStore : null,
    scopeResolver,
  });
  // External channel ingress (registerExternalChannelRoutes) ran inbound channel
  // messages through the legacy detached-run executor — removed in the 2026-06-20
  // legacy cutover. Channels return in the Actions/Tasks rebuild (Phase 4).

  if (
    !(
      skipBackgroundTasks ||
      options.disableGatewayModelScheduler ||
      "usageStore" in options
    ) &&
    isGatewayModelStore(aiUsageStore)
  ) {
    try {
      await bootstrapGatewayModelsIfEmpty(aiUsageStore);
    } catch (err) {
      logger.warn("Gateway model bootstrap sync failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    await startGatewayModelSyncScheduler(aiUsageStore);
  }

  // Task dispatch (Phase 4): the agent_task_dispatch consumer runs each task as a
  // durable `task-job` Mastra Workflow. On boot we first resume any workflow runs
  // that were mid-flight when the process last stopped (crash-resume), then start
  // the queue consumer. Skipped under test (`usageStore` injected) or kill-switch.
  if (
    !(
      skipBackgroundTasks ||
      options.disableTaskDispatch ||
      "usageStore" in options
    )
  ) {
    const queueAdapter = (
      await import("./infra/database.js")
    ).createAiDatabaseAdapter();
    if (queueAdapter) {
      try {
        await mastra.restartAllActiveWorkflowRuns();
      } catch (err) {
        logger.warn("workflow run resume skipped", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
      dispatchQueueService = createQueueService(queueAdapter);
      const stop = startTaskDispatchConsumer({
        mastra,
        queue: dispatchQueueService,
      });
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
    } else {
      logger.warn("task dispatch consumer not started (no database adapter)");
    }

    // Trigger scheduler (Mastra heartbeats): starts workers + reconciles
    // triggers ↔ heartbeats. Replaces the pg_cron routines tick.
    const { startScheduler } = await import("./scheduler/start.js");
    try {
      await startScheduler({
        mastra,
        moduleLoader: moduleCapabilityLoader,
      });
    } catch (err) {
      logger.warn("trigger scheduler failed to start", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  app.get(`${AI_BASE_PATH}/v1/sdk/stream-ping`, async (_c) => {
    const result = aiService.streamPing();
    return result.toUIMessageStreamResponse();
  });

  const server = new MastraServer({
    app,
    mastra,
    prefix: AI_BASE_PATH,
  });
  await server.init();

  logger.info("mastra hono adapter initialized", {
    mastraAgents: Object.keys(mastra.listAgents()),
  });

  return app;
}

function parseBearerToken(value: string | undefined) {
  if (!value) {
    return;
  }
  let normalized = value.trim();
  while (/^Bearer\s+/i.test(normalized)) {
    normalized = normalized.replace(/^Bearer\s+/i, "").trim();
  }
  return normalized || undefined;
}
