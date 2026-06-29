import {
  registerAiRegistration as addAiRegistration,
  unregisterAiRegistrationsByOwner,
} from "@engenty/ai-core";
import { dedupeDefinitions } from "@engenty/feature-flags";
import {
  createFileStorageService,
  createSupabaseFileStorageProvider,
} from "@engenty/file-storage";
import type {
  CliRegistrar,
  ContextGraphHost,
  ContextGraphSchemaRegistration,
  FeatureFlagDefinition,
  PluginAiRegistration,
  PluginDiagnostic,
  PluginEventsApi,
  PluginEventFilter,
  PluginEventInterceptor,
  PluginEventName,
  PluginEventObserver,
  PluginEventRegistrationReceipt,
  PluginEventsRuntime,
  PluginGatewayMethod,
  PluginHttpRoute,
  PluginOperationMeta,
  PluginProfilePolicy,
  PluginRegistrationReceipt,
  PluginResultPolicy,
  PluginServerApi,
  PluginServerOperation,
  PluginService,
  PluginSourceInfo,
  PluginTestDataRegistration,
  QueueDefinition,
} from "@engenty/plugin-sdk";
import { assertStrictToolId } from "@engenty/plugin-sdk";
import { createQueueService } from "@engenty/queue";
import type { SearchIndexRegistry } from "@engenty/search-index";
import type { PluginManifestCapabilityFlags, PluginTier } from "./manifest.js";

/**
 * Internal runtime API object built by the registry for each plugin record.
 * The loader wraps `server` into the public {@link EngentyPluginApi}; `config`
 * is the host runtime config exposed as `engenty.config.runtimeConfig`.
 */
export interface PluginRuntimeApi {
  config: Record<string, unknown>;
  pluginConfig: Record<string, unknown>;
  server: PluginServerApi;
}

export interface PluginRecord {
  aiRegistrations?: string[];
  capabilities?: PluginManifestCapabilityFlags;
  cliCommands: string[];
  dependencies: string[];
  description?: string;
  enabled: boolean;
  eventFilters?: string[];
  eventInterceptors?: string[];
  eventListeners?: string[];
  featureFlags: string[];
  /**
   * Per-record names of core host gateway methods (pluginId "core"). Plugins no
   * longer author gateway methods — they register operations — so this stays
   * empty for plugin records and is retained for registry/API record symmetry.
   */
  gatewayMethods: string[];
  generationId?: number;
  httpRoutes: string[];
  id: string;
  kind?: string;
  loadError?: string;
  loaded: boolean;
  manifestPath: string;
  moduleOperations: string[];
  name?: string;
  optional?: string[];
  packageName?: string;
  profilePolicies?: string[];
  provides?: string[];
  queues: string[];
  requires?: string[];
  resultPolicies?: string[];
  rootDir: string;
  services: string[];
  source: string;
  sourceInfo?: PluginSourceInfo;
  sourceType: "builtin" | "module" | "package";
  testDataTypes: string[];
  /** Capability tier (see plugin-tier-policy). Defaults to "module" when unset. */
  tier?: PluginTier;
  ui?: {
    assetOrigins?: string[];
    enabled?: boolean;
    entry: string;
    export?: string;
    load?: "runtime" | "workspace";
    staticAssets?: string[];
  };
  version?: string;
}

export type PluginDiagnosticCode =
  | "plugin.entry.missing"
  | "plugin.load.failed"
  | "plugin.manifest.version_mismatch"
  | "plugin.registration.duplicate_feature_flag"
  | "plugin.registration.duplicate_gateway_method"
  | "plugin.registration.duplicate_operation"
  | "plugin.registration.duplicate_queue"
  | "plugin.registration.duplicate_route"
  | "plugin.registration.duplicate_service"
  | "plugin.registration.duplicate_snapshot_provider"
  | "plugin.registration.duplicate_sync_model"
  | "plugin.registration.duplicate_test_data_type"
  | "plugin.registration.missing_id"
  | "plugin.registration.missing_name";

export function createPluginSourceInfo(
  record: PluginRecord,
  registrationKind: string
): PluginSourceInfo {
  return {
    pluginId: record.id,
    generationId: record.generationId,
    packageName: record.packageName,
    version: record.version,
    sourceType: record.sourceType ?? "module",
    rootDir: record.rootDir ?? "",
    source: record.source,
    manifestPath: record.manifestPath ?? "",
    manifestId: record.id,
    registrationKind,
  };
}

function createRegistrationReceipt(params: {
  key: string;
  kind: string;
  sourceInfo: PluginSourceInfo;
}): PluginRegistrationReceipt {
  return {
    id: `${params.sourceInfo.pluginId}:${params.kind}:${params.key}`,
    pluginId: params.sourceInfo.pluginId,
    generationId: params.sourceInfo.generationId,
    kind: params.kind,
    sourceInfo: params.sourceInfo,
    dispose: () => {},
  };
}

