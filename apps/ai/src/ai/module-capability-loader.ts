import type {
  AgentConfig,
  DynamicAiModuleCapability,
  DynamicAiModuleCapabilityLoader,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getCurrentEngentyToolsClient } from "../../ai/tools/engenty-tools/lib/client.js";

const logger = createLogger({ name: "module-capability-loader" });

import type {
  EngentyCoreModuleCapabilitySeed,
  EngentyPluginListItem,
  EngentyToolContract,
} from "./core-http-client.js";

type CoreOperationInvoker = (
  operationId: string,
  input?: unknown
) => Promise<unknown | null>;

export interface DynamicAiModuleCapabilityFactoryContext {
  invokeOperation: CoreOperationInvoker;
}

export type DynamicAiModuleCapabilityFactory = (
  context: DynamicAiModuleCapabilityFactoryContext
) => DynamicAiModuleCapability | Promise<DynamicAiModuleCapability>;

export class StaticDynamicAiModuleCapabilityLoader
  implements DynamicAiModuleCapabilityLoader
{
  private readonly factories: readonly DynamicAiModuleCapabilityFactory[];
  private readonly invokeOperation: CoreOperationInvoker;

  constructor(options: {
    factories: readonly DynamicAiModuleCapabilityFactory[];
    invokeOperation?: CoreOperationInvoker;
  }) {
    this.factories = options.factories;
    this.invokeOperation =
      options.invokeOperation ?? createCoreBackedModuleOperationInvoker();
  }

  async listModuleCapabilities(): Promise<DynamicAiModuleCapability[]> {
    return Promise.all(
      this.factories.map((factory) =>
        factory({ invokeOperation: this.invokeOperation })
      )
    );
  }
}

export class CoreCatalogDynamicAiModuleCapabilityLoader
  implements DynamicAiModuleCapabilityLoader
{
  async listModuleCapabilities(): Promise<DynamicAiModuleCapability[]> {
    const client = getCurrentEngentyToolsClient();
    if (!client.ok) {
      throw new Error(client.message);
    }
    const workspace = await client.client.getWorkspaceContext();
    const [plugins, toolContracts, moduleCapabilitySeeds] = await Promise.all([
      client.client.listPlugins(workspace.currentTenant?.id),
      client.client.listToolContracts(),
      client.client.listModuleCapabilitySeeds(),
    ]);
    const activeModuleIds = new Set(
      plugins.filter(isActiveAiModule).map((plugin) => plugin.id)
    );
    const toolsByModule = groupToolContractsByModule(toolContracts);
    const seedsByModule = groupModuleCapabilitySeedsByModule(
      moduleCapabilitySeeds.capabilities
    );
    const capabilities: DynamicAiModuleCapability[] = [];

    for (const moduleId of activeModuleIds) {
      const moduleTools = toolsByModule.get(moduleId) ?? [];
      const seed = seedsByModule.get(moduleId);
      if (moduleTools.length === 0 && !seed) {
        continue;
      }
      capabilities.push({
        moduleId,
        ...(seed?.agentConfigs
          ? {
              agentConfigs: seed.agentConfigs.map((config) =>
                normalizeModuleAgentConfig(config)
              ),
            }
          : {}),
        ...(seed?.skills ? { skills: seed.skills } : {}),
        ...(seed?.actions?.length ? { actions: seed.actions } : {}),
        ...(seed?.routines?.length ? { routines: seed.routines } : {}),
        ...(moduleTools.length > 0
          ? {
              tools: Object.fromEntries(
                moduleTools.map((contract) => [
                  resolveToolContractId(contract),
                  buildCoreBackedMastraTool(contract),
                ])
              ),
            }
          : {}),
      });
    }

    return capabilities;
  }
}

export function createCoreBackedModuleOperationInvoker(): CoreOperationInvoker {
  return async (operationId, input) => {
    const client = getCurrentEngentyToolsClient();
    if (!client.ok) {
      throw new Error(client.message);
    }
    return client.client.invokeTool(operationId, input ?? {});
  };
}

