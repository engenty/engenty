import type {
  AiUsageStore,
  DynamicAiModuleCapabilityLoader,
} from "@engenty/ai-core";
import {
  gatewayApiKeyEnvName,
  installGatewayAwareDefaultProvider,
  MODEL_GATEWAY_IDS,
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
import { createLogger, env } from "@engenty/telemetry";
import {
  type HonoBindings,
  type HonoVariables,
  MastraServer,
} from "@mastra/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { UpgradeWebSocket } from "hono/ws";
import { mastra } from "../ai/index.js";
import {
  engentyToolsRunAls,
  withEnvCoreBaseUrl,
} from "../ai/tools/engenty-tools/lib/run-context.js";
import { registerAgentDeskRoutes } from "./agent-desk/routes.js";
import { mirrorArtifactToBoundStorage } from "./ai/artifacts/artifact-mirror.js";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "./ai/core-http-client.js";
import {
  createAgentRunStoreFromEnv,
  createAiService,
  createAiUsageStoreFromEnv,
  createArtifactStoreFromEnv,
  createChatSearchRetrievalFromEnv,
  createDataTableStoreFromEnv,
  createDefaultAiRegistry,
  createDefaultModuleCapabilityLoader,
  createRoutineStoreFromEnv,
  createRoutineTriggerStoreFromEnv,
  createSessionAgentStateChannel,
  createTenantModelConfigResolverFromEnv,
  createThreadStoreFromEnv,
  createWorkflowRunStoreFromEnv,
  createWorkflowStoreFromEnv,
} from "./ai/index.js";
import { createRealtimeVoiceConfigResolverFromEnv } from "./ai/realtime-voice-config.js";
import { setRunEventPubSub } from "./ai/sessions/run-event-bus.js";
import {
  activateStudioTenant,
  resolveStudioPlayAlsContext,
} from "./ai/studio-tenant-agents.js";
import { registerAgentRunRoutes } from "./api/agent-run-routes.js";
import { registerAppProxyRoutes } from "./api/app-proxy-routes.js";
import { registerArtifactRoutes } from "./api/artifact-routes.js";
import { registerAudioTranscriptionRoutes } from "./api/audio-transcription-routes.js";
import { generateBrowserTicketSecret } from "./api/browser/browser-tickets.js";
import { registerBrowserStreamWs } from "./api/browser-stream-ws.js";
import { generateCascadeTicketSecret } from "./api/cascade/cascade-tickets.js";
import { createElevenLabsTtsLeg } from "./api/cascade/elevenlabs-tts.js";
import { createSessionAgentTurn } from "./api/cascade/session-agent-turn.js";
import { createVoxtralSttLeg } from "./api/cascade/voxtral-stt.js";
import { registerCatalogRankRoutes } from "./api/catalog-rank-routes.js";
import { registerChatCommandRoutes } from "./api/chat-command-routes.js";
import {
  createAgUiDebugEventBus,
  registerCopilotKitDebugEventRoutes,
} from "./api/copilotkit-debug-events.js";
import { registerDataTableRoutes } from "./api/data-table-routes.js";
import { registerDispatchRoutes } from "./api/dispatch-routes.js";
import {
  isGatewayModelStore,
  registerGatewayModelRoutes,
} from "./api/gateway-model-routes.js";
import { type AiScopeResolver, createCoreAiScopeResolver } from "./api/http.js";
import { registerInstructionRoutes } from "./api/instruction-routes.js";
import { registerMcpAppRoutes } from "./api/mcp-app-routes.js";
import { registerModelBindingRoutes } from "./api/model-binding-routes.js";
import {
  createVoxtralElevenLabsProvider,
  readElevenLabsApiKeyFromEnv,
  readMistralApiKeyFromEnv,
} from "./api/providers/voxtral-elevenlabs.js";
import {
  REALTIME_CASCADE_WS_PATH,
  registerRealtimeCascadeWs,
} from "./api/realtime-cascade-ws.js";
import {
  type RealtimeClientSecretFetch,
  type RealtimeVoiceConfigResolver,
  registerRealtimeSessionRoutes,
} from "./api/realtime-session-routes.js";
import { registerRealtimeToolRoutes } from "./api/realtime-tool-routes.js";
import { registerRealtimeVoiceOptionsRoutes } from "./api/realtime-voice-options-routes.js";
import { registerRegistryRoutes } from "./api/registry-routes.js";
import {
  registerRemoteChannels,
  startRemoteOutboundConsumer,
} from "./api/remote-channels.js";
import { registerRoomRoutes } from "./api/room-routes.js";
import { registerRoutineRoutes } from "./api/routine-routes.js";
import { registerSandboxRoutes } from "./api/sandbox-routes.js";
import { registerAppsAiSearchIndexRoutes } from "./api/search-index-routes.js";
import { registerSettingsReloadRoutes } from "./api/settings-reload-routes.js";
import { registerAiSettingsRoutes } from "./api/settings-routes.js";
import { registerSkillsRoutes } from "./api/skills-routes.js";
import { registerSpaceHomeRoutes } from "./api/space-home-routes.js";
import { registerStudioTenantRoutes } from "./api/studio-tenant-routes.js";
import { registerTaskJobExecutor } from "./api/task-background-dispatch.js";
import { startTaskDispatchConsumer } from "./api/task-dispatch-consumer.js";
import { registerTaskFieldUpdateRoutes } from "./api/task-field-updates-routes.js";
import { startTeamChatMentionConsumer } from "./api/team-chat-mention-consumer.js";
import { registerThreadRoutes } from "./api/thread-routes.js";
import { registerThreadRunRoutes } from "./api/thread-run-routes.js";
import { registerUsageRoutes } from "./api/usage-routes.js";
import { registerWorkFilesRoutes } from "./api/work-files-routes.js";
import { registerWorkflowPressRoutes } from "./api/workflow-press-routes.js";
import { registerWorkflowRoutes } from "./api/workflow-routes.js";
import { registerWorkingMemoryRoutes } from "./api/working-memory-routes.js";
import { registerWorkspaceRoutes } from "./api/workspace-routes.js";
import { AI_BASE_PATH } from "./config/constants.js";
import { isMastraStudioApiEnabled } from "./config/mastra-studio-api.js";
import { readStudioTenantIdFromEnv } from "./config/mastra-studio-tenant.js";
import { createApiCatalogSearchStore } from "./dal/api-catalog/api-catalog-search-store.js";
import type { ArtifactStore } from "./dal/artifacts/index.js";
import type { ChatSearchRetrieval } from "./dal/chat-search/index.js";
import type { AgentRunStore, ThreadStore } from "./dal/threads/index.js";
import { seedAiUsageModelPricing } from "./dal/usage/index.js";
import {
  bootstrapGatewayModelsIfEmpty,
  startGatewayModelSyncScheduler,
} from "./gateway-model-sync-scheduler.js";
import { syncGatewayModels } from "./gateway-models.js";
import { seedModelBindingsIfMissing } from "./model-binding-seed.js";
import { getModelGateway } from "./model-gateways/index.js";
import { startNotificationDelivery } from "./notifications/inbox.js";
import { resolveRunNotifications } from "./notifications/run-notifications.js";
import {
  bootOnlyAiSettingKeys,
  hydrateAiPlatformSettings,
} from "./platform-settings-hydrate.js";
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
  artifactStore?: ArtifactStore | null;
  chatSearchRetrieval?: ChatSearchRetrieval | null;
  coreBaseUrl?: string;
  coreFetch?: typeof fetch;
  /** Node WS upgrade factory; enables the realtime voice cascade broker. */
  createUpgradeWebSocket?: (
    app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>
  ) => UpgradeWebSocket;
  disableGatewayModelScheduler?: boolean;
  disableTaskDispatch?: boolean;
  elevenLabsRealtimeApiKey?: () => string | null;
  elevenLabsVoicesFetch?: typeof fetch;
  events?: PluginEventsApi;
  mistralRealtimeApiKey?: () => string | null;
  moduleCapabilityLoader?: DynamicAiModuleCapabilityLoader | null;
  openAiRealtimeApiKey?: () => string | null;
  openAiRealtimeFetch?: RealtimeClientSecretFetch;
  realtimeVoiceConfigResolver?: RealtimeVoiceConfigResolver | null;
  registryStore?: any | null;
  scopeResolver?: AiScopeResolver;
  searchIndexRegistry?: SearchIndexRegistry;
  threadStore?: ThreadStore | null;
  usageStore?: AiUsageStore | null;
}