function sourceInfoFor(record: PluginRecord, registrationKind: string) {
  if (record.sourceInfo?.registrationKind === registrationKind) {
    return record.sourceInfo;
  }
  return createPluginSourceInfo(record, registrationKind);
}

function isStaleGenerationEntry(
  registry: PluginRegistry,
  entry: { sourceInfo?: PluginSourceInfo }
) {
  const generationId = entry.sourceInfo?.generationId;
  const pluginId = entry.sourceInfo?.pluginId;
  if (typeof generationId !== "number") {
    return false;
  }
  if (!pluginId) {
    return (
      typeof registry.generationId === "number" &&
      generationId !== registry.generationId
    );
  }
  const pluginRecord = registry.plugins.find((p) => p.id === pluginId);
  const activeGenerationId = pluginRecord?.generationId;
  return (
    typeof activeGenerationId === "number" &&
    generationId !== activeGenerationId
  );
}

function recordStaleGenerationDiagnostic(params: {
  action: string;
  entry: { pluginId: string; sourceInfo?: PluginSourceInfo };
  registry: PluginRegistry;
}) {
  params.registry.diagnostics.push({
    level: "warn",
    code: "plugin.runtime.stale_generation",
    pluginId: params.entry.pluginId,
    sourceInfo: params.entry.sourceInfo,
    message: `Stale plugin generation skipped for ${params.action}`,
    remediation:
      "Restart the API or unload the previous plugin generation before invoking async plugin work.",
  });
}

export interface CliRegistration {
  commands: string[];
  pluginId: string;
  receiptId?: string;
  register: CliRegistrar;
  sourceInfo?: PluginSourceInfo;
}

export interface PluginEventRegistration<THandler = unknown> {
  capability: string;
  dispose?: PluginEventRegistrationReceipt["dispose"];
  eventName: PluginEventName;
  handler: THandler;
  listenerKind: "filter" | "interceptor" | "observer";
  namespace: "core" | "modules";
  pluginId: string;
  receiptId?: string;
  requiredCapabilities: string[];
  sourceInfo?: PluginSourceInfo;
  tenantScoped: boolean;
}

export interface PluginRegistry {
  aiRegistrations: Array<{
    generationId?: number;
    moduleId: string;
    pluginId: string;
    sourceInfo?: PluginSourceInfo;
  }>;
  cliRegistrars: CliRegistration[];
  // Context-graph host installed by the `@engenty/context-graph` plugin via
  // `engenty.server.registerContextGraphHost(...)`. Core delegates the
  // `contextGraph` / schema / source surfaces to it without importing the
  // concrete package. Unset until the host plugin loads.
  contextGraphHost?: ContextGraphHost;
  // Schema registrations made by consumer plugins before the host loaded
  // (modules discover before packages). Flushed when the host installs.
  pendingContextGraphSchemas?: Array<{
    events: PluginEventsApi;
    moduleId: string;
    registration: ContextGraphSchemaRegistration;
  }>;
  createApi?: (
    record: PluginRecord,
    pluginConfig: Record<string, unknown>
  ) => PluginRuntimeApi;
  diagnostics: PluginDiagnostic[];
  eventFilters?: PluginEventRegistration<PluginEventFilter>[];
  eventInterceptors?: PluginEventRegistration<PluginEventInterceptor>[];
  eventListeners?: PluginEventRegistration<PluginEventObserver>[];
  eventsRuntime?: PluginEventsRuntime;
  featureFlags: FeatureFlagDefinition[];
  /**
   * Core host gateway methods (pluginId "core"), registered directly by
   * `register-methods.ts` and dispatched by `method-invoker.ts` /
   * `gateway-routes.ts`. Not part of the plugin-authoring surface.
   */
  gatewayMethods: Array<{
    pluginId: string;
    method: PluginGatewayMethod;
    receiptId?: string;
    source: string;
    sourceInfo?: PluginSourceInfo;
    pluginConfig: Record<string, unknown>;
  }>;
  generationId?: number;
  /** Process-shared database adapter accessor; required when wiring shared
   * server-side singletons (e.g. context-graph) that need the same handle
   * the plugin APIs use. */
  getDatabaseAdapter?: () => unknown | null;
  httpRoutes: Array<{
    pluginId: string;
    route: PluginHttpRoute;
    receiptId?: string;
    source: string;
    sourceInfo?: PluginSourceInfo;
    pluginConfig: Record<string, unknown>;
  }>;
  moduleOperations: Array<{
    pluginId: string;
    operationId: string;
    methodName: string;
    description?: string;
    handler: PluginServerOperation["handler"];
    inputSchema?: PluginServerOperation["inputSchema"];
    operation: Required<
      Pick<
        PluginOperationMeta,
        | "moduleId"
        | "operationId"
        | "riskLevel"
        | "idempotent"
        | "dryRunSupported"
        | "requiresApproval"
      >
    > & {
      requiredCapabilities: string[];
    };
    outputSchema?: PluginServerOperation["outputSchema"];
    receiptId?: string;
    source: string;
    sourceInfo?: PluginSourceInfo;
    summary?: string;
    pluginConfig: Record<string, unknown>;
  }>;
  plugins: PluginRecord[];
  profilePolicies?: Array<{
    pluginId: string;
    policy: PluginProfilePolicy;
    receiptId?: string;
    source: string;
    sourceInfo?: PluginSourceInfo;
    pluginConfig: Record<string, unknown>;
  }>;
  /** Queue display metadata registered by plugins. */
  queueDefinitions: Array<{
    pluginId: string;
    queue: QueueDefinition;
    receiptId?: string;
    sourceInfo?: PluginSourceInfo;
  }>;
  /** Queue job handlers registered by plugins. */
  queueHandlers: Map<
    string,
    {
      handler: (
        payload: Record<string, unknown>,
        meta: { msgId: number; readCount: number }
      ) => Promise<void>;
      pluginId: string;
      receiptId?: string;
      sourceInfo?: PluginSourceInfo;
    }
  >;
  removeOwnedRegistrations?: (
    pluginId: string
  ) => Promise<RemoveOwnedRegistrationsResult>;
  resultPolicies?: Array<{
    pluginId: string;
    policy: PluginResultPolicy;
    receiptId?: string;
    source: string;
    sourceInfo?: PluginSourceInfo;
    pluginConfig: Record<string, unknown>;
  }>;
  // Shared registry of `SearchIndexProvider`s (chat-search, contacts, kb,
  // api-catalog). Populated by `engenty.server.registerSearchIndexProvider(...)`
  // and consumed by the unified `/api/search-index/*` operator surface.
  searchIndexRegistry?: SearchIndexRegistry;
  services: Array<{
    pluginId: string;
    service: PluginService;
    receiptId?: string;
    source: string;
    sourceInfo?: PluginSourceInfo;
    pluginConfig: Record<string, unknown>;
  }>;
  testDataTypes: Array<{
    pluginId: string;
    registration: PluginTestDataRegistration;
    receiptId?: string;
    source: string;
    sourceInfo?: PluginSourceInfo;
    pluginConfig: Record<string, unknown>;
  }>;
}

