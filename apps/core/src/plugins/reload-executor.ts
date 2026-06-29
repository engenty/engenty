import type { PluginDiagnostic } from "@engenty/plugin-sdk";
import {
  type PluginEffectiveState,
  resolvePluginEffectiveState,
} from "./capability-resolver.js";
import {
  type PluginInstallValidationIssue,
  type PluginReloadValidationReport,
  validatePluginReload,
} from "./install-validation.js";
import {
  type ClearPluginImportCacheResult,
  clearPluginImportCache,
  enforcePluginTier,
  type LoadPluginsParams,
  type RegisterPluginFactoryResult,
  registerPluginFactory,
} from "./loader.js";
import { loadPluginManifest, type PluginManifest } from "./manifest.js";
import {
  createPluginSourceInfo,
  type PluginRecord,
  type PluginRegistry,
} from "./registry.js";
import {
  type ServiceLifecycleContext,
  startRegisteredServices,
  type UnloadOwnedRegistrationsResult,
  unloadOwnedRegistrations,
} from "./service-lifecycle.js";

export type ReloadPluginStepKey =
  | "validation"
  | "manifest_preflight"
  | "shutdown_event"
  | "unload"
  | "cache_clear"
  | "manifest_reload"
  | "factory_reload"
  | "activation"
  | "service_start"
  | "ui_refresh"
  | "result";

export interface ReloadPluginStepDiagnostic {
  details?: unknown;
  diagnostics?: PluginDiagnostic[];
  generationId?: number;
  key: ReloadPluginStepKey;
  message: string;
  nextGenerationId?: number;
  status: "blocked" | "failed" | "skipped" | "succeeded";
}

export interface ReloadPluginExecutionResult {
  activation?: {
    effectiveState: PluginEffectiveState;
    generationId?: number;
    globalEnabled: boolean;
    tenantId?: string | undefined;
    tenantOverride?: boolean | null;
  };
  cacheClear?: ClearPluginImportCacheResult;
  generationId?: number;
  issues: PluginDiagnostic[];
  nextGenerationId?: number;
  pluginId: string;
  preflight: PluginReloadValidationReport;
  registration?: RegisterPluginFactoryResult;
  serviceStarts: number;
  status: "blocked" | "failed" | "reloaded";
  steps: ReloadPluginStepDiagnostic[];
  uiRefresh?: ReloadPluginUiRefresh;
  unload?: UnloadOwnedRegistrationsResult;
}

export interface ReloadPluginUiRefresh {
  generationId?: number;
  invalidationRequired: boolean;
  pluginId: string;
  reason: "ui_contributions_may_have_changed";
}

function pushReloadDiagnostic(
  registry: PluginRegistry,
  diagnostic: PluginDiagnostic
) {
  registry.diagnostics.push(diagnostic);
}

function createReloadSourceDiagnostic(params: {
  code: string;
  message: string;
  pluginId: string;
  record: PluginRecord;
  remediation: string;
}): PluginDiagnostic {
  return {
    level: "error",
    code: params.code,
    pluginId: params.pluginId,
    sourceInfo: createPluginSourceInfo(params.record, "server.plugin"),
    message: params.message,
    remediation: params.remediation,
  };
}

function installIssuesToReloadDiagnostics(params: {
  issues: PluginInstallValidationIssue[];
  pluginId: string;
}): PluginDiagnostic[] {
  return params.issues.map((issue) => ({
    level: issue.level,
    code: issue.code,
    message: issue.message,
    pluginId: params.pluginId,
    remediation: issue.remediation,
  }));
}

function createReloadStepRecorder() {
  const steps: ReloadPluginStepDiagnostic[] = [];
  return {
    record: (step: ReloadPluginStepDiagnostic) => {
      steps.push(step);
    },
    steps,
  };
}

