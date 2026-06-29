import { resolvePluginCapability } from "./capability-resolver.js";
import type { PluginRegistry } from "./registry.js";

type QueueHandler = (
  payload: Record<string, unknown>,
  meta: { msgId: number; readCount: number }
) => Promise<void>;

type TenantPluginOverrideResolver = (
  tenantId: string
) => Promise<Record<string, boolean>>;

export class QueueCapabilityBlockedError extends Error {
  reason: string;

  constructor(reason: string) {
    super(`Queue capability blocked: ${reason}`);
    this.name = "QueueCapabilityBlockedError";
    this.reason = reason;
  }
}

export class QueueStaleGenerationError extends Error {
  constructor(queueName: string) {
    super(`Queue handler belongs to a stale plugin generation: ${queueName}`);
    this.name = "QueueStaleGenerationError";
  }
}

function getPayloadTenantId(payload: Record<string, unknown>) {
  const tenantId = payload.tenant_id ?? payload.tenantId;
  return typeof tenantId === "string" && tenantId.trim()
    ? tenantId.trim()
    : undefined;
}

function getRegisteredQueueCapabilities(
  registry: PluginRegistry,
  pluginId: string
) {
  return [...registry.queueHandlers]
    .filter(([, entry]) => entry.pluginId === pluginId)
    .map(([queueName]) => queueName);
}

function isStaleQueueHandlerGeneration(
  registry: PluginRegistry,
  entry: PluginRegistry["queueHandlers"] extends Map<string, infer TEntry>
    ? TEntry
    : never
) {
  const generationId = entry.sourceInfo?.generationId;
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

export function createGatedQueueHandlers(params: {
  registry: PluginRegistry;
  resolveTenantPluginOverrides?: TenantPluginOverrideResolver;
}): Map<string, QueueHandler> {
  const handlers = new Map<string, QueueHandler>();

  for (const [queueName, entry] of params.registry.queueHandlers) {
    handlers.set(queueName, async (payload, meta) => {
      if (isStaleQueueHandlerGeneration(params.registry, entry)) {
        params.registry.diagnostics.push({
          level: "warn",
          code: "plugin.runtime.stale_generation",
          pluginId: entry.pluginId,
          sourceInfo: entry.sourceInfo,
          message: `Stale queue handler skipped for ${queueName}`,
          remediation:
            "Restart the API or unload the previous plugin generation before processing queued work.",
        });
        throw new QueueStaleGenerationError(queueName);
      }
      const tenantId = getPayloadTenantId(payload);
      const tenantPluginOverrides =
        tenantId && params.resolveTenantPluginOverrides
          ? await params.resolveTenantPluginOverrides(tenantId)
          : {};
      const capabilityResolution = resolvePluginCapability({
        registry: params.registry,
        pluginId: entry.pluginId,
        capability: queueName,
        contributionKind: "queue",
        registeredCapabilities: getRegisteredQueueCapabilities(
          params.registry,
          entry.pluginId
        ),
        tenantId,
        tenantPluginOverrides,
      });
      if (!capabilityResolution.allowed) {
        params.registry.diagnostics.push(...capabilityResolution.diagnostics);
        throw new QueueCapabilityBlockedError(capabilityResolution.reason);
      }

      await entry.handler(payload, meta);
    });
  }

  return handlers;
}