// Canonical entity event payload for chat-session lifecycle. Subscribers
// (chat-search re-index, telemetry) read this without per-route knowledge.
// A `type`, not an `interface`, on purpose: the event bus constrains payloads
// to `Readonly<Record<string, unknown>>`, and only a type alias gets the
// implicit index signature that satisfies it. Declaring this as an interface
// makes every `emit`/`on` call site fail to compile.
// biome-ignore lint/style/useConsistentTypeDefinitions: an interface has no implicit index signature, so it cannot satisfy the bus's Readonly<Record<string, unknown>> constraint — see above.
export type AiChatSessionEventPayload = {
  tenant_id: string;
  thread_id: string;
  user_id: string;
};

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

  // Fan live run events out through Mastra's own pubsub (EventEmitter today;
  // a Redis backend makes multi-replica fan-out a config flip). Same-tick
  // delivery semantics are preserved — see run-event-bus.ts.
  setRunEventPubSub(mastra.pubsub);

  // Platform settings are already hydrated (index.ts, before this module was
  // imported), so the install logs the gateways that are actually configured
  // rather than only those set in the process environment.
  installGatewayAwareDefaultProvider();

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
  const studioPlayScope: { current: AiScopeResolver | null } = {
    current: null,
  };
  app.use(`${AI_BASE_PATH}/*`, async (c, next) => {
    const accessToken = parseBearerToken(c.req.header("authorization"));
    if (!accessToken) {
      return next();
    }
    const resolver = studioPlayScope.current;
    if (isMastraStudioApiEnabled() && resolver) {
      const ctx = await resolveStudioPlayAlsContext({
        accessToken,
        authorization: c.req.header("authorization"),
        scopeResolver: resolver,
      });
      return engentyToolsRunAls.run(withEnvCoreBaseUrl(ctx), next);
    }
    return engentyToolsRunAls.run(withEnvCoreBaseUrl({ accessToken }), next);
  });

  app.get(`${AI_BASE_PATH}/health`, (c) =>
    c.json({
      ok: true,
      service: "@engenty/ai",
    })
  );

  // `?? null` on each: the option is optional (`| undefined`) while the env
  // factory answers `| null`. Collapsing the two absent-cases here keeps every
  // downstream `getStore: () => x` matching the `() => X | null` the route
  // registrars declare, instead of repeating the coalesce at ~8 call sites.
  const threadStore =
    ("threadStore" in options
      ? options.threadStore
      : createThreadStoreFromEnv()) ?? null;
  const agentRunStore =
    ("agentRunStore" in options
      ? options.agentRunStore
      : createAgentRunStoreFromEnv()) ?? null;
  const workflowRunStore = createWorkflowRunStoreFromEnv();
  const flowGraphStore = createWorkflowStoreFromEnv();
  const artifactStore =
    "artifactStore" in options
      ? options.artifactStore
      : createArtifactStoreFromEnv();
  if (threadStore) {
    logger.info("agent session store ready", { schema: "ai" });
  } else if (!("threadStore" in options)) {
    logger.warn(
      "agent session store unavailable — set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY and SUPABASE_JWT_SECRET (or ENGENTY_SECURITY_JWT_SECRET)"
    );
  }
  if (agentRunStore) {
    logger.info("agent run store ready", { schema: "ai" });
    // D6: startup sweep — any run still "running" from a previous process cannot
    // be live. Mark as failed so clients never wait on a zombie run.
    if (!skipBackgroundTasks) {
      agentRunStore
        .sweepStalledRuns?.()
        .then(async (result) => {
          // A swept run's open decision records point at a question nobody
          // will answer any more — close them with the run.
          for (const run of result?.runs ?? []) {
            await resolveRunNotifications({
              outcome: "failed",
              subject: { id: run.id, type: "run" },
              tenantId: run.tenantId,
            });
          }
        })
        .catch((err: unknown) => {
          logger.warn("startup sweep failed", { error: String(err) });
        });
    }
  }
  const chatSearchRetrieval =
    "chatSearchRetrieval" in options
      ? options.chatSearchRetrieval
      : createChatSearchRetrievalFromEnv();
  const aiUsageStore =
    ("usageStore" in options
      ? options.usageStore
      : createAiUsageStoreFromEnv()) ?? null;
  const registryStore =
    "registryStore" in options
      ? options.registryStore
      : (await import("./ai/index.js")).createRegistryStoreFromEnv();
  const moduleCapabilityLoader =
    "moduleCapabilityLoader" in options
      ? (options.moduleCapabilityLoader ?? undefined)
      : createDefaultModuleCapabilityLoader();
  // Sandbox host time rides the same ledger as tokens (`compute_lease` events).
  (
    await import("./ai/sandbox/sandbox-lease-metering.js")
  ).installSandboxLeaseMetering(aiUsageStore);
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
  // Durable channel for function-agent thread state (metadata.agent_state).
  // Only run-serving registries carry it; catalog/instruction registries
  // render function agents bare (their base face), which is correct there.
  const agentStateChannel = createSessionAgentStateChannel(
    () => threadStore ?? null
  );
  const aiService = createAiService({
    mastra,
    getRunStore: () => agentRunStore,
    getStore: () => threadStore,
    getUsageStore: () => aiUsageStore,
    resolveTenantModelConfig:
      createTenantModelConfigResolverFromEnv() ?? undefined,
    createRegistry: (scope) =>
      createDefaultAiRegistry({
        databaseStore: registryStore,
        moduleLoader: moduleCapabilityLoader,
        stateChannel: agentStateChannel,
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

    if (input.threadId && threadStore) {
      try {
        const thread = await threadStore.getThreadGlobally({
          threadId: input.threadId,
        });
        // The grant is "this guest may act as the person whose chatbot thread
        // this is". An UNATTENDED thread has no such person — so there is
        // nobody to act as, and the request falls through to the original
        // denial rather than minting a scope with no identity in it. (Before
        // `ThreadRow.created_by_user_id` was typed honestly this branch could
        // hand a null `userId` to every DAL filter and to the memory resource
        // resolver.)
        if (
          thread?.agent_id.startsWith("chatbot.") &&
          thread.created_by_user_id
        ) {
          return {
            ok: true,
            scope: {
              isSuperAdmin: false,
              isTenantAdmin: false,
              tenantRole: "member",
              tenantId: thread.tenant_id,
              userId: thread.created_by_user_id,
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
  studioPlayScope.current = scopeResolver;

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
  if (chatSearchRetrieval) {
    registerSearchIndexProvider(chatSearchRetrieval.provider, {
      capabilities: chatSearchRetrieval.provider.capabilities,
      entityName: "chat_session",
      moduleId: "ai",
      // No declarative `onEvents`; a session re-indexes as a whole document
      // on any persistence write, which the per-doc bindings cannot express.
      // The custom subscribers below handle `ai.chat_session.updated` /
      // `.deleted` against the apps/ai-local retrieval service.
      skipAutoTool: true,
    });
    eventsApi.modules.on<AiChatSessionEventPayload>(
      AI_CHAT_SESSION_UPDATED_EVENT,
      async (payload) => {
        try {
          await chatSearchRetrieval.refreshSession({
            thread_id: payload.thread_id,
            tenant_id: payload.tenant_id,
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
        // The legacy tables had an FK cascade from ai.thread; the central
        // search.documents store does not, so index rows must be removed
        // explicitly when a session is deleted.
        try {
          await chatSearchRetrieval.removeSession({
            thread_id: payload.thread_id,
            tenant_id: payload.tenant_id,
          });
        } catch (err) {
          logger.warn("chat search removal skipped after session.deleted", {
            err,
            thread_id: payload.thread_id,
            tenant_id: payload.tenant_id,
            user_id: payload.user_id,
          });
        }
      }
    );
  }

  // `core_api_catalog`: catalog building stays in apps/core (it owns the
  // plugin registry + tenant-override gating), but ranking happens here —
  // the store fetches the caller-gated contracts from core and applies
  // lexical BM25 + semantic embedding reranking (catalog-ranking.ts). The
  // `engenty_tools_search` Mastra tool consumes it via this registry, the
  // same way it uses `ai_chat_search`.
  const apiCatalogStore = createApiCatalogSearchStore();
  searchIndexRegistry.register(apiCatalogStore, {
    capabilities: apiCatalogStore.capabilities,
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
  // Emitted by the single-session DELETE route. The central retrieval store
  // has no FK into ai.thread, so index cleanup rides on this event (bulk
  // deletes don't report thread ids yet — known follow-up, see
  // docs/wip/retrieval-service.md Phase 5).
  const emitChatSessionDeleted = async (params: {
    threadId: string;
    tenantId: string;
    userId: string;
  }) => {
    await eventsApi.modules.emit<AiChatSessionEventPayload>(
      AI_CHAT_SESSION_DELETED_EVENT,
      {
        thread_id: params.threadId,
        tenant_id: params.tenantId,
        user_id: params.userId,
      },
      { tenantId: params.tenantId }
    );
  };
  registerThreadRoutes(app, {
    getUsageStore: () => aiUsageStore,
    aiService,
    onThreadDeleted: emitChatSessionDeleted,
    onThreadPersisted: emitChatSessionUpdated,
    scopeResolver,
  });
  if (threadStore) {
    registerRoomRoutes(app, {
      aiService,
      getRegistry: (tenantId) =>
        createDefaultAiRegistry({
          databaseStore: registryStore,
          moduleLoader: moduleCapabilityLoader,
          tenantId,
        }),
      scopeResolver,
      store: threadStore,
    });
    registerSpaceHomeRoutes(app, {
      getRunStore: () => agentRunStore,
      scopeResolver,
      store: threadStore,
    });
  }
  registerAgentDeskRoutes(app, {
    aiService,
    coreBaseUrl: options.coreBaseUrl,
    coreFetch: options.coreFetch,
    getRegistry: (tenantId) =>
      createDefaultAiRegistry({
        databaseStore: registryStore,
        moduleLoader: moduleCapabilityLoader,
        tenantId,
      }),
    getStore: () => registryStore ?? null,
    scopeResolver,
  });
  if (artifactStore) {
    registerArtifactRoutes(app, {
      artifactStore,
      // Best-effort mirror to the scope's bound storage connection, executed
      // through core's connections_files_write as the promoting user.
      mirrorArtifact: async ({ artifact, authorization, tenantId }) => {
        const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
        if (!(coreBaseUrl && authorization)) {
          return;
        }
        const coreClient = new EngentyCoreClient({
          coreBaseUrl,
          accessToken: authorization,
        });
        await mirrorArtifactToBoundStorage({
          artifact,
          invokeTool: (toolId, input) => coreClient.invokeTool(toolId, input),
          log: (message, data) => logger.warn(message, data ?? {}),
          store: artifactStore,
          tenantId,
        });
      },
      listSpaceAgentIds: async ({ authorization, spaceId }) => {
        const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
        if (!(coreBaseUrl && authorization)) {
          return [];
        }
        try {
          const coreClient = new EngentyCoreClient({
            coreBaseUrl,
            accessToken: authorization,
          });
          const surface = await coreClient.getSpaceSurface(spaceId);
          return surface.agents ?? [];
        } catch {
          return [];
        }
      },
      scopeResolver,
    });
    const dataTableStore = createDataTableStoreFromEnv();
    if (dataTableStore) {
      registerDataTableRoutes(app, {
        scopeResolver,
        tables: dataTableStore,
      });
    }
  } else if (!("artifactStore" in options)) {
    logger.warn(
      "artifact store unavailable — artifact routes skipped and copilot artifact tools will fail; set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY and SUPABASE_JWT_SECRET (or ENGENTY_SECURITY_JWT_SECRET)"
    );
  }
  if (registryStore?.listTools) {
    registerMcpAppRoutes(app, {
      scopeResolver,
      serverConfigs: {
        // A widget may only call the MCP servers registered for its tenant.
        listServerUrls: async (tenantId: string) => {
          const tools: Array<{
            endpointUrl?: string | null;
            schemaJson?: Record<string, unknown>;
          }> = await registryStore.listTools(tenantId);
          return tools.flatMap((tool) => {
            const raw = tool.schemaJson?.engenty_mcp_app;
            const record =
              raw && typeof raw === "object" && !Array.isArray(raw)
                ? (raw as Record<string, unknown>)
                : null;
            const url =
              (typeof record?.server_url === "string"
                ? record.server_url
                : null) ?? tool.endpointUrl;
            return record && typeof url === "string" && url ? [url] : [];
          });
        },
      },
    });
  }
  // engenty Apps capability wall. Registered unconditionally: it brokers
  // every call a tenant-authored App makes, and a missing route would fail
  // open in the UI rather than closed.
  registerAppProxyRoutes(app, { scopeResolver });
  registerThreadRunRoutes(app, {
    // Registry + store for the streaming chat runtimes (harness_session default,
    // conversation executor).
    createRegistry: (scope) =>
      createDefaultAiRegistry({
        databaseStore: registryStore,
        moduleLoader: moduleCapabilityLoader,
        stateChannel: agentStateChannel,
        tenantId: scope.tenantId,
      }),
    coreBaseUrl: options.coreBaseUrl,
    debugEvents: agUiDebugEvents,
    getRunStore: () => agentRunStore,
    getStore: () => threadStore ?? null,
    getUsageStore: () => aiUsageStore ?? null,
    aiService,
    moduleLoader: moduleCapabilityLoader,
    onThreadPersisted: emitChatSessionUpdated,
    scopeResolver,
  });
  registerAgentRunRoutes(app, {
    getRegistryStore: () => registryStore,
    getRunStore: () => agentRunStore,
    aiService,
    scopeResolver,
  });

  // The WS upgrade helper serves two brokers: the voice cascade below and the
  // user-browser live view. Both mint short-lived tickets with a secret that
  // is shared across instances when configured and process-local otherwise.
  const upgradeWebSocket = options.createUpgradeWebSocket?.(app) ?? null;
  const browserTicketSecret = upgradeWebSocket
    ? env("ENGENTY_REALTIME_TICKET_SECRET", "") || generateBrowserTicketSecret()
    : null;
  registerSandboxRoutes(app, {
    browserTicketSecret,
    getRunStore: () => agentRunStore,
    getSessionStore: () => threadStore,
    scopeResolver,
  });
  if (upgradeWebSocket && browserTicketSecret) {
    registerBrowserStreamWs(app, {
      ticketSecret: browserTicketSecret,
      upgradeWebSocket,
    });
  }
  registerAudioTranscriptionRoutes(app, { scopeResolver });
  // Voxtral+ElevenLabs cascade: only registered when a WS upgrade factory
  // and both vendor keys are configured; otherwise the provider stays
  // unregistered and tenant prefs selecting it get a clean 501.
  const cascadeMistralKey = readMistralApiKeyFromEnv();
  const cascadeElevenLabsKey = readElevenLabsApiKeyFromEnv();
  const cascadeConfigured = Boolean(
    upgradeWebSocket && cascadeMistralKey && cascadeElevenLabsKey
  );
  const cascadeTicketSecret =
    env("ENGENTY_REALTIME_TICKET_SECRET", "") || generateCascadeTicketSecret();
  registerRealtimeSessionRoutes(app, {
    cascadeProvider: cascadeConfigured
      ? createVoxtralElevenLabsProvider({
          cascadeWsPath: REALTIME_CASCADE_WS_PATH,
          ticketSecret: cascadeTicketSecret,
        })
      : null,
    openAiApiKey: options.openAiRealtimeApiKey,
    openAiFetch: options.openAiRealtimeFetch,
    // Explicit null (tests) disables tenant prefs; undefined falls back to
    // the tenant-settings KV resolver so prefs work in production.
    realtimeVoiceConfig:
      options.realtimeVoiceConfigResolver === undefined
        ? createRealtimeVoiceConfigResolverFromEnv()
        : options.realtimeVoiceConfigResolver,
    scopeResolver,
  });
  registerRealtimeVoiceOptionsRoutes(app, {
    elevenLabsApiKey: options.elevenLabsRealtimeApiKey,
    elevenLabsFetch: options.elevenLabsVoicesFetch,
    mistralApiKey: options.mistralRealtimeApiKey,
    scopeResolver,
  });
  if (upgradeWebSocket && cascadeMistralKey && cascadeElevenLabsKey) {
    registerRealtimeCascadeWs(app, {
      createAgentTurn: (ticket) =>
        createSessionAgentTurn({
          instructions: ticket.instructions,
          scope: { tenantId: ticket.tenant_id, userId: ticket.user_id },
          sessions: aiService.threads,
        }),
      createSttLeg: (ticket, handlers) =>
        createVoxtralSttLeg({
          apiKey: cascadeMistralKey,
          languageHint: ticket.language_hint,
          model: ticket.stt_model,
          ...handlers,
        }),
      createTtsLeg: (ticket, handlers) =>
        createElevenLabsTtsLeg({
          apiKey: cascadeElevenLabsKey,
          modelId: ticket.tts_model,
          voiceId: ticket.tts_voice,
          ...handlers,
        }),
      ticketSecret: cascadeTicketSecret,
      upgradeWebSocket,
    });
  }
  registerRealtimeToolRoutes(app, {
    coreBaseUrl: options.coreBaseUrl,
    coreFetch: options.coreFetch,
    getSessionStore: () => threadStore ?? null,
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
  registerWorkflowPressRoutes(app, {
    getWorkflowRunStore: () => workflowRunStore,
    moduleLoader: moduleCapabilityLoader,
    scopeResolver,
  });
  registerTaskFieldUpdateRoutes(app, { scopeResolver });
  registerWorkflowRoutes(app, {
    getWorkflowStore: () => flowGraphStore,
    getWorkflowRunStore: () => workflowRunStore,
    scopeResolver,
  });
  registerChatCommandRoutes(app, {
    moduleLoader: moduleCapabilityLoader,
    scopeResolver,
  });
  registerCatalogRankRoutes(app, { scopeResolver });
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
  registerWorkFilesRoutes(app, { scopeResolver });
  {
    // Phase A seam: the instruction store's override lane is tenant-keyed and
    // rides tenant-locked handles; its change-history lane keeps the service
    // client (documented in the store).
    const { createDbSourceFromEnv } = await import("./infra/tenant-db.js");
    const instructionDbSource = createDbSourceFromEnv();
    {
      const { createInstructionOverridesStore } = await import(
        "./dal/instructions/instruction-overrides-store.js"
      );
      const instructionStore = instructionDbSource
        ? createInstructionOverridesStore(instructionDbSource)
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
    registerRoutineRoutes(app, {
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
    registerWorkingMemoryRoutes(app, {
      getRegistry: (tenantId) =>
        createDefaultAiRegistry({
          databaseStore: registryStore,
          moduleLoader: moduleCapabilityLoader,
          tenantId,
        }),
      scopeResolver,
    });

    // UI-4 Part A: dispatch status endpoint. getQueue is populated by the
    // task dispatcher below — until then it returns null and the endpoint
    // responds with { enabled, queue: null }.
    registerDispatchRoutes(app, {
      getQueue: () => dispatchQueueService,
      scopeResolver,
    });
  }
  registerModelBindingRoutes(app, {
    getGatewayModelStore: () =>
      isGatewayModelStore(aiUsageStore) ? aiUsageStore : null,
    scopeResolver,
  });
  registerGatewayModelRoutes(app, {
    getGatewayModelStore: () =>
      isGatewayModelStore(aiUsageStore) ? aiUsageStore : null,
    getUsageStore: () => aiUsageStore ?? null,
    scopeResolver,
  });
  registerAiSettingsRoutes(app, { scopeResolver });
  registerSettingsReloadRoutes(app, {
    bootOnlyKeys: () => bootOnlyAiSettingKeys(),
    reload: async () => {
      const result = await hydrateAiPlatformSettings(logger, { reload: true });
      // A gateway that lists its models only with a key (Opper, the direct
      // vendors) has an empty half of the catalog until one exists. Saving
      // the key in the browser is that moment: sync just those gateways, in
      // the background, so the picker fills without a restart or a manual
      // POST /ai/v1/gateway/models/sync.
      const keyed = MODEL_GATEWAY_IDS.filter((id) => {
        const envKey = gatewayApiKeyEnvName(id);
        return envKey !== null && result.hydrated.includes(envKey);
      })
        .map((id) => getModelGateway(id))
        .filter((gateway) => gateway !== null);
      if (isGatewayModelStore(aiUsageStore) && keyed.length > 0) {
        void syncGatewayModels(aiUsageStore, {
          gateways: keyed,
          trigger: "manual",
        })
          .then((sync) => {
            logger.info("gateway catalog synced after settings reload", {
              byGateway: sync.by_gateway,
            });
          })
          .catch((err) => {
            logger.warn("gateway catalog sync after settings reload failed", {
              error: String(err),
            });
          });
      }
      return result;
    },
    scopeResolver,
  });
  // External channel ingress (registerExternalChannelRoutes) ran inbound channel
  // messages through the legacy detached-run executor — routes removed in the
  // 2026-06-20 cutover, its stranded config/outbound helpers (ai/channels.ts and
  // friends, ENGENTY_AI_SLACK_*/DISCORD_*) deleted after. Successor: the
  // engenty-remote channel runtime below
  // (Mastra AgentChannels + Chat SDK adapters), which activates when a platform
  // is configured and is killed by ENGENTY_REMOTE_CHANNELS_ENABLED=false.
  await registerRemoteChannels(app, {
    mastra,
    threadStore,
  });

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
    try {
      await seedModelBindingsIfMissing(aiUsageStore);
    } catch (err) {
      // Non-fatal: resolution falls back to the authored defaults, which is
      // exactly what the seed would have written.
      logger.warn("Model binding seed failed", {
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
    // SERVICE lane (Phase A residual, on purpose): the queue rides the
    // public.pgmq_* wrapper RPCs, which the Phase A migration locks to
    // service_role only — queues are cross-tenant core infrastructure and the
    // tenant lane is deliberately barred from them.
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
      // Phase 8: the background-task substrate. Order matters on Mastra 1.59:
      // `startWorkers` DISCARDS a producer-mode manager and builds a new one,
      // so the suspend-capable executor must be registered on the manager that
      // survives — i.e. AFTER startWorkers. Recovery never depends on this
      // registration: the config-level `taskJobRecoveryTool` (ai/index.ts) is
      // registered by the Mastra constructor on every manager instance before
      // its init/recovery runs.
      try {
        await mastra.startWorkers("backgroundTasks");
        registerTaskJobExecutor(mastra);
      } catch (err) {
        logger.warn("background task workers not started", {
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
      // Team-chat @-mentions ride the same queue infrastructure (Phase 3).
      const stopMentions = startTeamChatMentionConsumer({
        queue: dispatchQueueService,
      });
      process.once("SIGTERM", stopMentions);
      process.once("SIGINT", stopMentions);
      // Remote channels proactive sends (remote_notify op → messenger thread).
      const stopRemoteOutbound = startRemoteOutboundConsumer({
        queue: dispatchQueueService,
      });
      process.once("SIGTERM", stopRemoteOutbound);
      process.once("SIGINT", stopRemoteOutbound);
      // Notification delivery (web push, email): this process holds the VAPID
      // keys and the per-tenant service invoker, so it drives the ledger.
      const stopNotificationDelivery = await startNotificationDelivery();
      process.once("SIGTERM", stopNotificationDelivery);
      process.once("SIGINT", stopNotificationDelivery);
    } else {
      logger.warn("task dispatch consumer not started (no database adapter)");
    }

    // This process's own record events (Space tables) → event routines. The
    // module-event door is the HTTP intake in routine-routes; this is the
    // in-process one, same dispatcher.
    const { startRoutineEventListener } = await import(
      "./ai/routines/dispatch-event.js"
    );
    const stopRoutineEvents = startRoutineEventListener(() => {
      const routines = createRoutineStoreFromEnv();
      const flowGraphs = createWorkflowStoreFromEnv();
      const requests = createWorkflowRunStoreFromEnv();
      const triggers = createRoutineTriggerStoreFromEnv();
      return routines && flowGraphs && requests && triggers
        ? { flowGraphs, requests, routines, triggers }
        : null;
    });
    process.once("SIGTERM", stopRoutineEvents);
    process.once("SIGINT", stopRoutineEvents);

    // Trigger scheduler (Mastra schedules): starts workers + reconciles
    // triggers ↔ schedules. Replaces the pg_cron routines tick.
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

  // Mastra's native REST API is opt-in dev tooling, not part of this product's
  // surface — it authenticates nothing without `server.experimental_auth`, and
  // apps/core proxies all of `/ai`. Mounted only for Mastra Studio, never in
  // production. See config/mastra-studio-api.ts.
  if (isMastraStudioApiEnabled()) {
    const createStudioRegistry = (tenantId: string) =>
      createDefaultAiRegistry({
        databaseStore: registryStore,
        moduleLoader: moduleCapabilityLoader,
        tenantId,
      });
    registerStudioTenantRoutes(app, {
      createRegistry: createStudioRegistry,
      mastra,
      scopeResolver,
      threadStore,
    });
    const envTenant = readStudioTenantIdFromEnv();
    if (envTenant) {
      try {
        await activateStudioTenant({
          createRegistry: createStudioRegistry,
          mastra,
          tenantId: envTenant,
          threadStore,
        });
      } catch (err) {
        logger.warn("studio tenant: boot pin failed", {
          tenantId: envTenant,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const server = new MastraServer({
      app,
      mastra,
      prefix: AI_BASE_PATH,
    });
    await server.init();

    logger.warn(
      `mastra native REST API mounted under ${AI_BASE_PATH} for Mastra Studio — it is UNAUTHENTICATED; do not expose this process`,
      { mastraAgents: Object.keys(mastra.listAgents()) }
    );
  }

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