function createUiRefreshDiagnostic(record: PluginRecord): PluginDiagnostic {
  return {
    level: "warn",
    code: "plugin.reload.ui_refresh_required",
    pluginId: record.id,
    sourceInfo: createPluginSourceInfo(record, "ui.contribution"),
    message: `UI contributions may have changed after reload: ${record.id}`,
    remediation:
      "Invalidate UI contribution queries after consuming this reload result.",
  };
}

function markUiRefreshRequired(params: {
  record: PluginRecord;
  registry: PluginRegistry;
}): {
  diagnostic: PluginDiagnostic;
  refresh: ReloadPluginUiRefresh;
} {
  const diagnostic = createUiRefreshDiagnostic(params.record);
  pushReloadDiagnostic(params.registry, diagnostic);
  return {
    diagnostic,
    refresh: {
      generationId: params.registry.generationId,
      invalidationRequired: true,
      pluginId: params.record.id,
      reason: "ui_contributions_may_have_changed",
    },
  };
}

function updateRecordFromManifest(params: {
  generationId: number;
  manifest: PluginManifest;
  manifestPath: string;
  record: PluginRecord;
}) {
  params.record.name = params.manifest.name;
  params.record.description = params.manifest.description;
  params.record.version = params.manifest.version;
  params.record.manifestPath = params.manifestPath;
  params.record.kind = params.manifest.kind;
  params.record.ui = params.manifest.ui;
  params.record.provides = params.manifest.provides ?? [];
  params.record.requires = params.manifest.requires ?? [];
  params.record.optional = params.manifest.optional ?? [];
  params.record.loaded = false;
  params.record.loadError = undefined;
  params.record.generationId = params.generationId;
  params.record.sourceInfo = createPluginSourceInfo(
    params.record,
    "server.plugin"
  );
}

function refreshRecordDependencies(record: PluginRecord) {
  record.dependencies = record.requires ?? [];
}

function resultIssuesSince(
  registry: PluginRegistry,
  pluginId: string,
  startIndex: number
) {
  return registry.diagnostics
    .slice(startIndex)
    .filter((diagnostic) => diagnostic.pluginId === pluginId);
}