export interface RemoveOwnedRegistrationsResult {
  blocked: boolean;
  disposeFailureCount: number;
  disposeFailures: Array<{
    kind: string;
    message: string;
    receiptId?: string;
    sourceInfo?: PluginSourceInfo;
  }>;
  generationId?: number;
  pluginId: string;
  removed: {
    aiRegistrations: number;
    cliRegistrars: number;
    eventFilters: number;
    eventInterceptors: number;
    eventListeners: number;
    featureFlags: number;
    gatewayMethods: number;
    httpRoutes: number;
    moduleOperations: number;
    profilePolicies: number;
    queueDefinitions: number;
    queueHandlers: number;
    resultPolicies: number;
    services: number;
    testDataTypes: number;
  };
  totalRemoved: number;
}

export interface CreateRegistryParams {
  config: Record<string, unknown>;
  dataDir: string;
  generationId?: number;
  getDatabaseAdapter?: () => unknown | null;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  resolvePath: (p: string) => string;
}

function removeArrayEntriesByPluginId<T extends { pluginId?: string }>(
  entries: T[] | undefined,
  pluginId: string
): number {
  if (!entries) {
    return 0;
  }
  let nextIndex = 0;
  let removed = 0;
  for (const entry of entries) {
    if (entry.pluginId === pluginId) {
      removed += 1;
      continue;
    }
    entries[nextIndex] = entry;
    nextIndex += 1;
  }
  entries.length = nextIndex;
  return removed;
}

function removeQueueHandlersByPluginId(
  handlers: PluginRegistry["queueHandlers"],
  pluginId: string
): number {
  let removed = 0;
  for (const [queueName, entry] of handlers) {
    if (entry.pluginId === pluginId) {
      handlers.delete(queueName);
      removed += 1;
    }
  }
  return removed;
}

function emptyOwnedRemovalCounts(): RemoveOwnedRegistrationsResult["removed"] {
  return {
    aiRegistrations: 0,
    cliRegistrars: 0,
    eventFilters: 0,
    eventInterceptors: 0,
    eventListeners: 0,
    featureFlags: 0,
    gatewayMethods: 0,
    httpRoutes: 0,
    moduleOperations: 0,
    profilePolicies: 0,
    queueDefinitions: 0,
    queueHandlers: 0,
    resultPolicies: 0,
    services: 0,
    testDataTypes: 0,
  };
}

function formatDisposeError(err: unknown) {
  return err instanceof Error && err.message ? err.message : String(err);
}

function disposeFailureKind(entry: {
  receiptId?: string;
  sourceInfo?: PluginSourceInfo;
}) {
  return (
    entry.sourceInfo?.registrationKind ?? entry.receiptId ?? "registration"
  );
}