export function createDefaultModuleCapabilityLoader(): DynamicAiModuleCapabilityLoader {
  return new CoreCatalogDynamicAiModuleCapabilityLoader();
}

function isActiveAiModule(plugin: EngentyPluginListItem) {
  const isModule =
    plugin.kind === "module" ||
    (plugin.provides ?? []).some(
      (capability) =>
        capability === `module.${plugin.id}` ||
        capability === `ui.route.module.${plugin.id}`
    );
  if (!isModule) {
    return false;
  }
  if (plugin.loaded === false || plugin.enabled === false) {
    return false;
  }
  if (
    plugin.tenantEnabled === false ||
    plugin.effectiveState?.tenantEnabled === false ||
    plugin.effectiveState?.globallyEnabled === false ||
    plugin.effectiveState?.allowed === false
  ) {
    return false;
  }
  return true;
}

function groupToolContractsByModule(contracts: readonly EngentyToolContract[]) {
  const grouped = new Map<string, EngentyToolContract[]>();
  for (const contract of contracts) {
    const moduleId = contract.moduleId?.trim();
    const toolId = resolveToolContractId(contract);
    if (!(moduleId && toolId)) {
      continue;
    }
    const current = grouped.get(moduleId) ?? [];
    current.push(contract);
    grouped.set(moduleId, current);
  }
  return grouped;
}

function groupModuleCapabilitySeedsByModule(
  seeds: readonly EngentyCoreModuleCapabilitySeed[]
) {
  const grouped = new Map<string, EngentyCoreModuleCapabilitySeed>();
  for (const seed of seeds) {
    const moduleId = seed.moduleId?.trim();
    if (!moduleId) {
      continue;
    }
    grouped.set(moduleId, seed);
  }
  return grouped;
}

function normalizeModuleAgentConfig(
  config: NonNullable<EngentyCoreModuleCapabilitySeed["agentConfigs"]>[number]
): AgentConfig {
  return {
    description: config.description,
    id: config.id,
    instructions: config.instructions,
    model: config.model,
    name: config.name,
    skillIds: config.skillIds ?? [],
    source: config.source ?? "module",
    toolIds: config.toolIds ?? [],
  };
}

// The model can only fill parameters it can see: directly-attached catalog
// tools must carry the contract's real input schema. A generic record schema
// here made agents call e.g. knowledge_base_article_search with `{}` (no
// query) — verified live 2026-06-12.
function resolveToolContractInputSchema(
  toolId: string,
  contract: EngentyToolContract
): z.ZodType {
  const jsonSchema = contract.inputSchema?.jsonSchema;
  if (!jsonSchema) {
    return z.record(z.string(), z.unknown()).default({});
  }
  try {
    return z.fromJSONSchema(jsonSchema);
  } catch (err) {
    // One module's malformed schema must not break loading every capability
    // tool — degrade to the permissive shape, but say so loudly.
    logger.error("tool contract schema conversion failed — degrading", {
      toolId,
      err: err instanceof Error ? err.message : String(err),
    });
    return z.record(z.string(), z.unknown()).default({});
  }
}

function buildCoreBackedMastraTool(contract: EngentyToolContract) {
  const toolId = resolveToolContractId(contract);
  if (!toolId) {
    throw new Error("Core returned a module tool contract without a tool id.");
  }
  return createTool({
    id: toolId,
    description:
      contract.description ??
      contract.summary ??
      `Execute ${toolId} through Engenty core.`,
    inputSchema: resolveToolContractInputSchema(toolId, contract),
    execute: async (input) => {
      const client = getCurrentEngentyToolsClient();
      if (!client.ok) {
        throw new Error(client.message);
      }
      return client.client.invokeTool(toolId, input ?? {});
    },
  });
}

function resolveToolContractId(contract: EngentyToolContract) {
  return contract.toolId ?? contract.operationId ?? contract.methodName ?? "";
}