export async function reloadBackendPlugin(params: {
  config?: Record<string, unknown>;
  dataDir: string;
  logger: NonNullable<LoadPluginsParams["logger"]>;
  pluginId: string;
  registry: PluginRegistry;
  resolvePath: (path: string) => string;
  resolveTenantPluginOverrides?: (
    tenantId: string
  ) => Promise<Record<string, boolean>>;
  tenantId?: string;
}): Promise<ReloadPluginExecutionResult> {
  const config = params.config ?? {};
  const audit = createReloadStepRecorder();
  const preflight = validatePluginReload({
    pluginId: params.pluginId,
    registry: params.registry,
  });
  const diagnosticsStart = params.registry.diagnostics.length;
  const record = params.registry.plugins.find(
    (plugin) => plugin.id === params.pluginId
  );
  const preflightDiagnostics = installIssuesToReloadDiagnostics({
    issues: preflight.issues,
    pluginId: params.pluginId,
  });
  audit.record({
    diagnostics: preflightDiagnostics,
    generationId: preflight.generationId,
    key: "validation",
    message: preflight.preflightPassed
      ? "Reload validation passed."
      : "Reload validation blocked execution.",
    nextGenerationId: preflight.nextGenerationId,
    status: preflight.preflightPassed ? "succeeded" : "blocked",
    details: {
      ownedRegistrations: preflight.ownedRegistrations,
      requiresRestart: preflight.requiresRestart,
    },
  });

  if (!record) {
    return {
      generationId: params.registry.generationId,
      issues: preflightDiagnostics,
      nextGenerationId: preflight.nextGenerationId,
      pluginId: params.pluginId,
      preflight,
      serviceStarts: 0,
      steps: audit.steps,
      status: "blocked",
    };
  }

  if (!preflight.preflightPassed) {
    return {
      generationId: params.registry.generationId,
      issues: preflightDiagnostics,
      nextGenerationId: preflight.nextGenerationId,
      pluginId: params.pluginId,
      preflight,
      serviceStarts: 0,
      steps: audit.steps,
      status: "blocked",
    };
  }

  const manifestPreflight = loadPluginManifest(record.rootDir);
  if (!manifestPreflight.ok) {
    const diagnostic = createReloadSourceDiagnostic({
      code: manifestPreflight.code,
      message: manifestPreflight.error,
      pluginId: record.id,
      record,
      remediation: "Fix the plugin manifest before retrying reload.",
    });
    pushReloadDiagnostic(params.registry, diagnostic);
    audit.record({
      diagnostics: [diagnostic],
      generationId: params.registry.generationId,
      key: "manifest_preflight",
      message: "Reload manifest preflight failed.",
      nextGenerationId: preflight.nextGenerationId,
      status: "blocked",
    });
    return {
      generationId: params.registry.generationId,
      issues: resultIssuesSince(params.registry, record.id, diagnosticsStart),
      nextGenerationId: preflight.nextGenerationId,
      pluginId: record.id,
      preflight,
      serviceStarts: 0,
      steps: audit.steps,
      status: "blocked",
    };
  }
  if (manifestPreflight.manifest.id !== record.id) {
    const diagnostic = createReloadSourceDiagnostic({
      code: "plugin.reload.manifest_id_mismatch",
      message: `Reload manifest id changed from ${record.id} to ${manifestPreflight.manifest.id}.`,
      pluginId: record.id,
      record,
      remediation:
        "Keep plugin identity stable during reload; restart the API for identity changes.",
    });
    pushReloadDiagnostic(params.registry, diagnostic);
    audit.record({
      diagnostics: [diagnostic],
      generationId: params.registry.generationId,
      key: "manifest_preflight",
      message: "Reload manifest identity check failed.",
      nextGenerationId: preflight.nextGenerationId,
      status: "blocked",
    });
    return {
      generationId: params.registry.generationId,
      issues: resultIssuesSince(params.registry, record.id, diagnosticsStart),
      nextGenerationId: preflight.nextGenerationId,
      pluginId: record.id,
      preflight,
      serviceStarts: 0,
      steps: audit.steps,
      status: "blocked",
    };
  }
  audit.record({
    generationId: params.registry.generationId,
    key: "manifest_preflight",
    message: "Reload manifest preflight passed.",
    nextGenerationId: preflight.nextGenerationId,
    status: "succeeded",
  });

  const serviceContext: ServiceLifecycleContext = {
    config,
    dataDir: params.dataDir,
    logger: params.logger,
    pluginConfig: {},
    resolvePath: params.resolvePath,
  };
  await params.registry.eventsRuntime?.api.core.emit(
    "plugin.shutdown",
    {
      generation_id: record.generationId,
      plugin_id: record.id,
      reload: true,
    },
    {
      sourceModuleId: "engenty-core",
    }
  );
  audit.record({
    generationId: record.generationId,
    key: "shutdown_event",
    message: "Plugin shutdown event emitted.",
    nextGenerationId: preflight.nextGenerationId,
    status: "succeeded",
  });
  const unload = await unloadOwnedRegistrations(
    params.registry,
    record.id,
    serviceContext
  );
  audit.record({
    diagnostics: resultIssuesSince(
      params.registry,
      record.id,
      diagnosticsStart
    ),
    generationId: unload.generationId,
    key: "unload",
    message: unload.blocked
      ? "Owned registrations unload was blocked."
      : "Owned registrations unloaded.",
    nextGenerationId: preflight.nextGenerationId,
    status: unload.blocked ? "blocked" : "succeeded",
    details: {
      disposeFailureCount: unload.removal?.disposeFailureCount,
      disposeFailures: unload.removal?.disposeFailures,
      removed: unload.removal?.removed,
      serviceStop: unload.serviceStop,
    },
  });
  if (unload.blocked) {
    return {
      generationId: params.registry.generationId,
      issues: resultIssuesSince(params.registry, record.id, diagnosticsStart),
      nextGenerationId: preflight.nextGenerationId,
      pluginId: record.id,
      preflight,
      serviceStarts: 0,
      steps: audit.steps,
      status: "blocked",
      unload,
    };
  }

  const cacheClear = clearPluginImportCache({
    entryPath: record.source,
    rootDir: record.rootDir,
  });
  if (cacheClear.refused) {
    const diagnostic = createReloadSourceDiagnostic({
      code: "plugin.reload.cache_clear_refused",
      message: cacheClear.reason ?? "Import cache clear was refused.",
      pluginId: record.id,
      record,
      remediation:
        "Reload only plugins with a concrete package root, or restart the API.",
    });
    pushReloadDiagnostic(params.registry, diagnostic);
    audit.record({
      details: cacheClear,
      diagnostics: [diagnostic],
      generationId: params.registry.generationId,
      key: "cache_clear",
      message: "Import cache clear was refused.",
      nextGenerationId: preflight.nextGenerationId,
      status: "failed",
    });
    return {
      cacheClear,
      generationId: params.registry.generationId,
      issues: resultIssuesSince(params.registry, record.id, diagnosticsStart),
      nextGenerationId: preflight.nextGenerationId,
      pluginId: record.id,
      preflight,
      serviceStarts: 0,
      steps: audit.steps,
      status: "failed",
      unload,
    };
  }
  audit.record({
    details: cacheClear,
    generationId: params.registry.generationId,
    key: "cache_clear",
    message: "Import cache cleared.",
    nextGenerationId: preflight.nextGenerationId,
    status: "succeeded",
  });

  const manifestReload = loadPluginManifest(record.rootDir);
  if (!manifestReload.ok) {
    const diagnostic = createReloadSourceDiagnostic({
      code: manifestReload.code,
      message: manifestReload.error,
      pluginId: record.id,
      record,
      remediation: "Fix the plugin manifest and retry reload.",
    });
    pushReloadDiagnostic(params.registry, diagnostic);
    audit.record({
      diagnostics: [diagnostic],
      generationId: params.registry.generationId,
      key: "manifest_reload",
      message: "Reload manifest read failed.",
      nextGenerationId: preflight.nextGenerationId,
      status: "failed",
    });
    return {
      cacheClear,
      generationId: params.registry.generationId,
      issues: resultIssuesSince(params.registry, record.id, diagnosticsStart),
      nextGenerationId: preflight.nextGenerationId,
      pluginId: record.id,
      preflight,
      serviceStarts: 0,
      steps: audit.steps,
      status: "failed",
      unload,
    };
  }
  audit.record({
    generationId: params.registry.generationId,
    key: "manifest_reload",
    message: "Reload manifest read succeeded.",
    nextGenerationId: preflight.nextGenerationId,
    status: "succeeded",
  });
  const reloadCanAffectUiContributions = Boolean(
    record.ui?.entry || manifestReload.manifest.ui?.entry
  );

  const nextGenerationId =
    preflight.nextGenerationId ?? (params.registry.generationId ?? 0) + 1;
  params.registry.generationId = nextGenerationId;
  updateRecordFromManifest({
    generationId: nextGenerationId,
    manifest: manifestReload.manifest,
    manifestPath: manifestReload.manifestPath,
    record,
  });
  refreshRecordDependencies(record);

  const registration = registerPluginFactory({
    config,
    logger: params.logger,
    manifest: manifestReload.manifest,
    record,
    registry: params.registry,
    resolveTenantPluginOverrides: params.resolveTenantPluginOverrides,
  });
  audit.record({
    diagnostics: resultIssuesSince(
      params.registry,
      record.id,
      diagnosticsStart
    ),
    generationId: params.registry.generationId,
    key: "factory_reload",
    message: registration.loaded
      ? "Plugin factory reloaded."
      : "Plugin factory reload failed.",
    nextGenerationId,
    status: registration.loaded ? "succeeded" : "failed",
    details: {
      loadError: registration.loadError,
    },
  });
  if (registration.loaded) {
    enforcePluginTier({
      logger: params.logger,
      record,
      registry: params.registry,
    });
  }
  const tenantPluginOverrides =
    registration.loaded &&
    params.tenantId &&
    params.resolveTenantPluginOverrides
      ? await params.resolveTenantPluginOverrides(params.tenantId)
      : {};
  const activation = registration.loaded
    ? {
        effectiveState: resolvePluginEffectiveState({
          capability: `plugin.${record.id}`,
          contributionKind: "ui_contribution",
          pluginId: record.id,
          registry: params.registry,
          tenantId: params.tenantId,
          tenantPluginOverrides,
        }),
        generationId: params.registry.generationId,
        globalEnabled: record.enabled,
        tenantId: params.tenantId,
        tenantOverride: params.tenantId
          ? (tenantPluginOverrides[record.id] ?? null)
          : null,
      }
    : undefined;
  audit.record({
    diagnostics: activation?.effectiveState.allowed
      ? []
      : activation?.effectiveState.diagnostics,
    generationId: params.registry.generationId,
    key: "activation",
    message: activation
      ? "Activation state recalculated for the reloaded plugin."
      : "Activation recalculation skipped after factory reload failure.",
    nextGenerationId,
    status: activation
      ? activation.effectiveState.allowed
        ? "succeeded"
        : "blocked"
      : "skipped",
    details: activation
      ? {
          allowed: activation.effectiveState.allowed,
          blockedReasons: activation.effectiveState.blockedReasons,
          globalEnabled: activation.globalEnabled,
          tenantEnabled: activation.effectiveState.tenantEnabled,
          tenantId: activation.tenantId,
          tenantOverride: activation.tenantOverride,
        }
      : undefined,
  });
  const serviceStarts = registration.loaded
    ? startRegisteredServices(params.registry, serviceContext, {
        pluginId: record.id,
      })
    : [];
  audit.record({
    diagnostics: resultIssuesSince(
      params.registry,
      record.id,
      diagnosticsStart
    ),
    generationId: params.registry.generationId,
    key: "service_start",
    message: registration.loaded
      ? "Owned services start requested."
      : "Owned service start skipped after factory reload failure.",
    nextGenerationId,
    status: registration.loaded ? "succeeded" : "skipped",
    details: {
      started: serviceStarts.length,
    },
  });
  const uiRefresh = reloadCanAffectUiContributions
    ? markUiRefreshRequired({
        record,
        registry: params.registry,
      })
    : undefined;
  if (uiRefresh) {
    audit.record({
      diagnostics: [uiRefresh.diagnostic],
      generationId: params.registry.generationId,
      key: "ui_refresh",
      message: "UI contribution invalidation marked for clients.",
      nextGenerationId,
      status: "succeeded",
      details: uiRefresh.refresh,
    });
  }
  audit.record({
    diagnostics: resultIssuesSince(
      params.registry,
      record.id,
      diagnosticsStart
    ),
    generationId: params.registry.generationId,
    key: "result",
    message: registration.loaded
      ? "Backend plugin reload completed."
      : "Backend plugin reload completed with load errors.",
    nextGenerationId,
    status: registration.loaded ? "succeeded" : "failed",
  });

  return {
    cacheClear,
    generationId: params.registry.generationId,
    issues: resultIssuesSince(params.registry, record.id, diagnosticsStart),
    nextGenerationId,
    pluginId: record.id,
    preflight,
    activation,
    registration,
    serviceStarts: serviceStarts.length,
    steps: audit.steps,
    status: registration.loaded ? "reloaded" : "failed",
    uiRefresh: uiRefresh?.refresh,
    unload,
  };
}