async function collectOwnedDisposeFailures(
  registry: PluginRegistry,
  pluginId: string,
  entries: Array<{
    dispose?: () => Promise<void> | void;
    pluginId?: string;
    receiptId?: string;
    sourceInfo?: PluginSourceInfo;
  }>,
  logger?: CreateRegistryParams["logger"]
): Promise<RemoveOwnedRegistrationsResult["disposeFailures"]> {
  const failures: RemoveOwnedRegistrationsResult["disposeFailures"] = [];
  for (const entry of entries) {
    if (entry.pluginId !== pluginId || !entry.dispose) {
      continue;
    }
    try {
      await entry.dispose();
    } catch (err) {
      const message = formatDisposeError(err);
      const failure = {
        kind: disposeFailureKind(entry),
        message,
        receiptId: entry.receiptId,
        sourceInfo: entry.sourceInfo,
      };
      failures.push(failure);
      const diagnostic: PluginDiagnostic = {
        level: "error",
        code: "plugin.dispose.failed",
        pluginId,
        sourceInfo: entry.sourceInfo,
        message: `Dispose failed (${failure.kind}): ${message}`,
        remediation:
          "Fix the registration disposer, then retry plugin reload or restart the API process.",
      };
      registry.diagnostics.push(diagnostic);
      logger?.error(diagnostic.message);
    }
  }
  return failures;
}

async function collectOwnedDisposableEntries(
  registry: PluginRegistry,
  pluginId: string,
  logger?: CreateRegistryParams["logger"]
) {
  return await collectOwnedDisposeFailures(
    registry,
    pluginId,
    [
      ...(registry.cliRegistrars ?? []),
      ...(registry.eventFilters ?? []),
      ...(registry.eventInterceptors ?? []),
      ...(registry.eventListeners ?? []),
      ...(registry.featureFlags ?? []),
      ...(registry.gatewayMethods ?? []),
      ...(registry.httpRoutes ?? []),
      ...(registry.moduleOperations ?? []),
      ...(registry.profilePolicies ?? []),
      ...(registry.queueDefinitions ?? []),
      ...(registry.resultPolicies ?? []),
      ...(registry.services ?? []),
      ...(registry.testDataTypes ?? []),
    ],
    logger
  );
}

function removeAiRegistrationsByOwner(
  registry: PluginRegistry,
  params: { generationId?: number; pluginId: string }
): number {
  const unregistered = unregisterAiRegistrationsByOwner(params).removed;
  const mirrorEntries = removeArrayEntriesByPluginId(
    registry.aiRegistrations,
    params.pluginId
  );
  return Math.max(unregistered, mirrorEntries);
}

function resetPluginRecordContributions(record: PluginRecord) {
  record.aiRegistrations = [];
  record.cliCommands = [];
  record.eventFilters = [];
  record.eventInterceptors = [];
  record.eventListeners = [];
  record.featureFlags = [];
  record.gatewayMethods = [];
  record.httpRoutes = [];
  record.moduleOperations = [];
  record.profilePolicies = [];
  record.queues = [];
  record.resultPolicies = [];
  record.services = [];
  record.testDataTypes = [];
}

export async function removeOwnedRegistrations(
  registry: PluginRegistry,
  pluginId: string,
  options?: { logger?: CreateRegistryParams["logger"] }
): Promise<RemoveOwnedRegistrationsResult> {
  const record = registry.plugins.find((plugin) => plugin.id === pluginId);
  const disposeFailures = await collectOwnedDisposableEntries(
    registry,
    pluginId,
    options?.logger
  );
  if (disposeFailures.length > 0) {
    return {
      blocked: true,
      disposeFailureCount: disposeFailures.length,
      disposeFailures,
      generationId: registry.generationId,
      pluginId,
      removed: emptyOwnedRemovalCounts(),
      totalRemoved: 0,
    };
  }
  const removed = {
    aiRegistrations: removeAiRegistrationsByOwner(registry, {
      generationId: record?.generationId,
      pluginId,
    }),
    cliRegistrars: removeArrayEntriesByPluginId(
      registry.cliRegistrars,
      pluginId
    ),
    eventFilters: removeArrayEntriesByPluginId(registry.eventFilters, pluginId),
    eventInterceptors: removeArrayEntriesByPluginId(
      registry.eventInterceptors,
      pluginId
    ),
    eventListeners: removeArrayEntriesByPluginId(
      registry.eventListeners,
      pluginId
    ),
    featureFlags: removeArrayEntriesByPluginId(registry.featureFlags, pluginId),
    gatewayMethods: removeArrayEntriesByPluginId(
      registry.gatewayMethods,
      pluginId
    ),
    httpRoutes: removeArrayEntriesByPluginId(registry.httpRoutes, pluginId),
    moduleOperations: removeArrayEntriesByPluginId(
      registry.moduleOperations,
      pluginId
    ),
    profilePolicies: removeArrayEntriesByPluginId(
      registry.profilePolicies,
      pluginId
    ),
    queueDefinitions: removeArrayEntriesByPluginId(
      registry.queueDefinitions,
      pluginId
    ),
    queueHandlers: removeQueueHandlersByPluginId(
      registry.queueHandlers,
      pluginId
    ),
    resultPolicies: removeArrayEntriesByPluginId(
      registry.resultPolicies,
      pluginId
    ),
    services: removeArrayEntriesByPluginId(registry.services, pluginId),
    testDataTypes: removeArrayEntriesByPluginId(
      registry.testDataTypes,
      pluginId
    ),
  };
  if (record) {
    resetPluginRecordContributions(record);
  }
  return {
    blocked: false,
    disposeFailureCount: 0,
    disposeFailures: [],
    generationId: registry.generationId,
    pluginId,
    removed,
    totalRemoved: Object.values(removed).reduce((sum, count) => sum + count, 0),
  };
}

