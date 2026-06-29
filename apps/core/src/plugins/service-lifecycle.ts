import type {
  PluginDiagnostic,
  PluginService,
  PluginServiceContext,
} from "@engenty/plugin-sdk";
import { resolvePluginCapability } from "./capability-resolver.js";
import {
  type PluginRegistry,
  type RemoveOwnedRegistrationsResult,
  removeOwnedRegistrations,
} from "./registry.js";

export interface ServiceLifecycleLogger {
  debug: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface ServiceLifecycleContext extends PluginServiceContext {
  logger: ServiceLifecycleLogger;
}

export interface StopOwnedServicesResult {
  blocked: boolean;
  failed: number;
  generationId?: number;
  nonReloadable: number;
  pluginId: string;
  stopped: number;
}

export interface UnloadOwnedRegistrationsResult {
  blocked: boolean;
  generationId?: number;
  pluginId: string;
  removal?: RemoveOwnedRegistrationsResult;
  serviceStop: StopOwnedServicesResult;
}

function pushLifecycleDiagnostic(
  registry: PluginRegistry,
  logger: ServiceLifecycleLogger,
  diagnostic: PluginDiagnostic
) {
  registry.diagnostics.push(diagnostic);
  if (diagnostic.level === "error") {
    logger.error(diagnostic.message);
    return;
  }
  logger.warn(diagnostic.message);
}

function serviceGenerationId(
  registry: PluginRegistry,
  entry: PluginRegistry["services"][number]
) {
  return entry.sourceInfo?.generationId ?? registry.generationId;
}

function isStaleServiceGeneration(
  registry: PluginRegistry,
  entry: PluginRegistry["services"][number]
) {
  const generationId = serviceGenerationId(registry, entry);
  if (typeof generationId !== "number") {
    return false;
  }
  const pluginRecord = registry.plugins.find((p) => p.id === entry.pluginId);
  const activeGenerationId =
    pluginRecord?.generationId ?? registry.generationId;
  return (
    typeof activeGenerationId === "number" &&
    generationId !== activeGenerationId
  );
}

function isServiceMarkedNonReloadable(service: PluginService) {
  return (
    (service as PluginService & { reloadable?: boolean }).reloadable === false
  );
}

function pushStaleServiceGenerationDiagnostic(
  registry: PluginRegistry,
  logger: ServiceLifecycleLogger,
  entry: PluginRegistry["services"][number],
  phase: "start" | "stop"
) {
  pushLifecycleDiagnostic(registry, logger, {
    level: "warn",
    code: "plugin.runtime.stale_generation",
    pluginId: entry.pluginId,
    sourceInfo: entry.sourceInfo,
    message: `stale service ${phase} ignored (${entry.service.id})`,
    remediation:
      "Retry the plugin reload after the active runtime generation settles.",
  });
}

function pushServiceFailureDiagnostic(
  registry: PluginRegistry,
  logger: ServiceLifecycleLogger,
  entry: PluginRegistry["services"][number],
  code: "plugin.service.start_failed" | "plugin.service.stop_failed",
  err: unknown
) {
  const phase = code === "plugin.service.start_failed" ? "start" : "stop";
  pushLifecycleDiagnostic(registry, logger, {
    level: "error",
    code,
    pluginId: entry.pluginId,
    sourceInfo: entry.sourceInfo,
    message: `Service ${phase} failed (${entry.service.id}): ${String(err)}`,
    remediation:
      phase === "start"
        ? "Fix the service start handler, then restart or reload the plugin."
        : "Fix the service stop handler before retrying plugin reload.",
  });
}

function getRegisteredServiceCapabilities(
  registry: PluginRegistry,
  pluginId: string
) {
  return registry.services
    .filter((entry) => entry.pluginId === pluginId)
    .map((entry) => entry.service.id);
}

export function startRegisteredServices(
  registry: PluginRegistry,
  context: ServiceLifecycleContext,
  options?: { pluginId?: string }
): Promise<void>[] {
  const pending: Promise<void>[] = [];

  for (const entry of registry.services) {
    if (options?.pluginId && entry.pluginId !== options.pluginId) {
      continue;
    }

    if (isStaleServiceGeneration(registry, entry)) {
      pushStaleServiceGenerationDiagnostic(
        registry,
        context.logger,
        entry,
        "start"
      );
      continue;
    }

    const capabilityResolution = resolvePluginCapability({
      registry,
      pluginId: entry.pluginId,
      capability: entry.service.id,
      contributionKind: "service",
      registeredCapabilities: getRegisteredServiceCapabilities(
        registry,
        entry.pluginId
      ),
    });
    if (!capabilityResolution.allowed) {
      for (const diagnostic of capabilityResolution.diagnostics) {
        pushLifecycleDiagnostic(registry, context.logger, diagnostic);
      }
      continue;
    }

    try {
      const maybePromise = entry.service.start({
        config: context.config,
        pluginConfig: entry.pluginConfig,
        dataDir: context.dataDir,
        resolvePath: context.resolvePath,
        logger: context.logger,
      });
      if (
        maybePromise &&
        typeof (maybePromise as Promise<unknown>).then === "function"
      ) {
        const serviceStart = (maybePromise as Promise<unknown>)
          .then(() => {
            if (isStaleServiceGeneration(registry, entry)) {
              pushStaleServiceGenerationDiagnostic(
                registry,
                context.logger,
                entry,
                "start"
              );
            }
          })
          .catch((err) => {
            pushServiceFailureDiagnostic(
              registry,
              context.logger,
              entry,
              "plugin.service.start_failed",
              err
            );
          });
        pending.push(serviceStart);
      }
    } catch (err) {
      pushServiceFailureDiagnostic(
        registry,
        context.logger,
        entry,
        "plugin.service.start_failed",
        err
      );
    }
  }

  return pending;
}

export async function stopOwnedServices(
  registry: PluginRegistry,
  pluginId: string,
  context: ServiceLifecycleContext
): Promise<StopOwnedServicesResult> {
  const result: StopOwnedServicesResult = {
    blocked: false,
    failed: 0,
    generationId: registry.generationId,
    nonReloadable: 0,
    pluginId,
    stopped: 0,
  };

  for (const entry of registry.services.filter(
    (serviceEntry) => serviceEntry.pluginId === pluginId
  )) {
    if (isServiceMarkedNonReloadable(entry.service) || !entry.service.stop) {
      result.blocked = true;
      result.nonReloadable += 1;
      pushLifecycleDiagnostic(registry, context.logger, {
        level: "error",
        code: "plugin.service.non_reloadable",
        pluginId,
        sourceInfo: entry.sourceInfo,
        message: `service is not reloadable (${entry.service.id})`,
        remediation:
          "Add a stop handler and mark the service reloadable, or restart the API process.",
      });
      continue;
    }

    if (isStaleServiceGeneration(registry, entry)) {
      result.blocked = true;
      pushStaleServiceGenerationDiagnostic(
        registry,
        context.logger,
        entry,
        "stop"
      );
      continue;
    }

    try {
      await entry.service.stop({
        config: context.config,
        pluginConfig: entry.pluginConfig,
        dataDir: context.dataDir,
        resolvePath: context.resolvePath,
        logger: context.logger,
      });
      result.stopped += 1;
    } catch (err) {
      result.blocked = true;
      result.failed += 1;
      pushServiceFailureDiagnostic(
        registry,
        context.logger,
        entry,
        "plugin.service.stop_failed",
        err
      );
    }
  }

  return result;
}

export async function unloadOwnedRegistrations(
  registry: PluginRegistry,
  pluginId: string,
  context: ServiceLifecycleContext
): Promise<UnloadOwnedRegistrationsResult> {
  const serviceStop = await stopOwnedServices(registry, pluginId, context);
  if (serviceStop.blocked) {
    return {
      blocked: true,
      generationId: registry.generationId,
      pluginId,
      serviceStop,
    };
  }

  const removal = await removeOwnedRegistrations(registry, pluginId, {
    logger: context.logger,
  });
  if (removal.blocked) {
    return {
      blocked: true,
      generationId: registry.generationId,
      pluginId,
      removal,
      serviceStop,
    };
  }

  return {
    blocked: false,
    generationId: registry.generationId,
    pluginId,
    removal,
    serviceStop,
  };
}
