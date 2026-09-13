import fs from "node:fs";
import path from "node:path";
import {
  enabledModuleSlugSetFromDir,
  isMandatoryPlugin,
  readEngentyPluginsManifest,
  resolveEnabledModules,
  resolveModuleDir,
} from "@engenty/environment";
import {
  createNotificationsHost,
  notificationsPolicyFromEnv,
  type OriginServiceDb,
  originLookupsFromServiceDb,
} from "@engenty/notifications";
import {
  type ContextGraphHost,
  type ContextGraphSchemaRegistration,
  createPluginEventsRuntime,
  type EngentyPluginApi,
  type EngentyPluginFactory,
  type EngentyPluginManifest,
  type PluginEventContext,
  type PluginEventFilter,
  type PluginEventHandlerRegistration,
  type PluginEventInterceptor,
  type PluginEventObserver,
  type PluginEventPayload,
  type PluginEventsApi,
  type PluginEventsRuntime,
  type PluginRuntime,
} from "@engenty/plugin-sdk";
import {
  createRetrievalService,
  createWorkspaceSearchProvider,
  type RetrievalSourceRegistration,
} from "@engenty/retrieval";
import type { SearchIndexRegistry } from "@engenty/search-index";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import type { TenantPluginOverridesDal } from "../dal/tenant-plugin-overrides.js";
import { createDatabaseAdapter } from "../infra/index.js";
import {
  createTenantDbFactory,
  resolveTenantDbConfig,
} from "../infra/tenant-db.js";
import { createBootApiLogger, initEvlog } from "../observability/evlog.js";
import { registerCoreRoleProfiles } from "../security/role-profiles.js";
import { resolvePluginCapability } from "./capability-resolver.js";
import {
  discoverPluginPackageRoot,
  discoverPlugins,
  type PluginCandidate,
  resolveModulesDir,
  resolvePackagesDir,
} from "./discovery.js";
import {
  loadPluginManifest,
  type PluginManifest,
  resolvePluginTier,
} from "./manifest.js";
import {
  evaluatePluginTierViolations,
  stripTierRestrictedContributions,
} from "./plugin-tier-policy.js";
import {
  createPluginRegistry,
  createPluginSourceInfo,
  type PluginEventRegistration,
  type PluginRecord,
  type PluginRegistry,
} from "./registry.js";
import {
  createSearchIndexHost,
  createSearchIndexRegistry,
} from "./search-index-host.js";
import { startRegisteredServices } from "./service-lifecycle.js";
import { readPluginState, resolvePluginStatePath } from "./state-store.js";

export interface LoadPluginsParams {
  config?: Record<string, unknown>;
  dataDir?: string;
  logger?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  modulesDir?: string;
  packagesDir?: string;
  /**
   * When false, registered plugin services (timers, loops) are not started.
   * Use for the CLI so the process can exit after a command. Default true.
   */
  startRegisteredServices?: boolean;
  tenantPluginOverrides?: TenantPluginOverridesDal;
}

const defaultLogger = (() => {
  initEvlog();
  return createBootApiLogger();
})();

type LoadedPluginEntry = EngentyPluginFactory;

type PluginImportCache = Record<string, unknown>;

export interface ClearPluginImportCacheResult {
  clearedEntries: string[];
  entryPath?: string;
  reason?: string;
  refused: boolean;
  removed: number;
  rootDir: string;
}

