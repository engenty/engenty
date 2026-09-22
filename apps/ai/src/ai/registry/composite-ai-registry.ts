import { applyWorkerSandboxDefault } from "@engenty/ai-core";

import type {
  AgentConfig,
  AgentResolveContext,
  AiRegistry,
  AiRegistryProvider,
  MastraToolDefinition,
} from "./types.js";

export class CompositeAiRegistry implements AiRegistry {
  readonly providers: readonly AiRegistryProvider[];

  constructor(providers: readonly AiRegistryProvider[]) {
    this.providers = providers;
  }

  async getAgentConfig(
    id: string,
    context?: AgentResolveContext
  ): Promise<AgentConfig | undefined> {
    let codeConfig: AgentConfig | undefined;
    let databaseConfig: AgentConfig | undefined;
    for (const provider of this.providers) {
      const config = await provider.getAgentConfig(id, context);
      if (!config) {
        continue;
      }
      if (provider.providerId === "database") {
        databaseConfig = config;
        continue;
      }
      if (!codeConfig) {
        codeConfig = config;
      }
    }
    const merged = overlayTenantConnectorIds(codeConfig, databaseConfig);
    return merged ? applyWorkerSandboxDefault(merged) : undefined;
  }

  async getTool(id: string): Promise<MastraToolDefinition | undefined> {
    for (const provider of this.providers) {
      const tool = await provider.getTool(id);
      if (tool) {
        return tool;
      }
    }
    return;
  }

  async listAgentConfigs(): Promise<AgentConfig[]> {
    const codeById = new Map<string, AgentConfig>();
    const databaseById = new Map<string, AgentConfig>();
    const order: string[] = [];
    const seen = new Set<string>();
    for (const provider of this.providers) {
      if (!hasListAgentConfigs(provider)) {
        continue;
      }
      const fromDatabase = provider.providerId === "database";
      for (const config of await provider.listAgentConfigs()) {
        const normalized = applyWorkerSandboxDefault(config);
        if (fromDatabase) {
          databaseById.set(config.id, normalized);
        } else if (!codeById.has(config.id)) {
          codeById.set(config.id, normalized);
        }
        if (!seen.has(config.id)) {
          seen.add(config.id);
          order.push(config.id);
        }
      }
    }
    return order.flatMap((id) => {
      const merged = overlayTenantConnectorIds(
        codeById.get(id),
        databaseById.get(id)
      );
      return merged ? [merged] : [];
    });
  }
}

/**
 * A tenant row for a code agent (builtin / module / function) stores
 * `connectorIds` and other PATCH fields, but must not replace the code
 * definition. Snapshotting the copilot into `engenty_ai_agents` would freeze
 * tools, drop `toolGating` / `interfaceRole` (those columns are not written),
 * and flip `source` to `database`. Overlay the preferred-plugin list only.
 *
 * Hired agents exist only in the database: there is no code config, so the
 * row is the definition.
 */
export function overlayTenantConnectorIds(
  codeConfig: AgentConfig | undefined,
  databaseConfig: AgentConfig | undefined
): AgentConfig | undefined {
  if (codeConfig && databaseConfig) {
    return {
      ...codeConfig,
      connectorIds: databaseConfig.connectorIds ?? [],
    };
  }
  return codeConfig ?? databaseConfig;
}

function hasListAgentConfigs(
  provider: AiRegistryProvider
): provider is AiRegistryProvider & {
  listAgentConfigs: () => Promise<AgentConfig[]>;
} {
  return "listAgentConfigs" in provider;
}