export function createPluginRegistry(params: CreateRegistryParams): {
  registry: PluginRegistry;
  createApi: (
    record: PluginRecord,
    pluginConfig: Record<string, unknown>
  ) => PluginRuntimeApi;
} {
  const generationId = params.generationId ?? 1;
  const registry: PluginRegistry = {
    generationId,
    getDatabaseAdapter: params.getDatabaseAdapter,
    plugins: [],
    aiRegistrations: [],
    cliRegistrars: [],
    eventFilters: [],
    eventInterceptors: [],
    eventListeners: [],
    httpRoutes: [],
    gatewayMethods: [],
    moduleOperations: [],
    profilePolicies: [],
    resultPolicies: [],
    services: [],
    testDataTypes: [],
    diagnostics: [],
    featureFlags: [],
    queueDefinitions: [],
    queueHandlers: new Map(),
  };
  registry.removeOwnedRegistrations = (pluginId) =>
    removeOwnedRegistrations(registry, pluginId, { logger: params.logger });

  const pushDiagnostic = (diag: PluginDiagnostic) => {
    registry.diagnostics.push(diag);
    if (diag.level === "error") {
      params.logger.error(diag.message);
    } else {
      params.logger.warn(diag.message);
    }
  };

  const registerCli = (
    record: PluginRecord,
    registrar: CliRegistrar,
    opts?: { commands?: string[] }
  ) => {
    const commands = (opts?.commands ?? [])
      .map((c) => c.trim())
      .filter(Boolean);
    const sourceInfo = sourceInfoFor(record, "server.cliRegistrar");
    const receipt = createRegistrationReceipt({
      key: commands.join(",") || String(registry.cliRegistrars.length + 1),
      kind: "server.cliRegistrar",
      sourceInfo,
    });
    record.cliCommands.push(...commands);
    registry.cliRegistrars.push({
      pluginId: record.id,
      register: registrar,
      commands,
      receiptId: receipt.id,
      sourceInfo,
    });
  };

  const registerHttpRoute = (
    record: PluginRecord,
    route: PluginHttpRoute,
    pluginConfig: Record<string, unknown>
  ): PluginRegistrationReceipt | undefined => {
    const method = (route.method ?? "get").toLowerCase();
    const path = route.path.trim();
    const duplicate = registry.httpRoutes.find(
      (entry) =>
        entry.route.method.toLowerCase() === method &&
        entry.route.path.trim() === path
    );
    if (duplicate) {
      const sourceInfo = sourceInfoFor(record, "server.httpRoute");
      pushDiagnostic({
        level: "warn",
        code: "plugin.registration.duplicate_route",
        pluginId: record.id,
        sourceInfo,
        message: `http route already registered: ${method.toUpperCase()} ${path}`,
        remediation:
          "Choose a unique HTTP method/path pair or remove the duplicate route contribution.",
      });
      return;
    }

    const sourceInfo = sourceInfoFor(record, "server.httpRoute");
    const receipt = createRegistrationReceipt({
      key: `${method.toUpperCase()} ${path}`,
      kind: "server.httpRoute",
      sourceInfo,
    });
    record.httpRoutes.push(`${method.toUpperCase()} ${path}`);
    registry.httpRoutes.push({
      pluginId: record.id,
      route: {
        ...route,
        method: method as PluginHttpRoute["method"],
      },
      receiptId: receipt.id,
      source: record.source,
      sourceInfo,
      pluginConfig,
    });
    return receipt;
  };

  const registerOperation = (
    record: PluginRecord,
    operation: PluginServerOperation,
    pluginConfig: Record<string, unknown>
  ): PluginRegistrationReceipt | undefined => {
    const operationId = operation.operationId.trim();
    if (!operationId) {
      const sourceInfo = sourceInfoFor(record, "server.moduleOperation");
      pushDiagnostic({
        level: "warn",
        code: "plugin.registration.missing_id",
        pluginId: record.id,
        sourceInfo,
        message: "module operation registration missing operationId",
        remediation: "Provide a non-empty module operation id.",
      });
      return;
    }
    try {
      assertStrictToolId(operationId, "operationId");
    } catch (error) {
      const sourceInfo = sourceInfoFor(record, "server.moduleOperation");
      pushDiagnostic({
        level: "warn",
        code: "plugin.registration.invalid_operation_id",
        pluginId: record.id,
        sourceInfo,
        message: error instanceof Error ? error.message : String(error),
        remediation:
          "Use lowercase snake_case tool ids (module_entity_action), e.g. contacts_list.",
      });
      return;
    }
    const operationDuplicate = registry.moduleOperations.find(
      (entry) => entry.operationId === operationId
    );
    if (operationDuplicate) {
      const sourceInfo = sourceInfoFor(record, "server.moduleOperation");
      pushDiagnostic({
        level: "warn",
        code: "plugin.registration.duplicate_operation",
        pluginId: record.id,
        sourceInfo,
        message: `module operation already registered: ${operationId}`,
        remediation:
          "Choose a unique module operation id or remove the duplicate operation registration.",
      });
      return;
    }
    const normalizedOperation = {
      moduleId: operation.moduleId?.trim() || record.id,
      operationId,
      requiredCapabilities: Array.from(
        new Set(
          (operation.requiredCapabilities ?? [])
            .map((item) => item.trim())
            .filter(Boolean)
        )
      ),
      riskLevel: operation.riskLevel ?? "medium",
      idempotent: operation.idempotent ?? false,
      dryRunSupported: operation.dryRunSupported ?? false,
      requiresApproval: operation.requiresApproval ?? false,
    } as const;
    const sourceInfo = sourceInfoFor(record, "server.moduleOperation");
    const receipt = createRegistrationReceipt({
      key: normalizedOperation.operationId,
      kind: "server.moduleOperation",
      sourceInfo,
    });
    record.moduleOperations.push(operationId);
    registry.moduleOperations.push({
      pluginId: record.id,
      operationId: normalizedOperation.operationId,
      methodName: operationId,
      description: operation.description,
      handler: operation.handler,
      inputSchema: operation.inputSchema,
      operation: normalizedOperation,
      outputSchema: operation.outputSchema,
      receiptId: receipt.id,
      source: record.source,
      sourceInfo,
      summary: operation.summary,
      pluginConfig,
    });
    return receipt;
  };

  const registerService = (
    record: PluginRecord,
    service: PluginService,
    pluginConfig: Record<string, unknown>
  ) => {
    const id = service.id.trim();
    if (!id) {
      const sourceInfo = sourceInfoFor(record, "server.service");
      pushDiagnostic({
        level: "warn",
        code: "plugin.registration.missing_id",
        pluginId: record.id,
        sourceInfo,
        message: "service registration missing id",
        remediation: "Provide a non-empty service id.",
      });
      return;
    }
    const duplicate = registry.services.find(
      (entry) => entry.service.id === id
    );
    if (duplicate) {
      const sourceInfo = sourceInfoFor(record, "server.service");
      pushDiagnostic({
        level: "warn",
        code: "plugin.registration.duplicate_service",
        pluginId: record.id,
        sourceInfo,
        message: `service already registered: ${id}`,
        remediation:
          "Choose a unique service id or remove the duplicate service contribution.",
      });
      return;
    }

    const sourceInfo = sourceInfoFor(record, "server.service");
    const receipt = createRegistrationReceipt({
      key: id,
      kind: "server.service",
      sourceInfo,
    });
    record.services.push(id);
    registry.services.push({
      pluginId: record.id,
      service,
      receiptId: receipt.id,
      source: record.source,
      sourceInfo,
      pluginConfig,
    });
  };

  const registerTestDataType = (
    record: PluginRecord,
    registration: PluginTestDataRegistration,
    pluginConfig: Record<string, unknown>
  ): PluginRegistrationReceipt | undefined => {
    const moduleId = (registration.meta.module_id ?? record.id).trim();
    const dataType = registration.meta.data_type.trim();
    if (!dataType) {
      const sourceInfo = sourceInfoFor(record, "server.testDataType");
      pushDiagnostic({
        level: "warn",
        code: "plugin.registration.missing_name",
        pluginId: record.id,
        sourceInfo,
        message: "test data registration missing data_type",
        remediation: "Provide a non-empty test data type.",
      });
      return;
    }
    const key = `${moduleId}:${dataType}`;
    const duplicate = registry.testDataTypes.find(
      (entry) =>
        `${entry.registration.meta.module_id}:${entry.registration.meta.data_type}` ===
        key
    );
    if (duplicate) {
      const sourceInfo = sourceInfoFor(record, "server.testDataType");
      pushDiagnostic({
        level: "warn",
        code: "plugin.registration.duplicate_test_data_type",
        pluginId: record.id,
        sourceInfo,
        message: `test data type already registered: ${key}`,
        remediation:
          "Choose a unique module_id/data_type pair or remove the duplicate test data contribution.",
      });
      return;
    }
    const normalized: PluginTestDataRegistration = {
      ...registration,
      meta: {
        ...registration.meta,
        module_id: moduleId,
        data_type: dataType,
      },
    };
    const sourceInfo = sourceInfoFor(record, "server.testDataType");
    const receipt = createRegistrationReceipt({
      key,
      kind: "server.testDataType",
      sourceInfo,
    });
    record.testDataTypes.push(key);
    registry.testDataTypes.push({
      pluginId: record.id,
      registration: normalized,
      receiptId: receipt.id,
      source: record.source,
      sourceInfo,
      pluginConfig,
    });
    return receipt;
  };

  const registerProfilePolicy = (
    record: PluginRecord,
    policy: PluginProfilePolicy,
    pluginConfig: Record<string, unknown>
  ) => {
    if (!record.profilePolicies) {
      record.profilePolicies = [];
    }
    if (!registry.profilePolicies) {
      registry.profilePolicies = [];
    }
    const policies = record.profilePolicies;
    const registered = registry.profilePolicies;
    const key = `${record.id}:profile-policy:${policies.length + 1}`;
    const sourceInfo = sourceInfoFor(record, "server.profilePolicy");
    const receipt = createRegistrationReceipt({
      key,
      kind: "server.profilePolicy",
      sourceInfo,
    });
    policies.push(key);
    registered.push({
      pluginId: record.id,
      policy,
      receiptId: receipt.id,
      source: record.source,
      sourceInfo,
      pluginConfig,
    });
  };

  const registerResultPolicy = (
    record: PluginRecord,
    policy: PluginResultPolicy,
    pluginConfig: Record<string, unknown>
  ) => {
    if (!record.resultPolicies) {
      record.resultPolicies = [];
    }
    if (!registry.resultPolicies) {
      registry.resultPolicies = [];
    }
    const policies = record.resultPolicies;
    const registered = registry.resultPolicies;
    const key = `${record.id}:result-policy:${policies.length + 1}`;
    const sourceInfo = sourceInfoFor(record, "server.resultPolicy");
    const receipt = createRegistrationReceipt({
      key,
      kind: "server.resultPolicy",
      sourceInfo,
    });
    policies.push(key);
    registered.push({
      pluginId: record.id,
      policy,
      receiptId: receipt.id,
      source: record.source,
      sourceInfo,
      pluginConfig,
    });
  };

  const registerFeatureFlags = (
    record: PluginRecord,
    definitions: FeatureFlagDefinition[]
  ): PluginRegistrationReceipt[] => {
    if (!Array.isArray(definitions) || definitions.length === 0) {
      return [];
    }
    const sourceInfo = sourceInfoFor(record, "server.featureFlag");
    const withPluginId = definitions.map((d) => ({
      ...d,
      pluginId: record.id,
    }));
    const { catalog: deduped, duplicates } = dedupeDefinitions([
      ...registry.featureFlags,
      ...withPluginId,
    ]);
    for (const msg of duplicates) {
      pushDiagnostic({
        level: "warn",
        code: "plugin.registration.duplicate_feature_flag",
        pluginId: record.id,
        sourceInfo,
        message: `feature flag: ${msg}`,
        remediation:
          "Choose a unique feature flag key or remove the duplicate flag definition.",
      });
    }
    const receipts: PluginRegistrationReceipt[] = [];
    for (const def of definitions) {
      record.featureFlags.push(def.key);
      receipts.push(
        createRegistrationReceipt({
          key: def.key,
          kind: "server.featureFlag",
          sourceInfo,
        })
      );
    }
    registry.featureFlags.length = 0;
    registry.featureFlags.push(...deduped);
    return receipts;
  };

  const registerAiRegistration = (
    record: PluginRecord,
    registration: PluginAiRegistration
  ) => {
    const sourceInfo = sourceInfoFor(record, "server.aiRegistration");
    addAiRegistration(registration as Parameters<typeof addAiRegistration>[0], {
      generationId: sourceInfo.generationId,
      pluginId: record.id,
    });
    record.aiRegistrations ??= [];
    record.aiRegistrations.push(registration.module_id);
    registry.aiRegistrations.push({
      generationId: sourceInfo.generationId,
      moduleId: registration.module_id,
      pluginId: record.id,
      sourceInfo,
    });
  };

  const createApi = (
    record: PluginRecord,
    pluginConfig: Record<string, unknown>
  ): PluginRuntimeApi => {
    record.generationId ??= generationId;
    const callGatewayMethod: PluginServerApi["callGatewayMethod"] = async (
      methodName,
      input,
      options
    ) => {
      const moduleOp = registry.moduleOperations.find(
        (entry) => entry.operationId === methodName
      );
      if (moduleOp) {
        if (isStaleGenerationEntry(registry, moduleOp)) {
          recordStaleGenerationDiagnostic({
            action: `module operation ${moduleOp.operationId}`,
            entry: moduleOp,
            registry,
          });
          return null;
        }
        const result = await moduleOp.handler(input, {
          config: params.config,
          pluginConfig: moduleOp.pluginConfig,
          dataDir: params.dataDir,
          resolvePath: params.resolvePath,
          logger: params.logger,
          auth: options?.auth,
        });
        return result ?? null;
      }
      // Fallback: core host methods that carry no operation metadata
      // (registered by register-methods.ts on registry.gatewayMethods).
      const found = registry.gatewayMethods.find(
        (entry) => entry.method.name === methodName
      );
      if (!found) {
        return null;
      }
      if (isStaleGenerationEntry(registry, found)) {
        recordStaleGenerationDiagnostic({
          action: `gateway method ${found.method.name}`,
          entry: found,
          registry,
        });
        return null;
      }
      const result = await found.method.handler(input, {
        config: params.config,
        pluginConfig: found.pluginConfig,
        dataDir: params.dataDir,
        resolvePath: params.resolvePath,
        logger: params.logger,
        auth: options?.auth,
      });
      return result ?? null;
    };

    const getStorageService = (bucket: string) => {
      const adapter = params.getDatabaseAdapter?.();
      if (!adapter) {
        return null;
      }
      const provider = createSupabaseFileStorageProvider({
        client: adapter,
        bucket,
      });
      return createFileStorageService({ provider });
    };

    const getQueueService = () => {
      const adapter = params.getDatabaseAdapter?.();
      if (!adapter) {
        return null;
      }
      // adapter is a Supabase client with .rpc() — cast to satisfy queue's SupabaseClientLike
      return createQueueService(
        adapter as Parameters<typeof createQueueService>[0]
      );
    };

    const registerQueueImpl = (queue: QueueDefinition) => {
      const name = queue.name.trim();
      if (!name) {
        const sourceInfo = sourceInfoFor(record, "server.queue");
        pushDiagnostic({
          level: "warn",
          code: "plugin.registration.missing_name",
          pluginId: record.id,
          sourceInfo,
          message: "queue registration missing name",
          remediation: "Provide a non-empty queue name.",
        });
        return;
      }
      const duplicate = registry.queueDefinitions.find(
        (entry) => entry.queue.name === name
      );
      if (duplicate) {
        const sourceInfo = sourceInfoFor(record, "server.queue");
        pushDiagnostic({
          level: "warn",
          code: "plugin.registration.duplicate_queue",
          pluginId: record.id,
          sourceInfo,
          message: `queue already registered: ${name}`,
          remediation:
            "Choose a unique queue name or remove the duplicate queue contribution.",
        });
        return;
      }
      const sourceInfo = sourceInfoFor(record, "server.queue");
      const receipt = createRegistrationReceipt({
        key: name,
        kind: "server.queue",
        sourceInfo,
      });
      record.queues.push(name);
      registry.queueDefinitions.push({
        pluginId: record.id,
        queue: { ...queue, name },
        receiptId: receipt.id,
        sourceInfo,
      });
    };

    const registerQueueHandlerImpl = (
      queueName: string,
      handler: (
        payload: Record<string, unknown>,
        meta: { msgId: number; readCount: number }
      ) => Promise<void>
    ) => {
      const sourceInfo = sourceInfoFor(record, "server.queueHandler");
      const receipt = createRegistrationReceipt({
        key: queueName,
        kind: "server.queueHandler",
        sourceInfo,
      });
      registry.queueHandlers.set(queueName, {
        handler,
        pluginId: record.id,
        receiptId: receipt.id,
        sourceInfo,
      });
    };

    const server: PluginServerApi = {
      callGatewayMethod,
      getDatabaseAdapter: params.getDatabaseAdapter,
      getQueueService,
      getStorageService,
      hasOperation: (operationId: string) =>
        registry.moduleOperations.some(
          (entry) => entry.operationId === operationId
        ),
      registerAiRegistration: (registration) =>
        registerAiRegistration(record, registration as PluginAiRegistration),
      registerCli: (r, o) => registerCli(record, r as CliRegistrar, o),
      registerFeatureFlags: (definitions) =>
        registerFeatureFlags(record, definitions),
      registerHttpRoute: (route) =>
        registerHttpRoute(record, route, pluginConfig),
      registerOperation: (operation) =>
        registerOperation(record, operation, pluginConfig),
      registerSearchIndexProvider: () => undefined,
      registerProfilePolicy: (policy) =>
        registerProfilePolicy(record, policy, pluginConfig),
      registerQueue: registerQueueImpl,
      registerQueueHandler: registerQueueHandlerImpl,
      registerResultPolicy: (policy) =>
        registerResultPolicy(record, policy, pluginConfig),
      registerService: (s) => registerService(record, s, pluginConfig),
      registerTestDataType: (registration) =>
        registerTestDataType(record, registration, pluginConfig),
      resolvePath: (p: string) => params.resolvePath(p),
    };

    return {
      config: params.config,
      pluginConfig,
      server,
    };
  };

  registry.createApi = createApi;

  return { registry, createApi };
}