function normalizeCachePath(filePath: string) {
  const resolved = path.resolve(filePath);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function isPathInRoot(filePath: string, rootDir: string) {
  const relative = path.relative(rootDir, filePath);
  return (
    relative === "" ||
    (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function getPluginImportCache() {
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  return jiti.cache as PluginImportCache;
}

export function clearPluginImportCache(params: {
  entryPath?: string;
  importCache?: PluginImportCache;
  rootDir: string;
}): ClearPluginImportCacheResult {
  const rootDir = normalizeCachePath(params.rootDir);
  const rootPath = path.parse(rootDir).root;
  if (rootDir === rootPath) {
    return {
      clearedEntries: [],
      reason: "Refusing to clear import cache for a filesystem root.",
      refused: true,
      removed: 0,
      rootDir,
    };
  }

  const entryPath = params.entryPath
    ? normalizeCachePath(params.entryPath)
    : undefined;
  const importCache = params.importCache ?? getPluginImportCache();
  const clearedEntries: string[] = [];

  for (const cacheKey of Object.keys(importCache)) {
    const normalizedCacheKey = normalizeCachePath(cacheKey);
    if (
      normalizedCacheKey === entryPath ||
      isPathInRoot(normalizedCacheKey, rootDir)
    ) {
      delete importCache[cacheKey];
      clearedEntries.push(cacheKey);
    }
  }

  return {
    clearedEntries,
    entryPath,
    refused: false,
    removed: clearedEntries.length,
    rootDir,
  };
}

function toEngentyPluginManifest(
  manifest: PluginManifest
): EngentyPluginManifest {
  return {
    capabilities: manifest.capabilities,
    description: manifest.description ?? "",
    id: manifest.id,
    kind: manifest.kind ?? "module",
    name: manifest.name ?? manifest.id,
    optional: manifest.optional,
    provides: manifest.provides,
    requires: manifest.requires,
    tier: manifest.tier,
    server: {
      entry: manifest.server?.entry ?? "",
    },
    ui: manifest.ui?.entry
      ? {
          assetOrigins: manifest.ui.assetOrigins,
          entry: manifest.ui.entry,
          export: manifest.ui.export ?? "",
          load: manifest.ui.load,
          staticAssets: manifest.ui.staticAssets,
          tailwindSources: manifest.ui.tailwindSources,
        }
      : undefined,
    version: manifest.version ?? "0.0.0",
  };
}

function createPluginApi(params: {
  manifest: PluginManifest;
  pluginApi: ReturnType<ReturnType<typeof createPluginRegistry>["createApi"]>;
  pluginConfig: Record<string, unknown>;
  record: PluginRecord;
  registry: PluginRegistry;
  eventsRuntime: PluginEventsRuntime;
  resolveTenantPluginOverrides?: (
    tenantId: string
  ) => Promise<Record<string, boolean>>;
  searchIndexRegistry: SearchIndexRegistry;
}): EngentyPluginApi {
  const capabilities = new Set(params.manifest.provides ?? []);
  const events = params.eventsRuntime.createApi({
    pluginId: params.record.id,
    sourceInfo: createPluginSourceInfo(params.record, "server.plugin"),
    createRegistrationReceipt: ({ eventName, key, kind, namespace }) => {
      const sourceInfo = createPluginSourceInfo(params.record, kind);
      return {
        id: `${params.record.id}:${kind}:${namespace}:${String(eventName)}:${key}`,
        pluginId: params.record.id,
        generationId: sourceInfo.generationId,
        kind,
        sourceInfo,
        dispose: () => {},
      };
    },
    onRegister: (registration) => {
      const entry = {
        capability: registration.capability,
        dispose: registration.receipt.dispose,
        eventName: registration.eventName,
        handler: registration.handler,
        listenerKind: registration.listenerKind,
        namespace: registration.namespace,
        pluginId: params.record.id,
        receiptId: registration.receipt.id,
        requiredCapabilities: registration.requiredCapabilities,
        sourceInfo: registration.receipt.sourceInfo,
        tenantScoped: registration.tenantScoped,
      } satisfies Parameters<typeof pushOwnedEventRegistration>[0]["entry"];
      pushOwnedEventRegistration({
        entry,
        record: params.record,
        registry: params.registry,
      });
    },
    shouldInvoke: async ({ context, payload, registration }) =>
      shouldInvokeEventRegistration({
        context,
        payload,
        record: params.record,
        registration,
        registry: params.registry,
        resolveTenantPluginOverrides: params.resolveTenantPluginOverrides,
      }),
  });

  const searchIndexHost = createSearchIndexHost({
    events,
    registry: params.searchIndexRegistry,
    server: params.pluginApi.server,
  });

  // One notifications host per process, built the first time any plugin api
  // is created — before that plugin's factory runs — so a module can emit
  // regardless of load order. Tenant-locked lane when configured, the service
  // adapter otherwise; neither → no host on `server`.
  if (!params.registry.notificationsHost) {
    const getTenantDb = params.pluginApi.server.getTenantDb;
    const serviceDb = params.pluginApi.server.getServiceDb?.() as
      | SupabaseClient
      | null
      | undefined;
    if (getTenantDb || serviceDb) {
      params.registry.notificationsHost = createNotificationsHost({
        db: {
          forTenant: (tenantId) =>
            ((getTenantDb
              ? (getTenantDb({ tenantId }) as SupabaseClient | null)
              : null) ?? serviceDb) as SupabaseClient,
        },
        events: params.eventsRuntime.api,
        ...(serviceDb
          ? {
              origin: originLookupsFromServiceDb(
                serviceDb as unknown as OriginServiceDb
              ),
            }
          : {}),
        ...notificationsPolicyFromEnv(),
      });
    }
  }
  const notificationsHost = params.registry.notificationsHost;

  return {
    ai: {},
    capabilities: {
      has: (capability) => capabilities.has(capability),
      provides: (capability) => {
        const normalized = capability.trim();
        if (!normalized) {
          return;
        }
        capabilities.add(normalized);
        params.record.provides = Array.from(
          new Set([...(params.record.provides ?? []), normalized])
        );
      },
    },
    config: {
      pluginConfig: params.pluginConfig,
      runtimeConfig: params.pluginApi.config,
    },
    diagnostics: {
      report: (diagnostic) => {
        params.registry.diagnostics.push({
          ...diagnostic,
          pluginId: diagnostic.pluginId ?? params.record.id,
          sourceInfo:
            diagnostic.sourceInfo ??
            createPluginSourceInfo(params.record, "server.plugin"),
        });
      },
    },
    events,
    frontendTools: {},
    id: params.record.id,
    manifest: toEngentyPluginManifest(params.manifest),
    server: {
      ...params.pluginApi.server,
      // Context-graph surfaces delegate to the host installed by the
      // `@engenty/context-graph` plugin. Read lazily so they resolve
      // regardless of plugin load order (modules load before packages).
      get contextGraph() {
        return params.registry.contextGraphHost?.serverApi;
      },
      get contextGraphSources() {
        return params.registry.contextGraphHost?.sources;
      },
      registerContextGraphHost: (host: ContextGraphHost) =>
        installContextGraphHost(params.registry, host),
      registerContextGraphSchema: (
        registration: ContextGraphSchemaRegistration
      ) =>
        registerContextGraphSchema({
          registry: params.registry,
          events,
          moduleId: params.record.id,
          registration,
        }),
      registerContextGraphSource: (source) =>
        params.registry.contextGraphHost?.sources.register(source),
      getRetrievalService: () => params.registry.retrievalService ?? null,
      registerRetrievalSource: (registration: RetrievalSourceRegistration) => {
        // One shared service per process; created on first use. The creating
        // plugin also hosts the synthesized `core_workspace_search` tool —
        // acceptable provenance until a core-owned boot registration exists.
        let service = params.registry.retrievalService;
        if (!service) {
          const supabase = params.pluginApi.server.getServiceDb?.();
          if (!supabase) {
            throw new Error(
              "registerRetrievalSource requires Supabase (supabaseUrl and supabaseServiceRoleKey)"
            );
          }
          // Phase A seam: with the tenant lane available the service runs
          // document/chunk/query work tenant-locked; the service client
          // remains for the platform visibility registry (and as the whole
          // source in no-lane dev bootstraps).
          const getTenantDb = params.pluginApi.server.getTenantDb;
          service = createRetrievalService({
            supabase: getTenantDb
              ? ({
                  getDb: getTenantDb,
                  serviceDb: supabase,
                } as never)
              : (supabase as never),
          });
          params.registry.retrievalService = service;
        }
        // Keep exactly one live `core_workspace_search`, re-homed to the
        // latest registrant: plugin reload disposes the previous owner's
        // receipts, so a boot-time one-shot would vanish on first HMR.
        const previousWorkspaceReceipt = params.registry.workspaceSearchReceipt;
        if (previousWorkspaceReceipt?.dispose) {
          void previousWorkspaceReceipt.dispose();
        }
        params.registry.workspaceSearchReceipt = searchIndexHost(
          createWorkspaceSearchProvider(service),
          {
            entityName: "workspace",
            moduleId: "core",
            operationOverrides: {
              idempotent: true,
              riskLevel: "low",
              summary:
                "Search across all indexed workspace content (mail, contacts, knowledge base, …) with module/source/time filters",
            },
          }
        );
        service.registerSource(registration);
        const provider = service.getProvider(registration.source_type);
        if (!provider) {
          throw new Error(
            `Retrieval source ${registration.source_type} produced no provider`
          );
        }
        return searchIndexHost(provider, {
          capabilities: provider.capabilities,
          entityName: registration.operation.entityName,
          ...(registration.operation.filtersSchema
            ? { filtersSchema: registration.operation.filtersSchema as never }
            : {}),
          moduleId: registration.module_id,
          ...(registration.onEvents ? { onEvents: registration.onEvents } : {}),
          ...(registration.operation.overrides
            ? { operationOverrides: registration.operation.overrides }
            : {}),
          ...(registration.operation.spacePolicy
            ? { spacePolicy: registration.operation.spacePolicy as never }
            : {}),
        });
      },
      ...(notificationsHost ? { notifications: notificationsHost } : {}),
      registerSearchIndexProvider: searchIndexHost,
    },
    source: createPluginSourceInfo(params.record, "server.plugin"),
    ui: {},
  };
}

/**
 * Install the context-graph host (from the `@engenty/context-graph` plugin) and
 * flush any schema registrations buffered by consumers that loaded first.
 */
function installContextGraphHost(
  registry: PluginRegistry,
  host: ContextGraphHost
): void {
  registry.contextGraphHost = host;
  const pending = registry.pendingContextGraphSchemas;
  if (pending?.length) {
    for (const item of pending) {
      host.createSchemaRegistrar(item.events, item.moduleId)(item.registration);
    }
    registry.pendingContextGraphSchemas = [];
  }
}

/**
 * Delegate a schema registration to the installed host, or buffer it when the
 * host plugin has not loaded yet (modules discover before packages). Deferred
 * registrations return no receipt — dispose is not needed at boot.
 */
function registerContextGraphSchema(params: {
  events: PluginEventsApi;
  moduleId: string;
  registration: ContextGraphSchemaRegistration;
  registry: PluginRegistry;
}) {
  const host = params.registry.contextGraphHost;
  if (host) {
    return host.createSchemaRegistrar(
      params.events,
      params.moduleId
    )(params.registration);
  }
  params.registry.pendingContextGraphSchemas ??= [];
  params.registry.pendingContextGraphSchemas.push({
    events: params.events,
    moduleId: params.moduleId,
    registration: params.registration,
  });
  return;
}

function pushOwnedEventRegistration(params: {
  entry: PluginEventRegistration;
  record: PluginRecord;
  registry: PluginRegistry;
}) {
  const key = `${params.entry.namespace}:${String(params.entry.eventName)}`;
  switch (params.entry.listenerKind) {
    case "filter":
      params.record.eventFilters ??= [];
      params.registry.eventFilters ??= [];
      params.record.eventFilters.push(key);
      params.registry.eventFilters.push(
        params.entry as PluginEventRegistration<PluginEventFilter>
      );
      return;
    case "interceptor":
      params.record.eventInterceptors ??= [];
      params.registry.eventInterceptors ??= [];
      params.record.eventInterceptors.push(key);
      params.registry.eventInterceptors.push(
        params.entry as PluginEventRegistration<PluginEventInterceptor>
      );
      return;
    default:
      params.record.eventListeners ??= [];
      params.registry.eventListeners ??= [];
      params.record.eventListeners.push(key);
      params.registry.eventListeners.push(
        params.entry as PluginEventRegistration<PluginEventObserver>
      );
  }
}

function getRegisteredEventCapabilities(
  registry: PluginRegistry,
  pluginId: string
) {
  return [
    ...(registry.eventListeners ?? []),
    ...(registry.eventFilters ?? []),
    ...(registry.eventInterceptors ?? []),
  ]
    .filter((entry) => entry.pluginId === pluginId)
    .map((entry) => entry.capability);
}

async function shouldInvokeEventRegistration(params: {
  context: PluginEventContext;
  payload: PluginEventPayload;
  record: PluginRecord;
  registration: PluginEventHandlerRegistration;
  registry: PluginRegistry;
  resolveTenantPluginOverrides?: (
    tenantId: string
  ) => Promise<Record<string, boolean>>;
}) {
  void params.payload;
  const pluginId = params.registration.pluginId ?? params.record.id;
  const registrationGenerationId =
    params.registration.receipt.generationId ??
    params.registration.sourceInfo?.generationId;
  const pluginRecord = params.registry.plugins.find((p) => p.id === pluginId);
  const activeGenerationId =
    pluginRecord?.generationId ?? params.registry.generationId;
  if (
    activeGenerationId !== undefined &&
    registrationGenerationId !== undefined &&
    registrationGenerationId !== activeGenerationId
  ) {
    params.registry.diagnostics.push({
      level: "warn",
      code: "plugin.runtime.stale_generation",
      pluginId,
      sourceInfo: params.registration.sourceInfo,
      message: `Stale event listener skipped for ${String(
        params.registration.eventName
      )}`,
      remediation:
        "Restart the API or unload the previous plugin generation before dispatching events.",
    });
    return false;
  }
  const tenantId = params.context.tenantId;
  if (params.registration.tenantScoped && !tenantId) {
    params.registry.diagnostics.push({
      level: "warn",
      code: "plugin.event_listener.missing_tenant",
      pluginId,
      sourceInfo: params.registration.sourceInfo,
      message: `Tenant-scoped event listener skipped without tenant context: ${String(
        params.registration.eventName
      )}`,
      remediation:
        "Emit tenant-scoped module events with an explicit tenantId in the event context.",
    });
    return false;
  }

  const tenantPluginOverrides =
    tenantId && params.resolveTenantPluginOverrides
      ? await params.resolveTenantPluginOverrides(tenantId)
      : {};
  const capabilityResolution = resolvePluginCapability({
    registry: params.registry,
    pluginId,
    capability: params.registration.capability,
    contributionKind: "event_listener",
    registeredCapabilities: getRegisteredEventCapabilities(
      params.registry,
      pluginId
    ),
    tenantId,
    tenantPluginOverrides,
  });
  if (!capabilityResolution.allowed) {
    params.registry.diagnostics.push(...capabilityResolution.diagnostics);
    return false;
  }
  return true;
}

function handleFactoryResult(params: {
  factoryResult: PluginRuntime | Promise<void> | void;
  record: PluginRecord;
  registry: PluginRegistry;
  logger: NonNullable<LoadPluginsParams["logger"]>;
}) {
  if (
    params.factoryResult &&
    typeof (params.factoryResult as Promise<void>).then === "function"
  ) {
    void Promise.resolve(params.factoryResult).catch((err) => {
      params.record.loadError = String(err);
      params.registry.diagnostics.push({
        level: "error",
        code: "plugin.load.failed",
        pluginId: params.record.id,
        sourceInfo: createPluginSourceInfo(params.record, "server.plugin"),
        message: `Plugin load failed: ${params.record.loadError}`,
        remediation:
          "Fix the plugin entry import or factory error, then restart the API.",
      });
      params.logger.error(
        `Plugin ${params.record.id} load failed: ${params.record.loadError}`
      );
    });
  }
}

export interface RegisterPluginFactoryResult {
  loadError?: string;
  loaded: boolean;
  pluginId: string;
}

export function getPluginRuntimeConfig(params: {
  config: Record<string, unknown>;
  pluginId: string;
}): Record<string, unknown> {
  const pluginsConfig = params.config.plugins as
    | Record<string, { config?: Record<string, unknown> }>
    | undefined;
  return pluginsConfig?.[params.pluginId]?.config ?? {};
}

export function registerPluginFactory(params: {
  config: Record<string, unknown>;
  eventsRuntime?: PluginEventsRuntime;
  logger: NonNullable<LoadPluginsParams["logger"]>;
  manifest: PluginManifest;
  record: PluginRecord;
  registry: PluginRegistry;
  resolveTenantPluginOverrides?: (
    tenantId: string
  ) => Promise<Record<string, boolean>>;
  searchIndexRegistry?: SearchIndexRegistry;
}): RegisterPluginFactoryResult {
  const createApi = params.registry.createApi;
  if (!createApi) {
    params.record.loadError = "plugin registry cannot create plugin APIs";
    params.registry.diagnostics.push({
      level: "error",
      code: "plugin.load.failed",
      pluginId: params.record.id,
      sourceInfo: createPluginSourceInfo(params.record, "server.plugin"),
      message: `Plugin load failed: ${params.record.loadError}`,
      remediation:
        "Reload the plugin from a registry created by createPluginRegistry.",
    });
    params.logger.error(
      `Plugin ${params.record.id} load failed: ${params.record.loadError}`
    );
    return {
      loaded: false,
      loadError: params.record.loadError,
      pluginId: params.record.id,
    };
  }

  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const pluginConfig = getPluginRuntimeConfig({
    config: params.config,
    pluginId: params.manifest.id,
  });
  const eventsRuntime =
    params.eventsRuntime ??
    params.registry.eventsRuntime ??
    createPluginEventsRuntime();
  params.registry.eventsRuntime = eventsRuntime;
  const searchIndexRegistry =
    params.searchIndexRegistry ??
    params.registry.searchIndexRegistry ??
    createSearchIndexRegistry();
  params.registry.searchIndexRegistry = searchIndexRegistry;
  try {
    const mod = jiti(params.record.source) as { default?: LoadedPluginEntry };
    const def = mod?.default;
    if (typeof def === "function") {
      const api = createApi(params.record, pluginConfig);
      const pluginApi = createPluginApi({
        manifest: params.manifest,
        pluginApi: api,
        pluginConfig,
        record: params.record,
        registry: params.registry,
        eventsRuntime,
        resolveTenantPluginOverrides: params.resolveTenantPluginOverrides,
        searchIndexRegistry,
      });
      const factoryResult = def(pluginApi);
      handleFactoryResult({
        factoryResult,
        record: params.record,
        registry: params.registry,
        logger: params.logger,
      });
      params.record.loaded = true;
      return { loaded: true, pluginId: params.record.id };
    }

    const receivedKind =
      def === undefined ? "undefined" : def === null ? "null" : typeof def;
    params.logger.warn(
      `Plugin ${params.manifest.id}: default export must be an EngentyPluginFactory function (received ${receivedKind})`
    );
    params.record.loadError = "no default EngentyPluginFactory export";
    params.registry.diagnostics.push({
      level: "error",
      code: "plugin.entry.missing",
      pluginId: params.manifest.id,
      sourceInfo: createPluginSourceInfo(params.record, "server.plugin"),
      message:
        "Plugin entry did not export a default EngentyPluginFactory function.",
      remediation:
        "Export a default EngentyPluginFactory function or update the manifest server.entry to the correct module.",
    });
  } catch (err) {
    params.record.loadError = String(err);
    params.registry.diagnostics.push({
      level: "error",
      code: "plugin.load.failed",
      pluginId: params.manifest.id,
      sourceInfo: createPluginSourceInfo(params.record, "server.plugin"),
      message: `Plugin load failed: ${params.record.loadError}`,
      remediation:
        "Fix the plugin entry import or factory error, then restart the API.",
    });
    params.logger.error(
      `Plugin ${params.manifest.id} load failed: ${params.record.loadError}`
    );
  }

  return {
    loaded: false,
    loadError: params.record.loadError,
    pluginId: params.record.id,
  };
}

/**
 * Reports capability-ceiling violations for catalog-tier plugins
 * (`tier: "plugin"`) as error diagnostics. Modules are unrestricted.
 * Call after a plugin's factory has registered its contributions.
 */
export function enforcePluginTier(params: {
  logger: NonNullable<LoadPluginsParams["logger"]>;
  record: PluginRecord;
  registry: PluginRegistry;
}): void {
  const tier = resolvePluginTier(params.record.tier);
  const violations = evaluatePluginTierViolations({
    pluginId: params.record.id,
    registry: params.registry,
    tier,
  });
  if (violations.length === 0) {
    return;
  }
  for (const violation of violations) {
    params.registry.diagnostics.push({
      level: "error",
      code: "plugin.tier.capability_blocked",
      pluginId: params.record.id,
      sourceInfo: createPluginSourceInfo(params.record, "server.plugin"),
      message: `tier "plugin" may not register ${violation.surface} (found ${violation.count}); contribution disabled.`,
      remediation:
        'Remove the restricted contribution or promote the plugin to a module (tier: "module").',
    });
    params.logger.warn(
      `Plugin ${params.record.id}: tier "plugin" may not register ${violation.surface}; contribution disabled`
    );
  }
  // Hard enforcement: dispose/remove the restricted contributions so the
  // catalog plugin cannot affect other modules' flows or the host process.
  stripTierRestrictedContributions({
    pluginId: params.record.id,
    registry: params.registry,
  });
  params.record.eventFilters = [];
  params.record.eventInterceptors = [];
  params.record.cliCommands = [];
  params.record.profilePolicies = [];
  params.record.resultPolicies = [];
}

export function createPluginRecord(params: {
  candidate: PluginCandidate;
  enabled: boolean;
  generationId?: number;
  manifest: PluginManifest;
  manifestPath: string;
}): PluginRecord {
  return {
    id: params.manifest.id,
    name: params.manifest.name,
    description: params.manifest.description,
    version: params.manifest.version,
    sourceType: params.candidate.sourceType,
    rootDir: params.candidate.rootDir,
    source: params.candidate.source,
    packageName: params.candidate.packageName,
    manifestPath: params.manifestPath,
    kind: params.manifest.kind,
    category: params.manifest.category,
    placement: params.manifest.placement,
    tier: params.manifest.tier,
    capabilities: params.manifest.capabilities,
    ...(params.manifest.connections
      ? { connections: params.manifest.connections }
      : {}),
    ...(params.manifest.mountOperation
      ? { mountOperation: params.manifest.mountOperation }
      : {}),
    ui: params.manifest.ui,
    provides: params.manifest.provides ?? [],
    requires: params.manifest.requires ?? [],
    optional: params.manifest.optional ?? [],
    enabled: params.enabled,
    loaded: false,
    dependencies: [],
    cliCommands: [],
    eventFilters: [],
    eventInterceptors: [],
    eventListeners: [],
    services: [],
    httpRoutes: [],
    gatewayMethods: [],
    moduleOperations: [],
    profilePolicies: [],
    resultPolicies: [],
    testDataTypes: [],
    featureFlags: [],
    queues: [],
    generationId: params.generationId,
  };
}

export function loadPlugins(params: LoadPluginsParams): PluginRegistry {
  const modulesDir = params.modulesDir ?? resolveModulesDir();
  const packagesDir = params.packagesDir ?? resolvePackagesDir();
  const config = params.config ?? {};
  const dataDir = params.dataDir ?? path.resolve(process.cwd(), "data");
  const logger = params.logger ?? defaultLogger;
  const resolveTenantPluginOverrides = params.tenantPluginOverrides
    ? (tenantId: string) => params.tenantPluginOverrides!.getOverrides(tenantId)
    : undefined;
  const pluginStatePath = resolvePluginStatePath(dataDir);
  const pluginState = readPluginState(pluginStatePath);

  const resolvePath = (p: string) => path.resolve(dataDir, p);
  const databaseAdapter = createDatabaseAdapter(config);
  const getServiceDb = () => databaseAdapter;
  const tenantDbConfig = resolveTenantDbConfig(config);
  const tenantDbFactory = tenantDbConfig
    ? createTenantDbFactory(tenantDbConfig)
    : null;
  if (databaseAdapter && !tenantDbFactory) {
    logger.warn(
      "Tenant-locked DB lane unavailable (missing anon key or JWT secret); modules fall back to getServiceDb. See PLAN-tenant-isolation-a-rls-seam.md."
    );
  }
  const getTenantDb = tenantDbFactory
    ? (auth: { tenantId: string }) => tenantDbFactory.getTenantDb(auth)
    : undefined;
  const eventsRuntime = createPluginEventsRuntime();

  const { registry } = createPluginRegistry({
    assertServerLanePreflight: tenantDbFactory?.assertServerLanePreflight,
    config,
    dataDir,
    getServiceDb,
    getTenantDb,
    resolvePath,
    logger,
  });
  registry.eventsRuntime = eventsRuntime;
  // Seed core built-in role profiles (superadmin/admin/member/agent.base) so
  // resolveGrants can map base roles → capability strings. Modules add their
  // own via server.registerRoleProfiles during load.
  if (registry.roleProfiles) {
    registerCoreRoleProfiles(registry.roleProfiles);
  }

  const discovery = discoverPlugins({ modulesDir, packagesDir });

  // Level A: modules installed from the registry live in node_modules, not the
  // workspace scan roots. Resolve the enabled ones and append them as package
  // candidates so they load exactly like workspace modules (server + AI face
  // are jiti-loaded from the package's source, which ships in the tarball).
  const registrySlugs = new Set<string>();
  try {
    const repoRoot = path.dirname(modulesDir);
    const { plugins } = readEngentyPluginsManifest(repoRoot);
    for (const [slug, spec] of Object.entries(plugins)) {
      if (spec.source === "registry") {
        registrySlugs.add(slug);
      }
    }
    if (registrySlugs.size > 0) {
      // A registry module shadows any lingering workspace checkout of the same
      // slug (e.g. mid-migration from modules/<slug> to a registry install),
      // so drop the workspace candidate before appending the registry one.
      discovery.candidates = discovery.candidates.filter(
        (candidate) =>
          !(
            candidate.sourceType === "module" &&
            registrySlugs.has(candidate.idHint)
          )
      );
      for (const mod of resolveEnabledModules(repoRoot, { strict: false })) {
        if (mod.source !== "registry") {
          continue;
        }
        const candidate = discoverPluginPackageRoot({
          rootDir: mod.dir,
          sourceType: "package",
        });
        if (candidate) {
          discovery.candidates.push(candidate);
        }
      }
    }
  } catch {
    // No resolvable repo root / config (some unit-test fixtures) — skip.
  }

  if (discovery.candidates.length === 0) {
    logger.debug(`No plugins found in ${modulesDir} / ${packagesDir}`);
  }

  // Fail loud: an enabled workspace module with no discovered candidate is
  // almost always a path-resolution regression (e.g. a nested provider the
  // discovery scan missed), which would otherwise be a silent "never loaded".
  try {
    const repoRoot = path.dirname(modulesDir);
    // Compare by on-disk directory, not package name — a module's package name
    // (e.g. @engenty/files-ui) does not always match its enabled slug (files).
    const discoveredRootDirs = new Set(
      discovery.candidates
        .filter((candidate) => candidate.sourceType === "module")
        .map((candidate) => path.resolve(candidate.rootDir))
    );
    for (const slug of enabledModuleSlugSetFromDir(modulesDir)) {
      // Registry modules resolve from node_modules, not the workspace scan;
      // they are appended as candidates above and validated by their own
      // resolution, so they are exempt from the workspace-discovery guard.
      if (registrySlugs.has(slug)) {
        continue;
      }
      if (
        discoveredRootDirs.has(path.resolve(resolveModuleDir(repoRoot, slug)))
      ) {
        continue;
      }
      registry.diagnostics.push({
        level: "error",
        code: "plugin.discovery.missing",
        pluginId: slug,
        message: `Enabled module "${slug}" was not discovered under ${modulesDir} (checked modules/${slug} and modules/*/providers/*).`,
        remediation:
          "Confirm the module directory exists and its engenty.plugin.json id matches the enabled slug.",
      });
      logger.warn(`Enabled module "${slug}" was not discovered on disk`);
    }
  } catch {
    // No resolvable repo root (some unit-test fixtures) — skip the guard.
  }

  for (const candidate of discovery.candidates) {
    const manifestRes = loadPluginManifest(candidate.rootDir);
    if (!manifestRes.ok) {
      registry.diagnostics.push({
        level: "error",
        code: manifestRes.code,
        pluginId: candidate.idHint,
        sourceInfo: {
          pluginId: candidate.idHint,
          generationId: registry.generationId,
          packageName: candidate.packageName,
          sourceType: candidate.sourceType,
          rootDir: candidate.rootDir,
          source: candidate.source,
          manifestPath: manifestRes.manifestPath,
          manifestId: candidate.idHint,
          registrationKind: "server.plugin",
        },
        message: manifestRes.error,
        remediation:
          manifestRes.code === "plugin.manifest.missing"
            ? "Add engenty.plugin.json to the plugin package root when overrides are required."
            : "Fix engenty.plugin.json and required fields (id, server.entry or ui.entry).",
      });
      logger.warn(`Plugin ${candidate.idHint}: ${manifestRes.error}`);
      continue;
    }

    const manifest = manifestRes.manifest;
    const stateEntry = pluginState.plugins[manifest.id];
    const enabled = isMandatoryPlugin(manifest.id)
      ? true
      : (stateEntry?.enabled ?? true);
    const record = createPluginRecord({
      candidate,
      enabled,
      generationId: registry.generationId,
      manifest,
      manifestPath: manifestRes.manifestPath,
    });
    record.sourceInfo = createPluginSourceInfo(record, "server.plugin");
    registry.plugins.push(record);

    for (const diagnostic of manifestRes.diagnostics) {
      registry.diagnostics.push({
        level: diagnostic.level,
        code: diagnostic.code,
        pluginId: manifest.id,
        sourceInfo: record.sourceInfo,
        message: diagnostic.message,
        remediation:
          "Align engenty.plugin.json version with package.json, or drop one of the versions if duplication is unintended.",
      });
      logger.warn(`Plugin ${manifest.id}: ${diagnostic.message}`);
    }

    if (!enabled) {
      logger.info(`Plugin ${manifest.id} is disabled and will not be loaded`);
      continue;
    }

    registerPluginFactory({
      config,
      eventsRuntime,
      logger,
      manifest,
      record,
      registry,
      resolveTenantPluginOverrides,
    });

    enforcePluginTier({ logger, record, registry });
  }

  for (const record of registry.plugins) {
    record.dependencies = record.requires ?? [];
  }

  if (params.startRegisteredServices !== false) {
    void startRegisteredServices(registry, {
      config,
      pluginConfig: {},
      dataDir,
      resolvePath,
      logger,
    });
  }

  return registry;
}
