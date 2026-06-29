import type {
  AgentConfig,
  AiRegistry,
  AiRegistryProvider,
  MastraToolDefinition,
} from "./types.js";

export class CompositeAiRegistry implements AiRegistry {
  readonly providers: readonly AiRegistryProvider[];

  constructor(providers: readonly AiRegistryProvider[]) {
    this.providers = providers;
  }

  async getAgentConfig(id: string): Promise<AgentConfig | undefined> {
    for (const provider of this.providers) {
      const config = await provider.getAgentConfig(id);
      if (config) {
        return config;
      }
    }
    return;
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
    const configsById = new Map<string, AgentConfig>();
    for (const provider of this.providers) {
      if (!hasListAgentConfigs(provider)) {
        continue;
      }
      for (const config of await provider.listAgentConfigs()) {
        if (!configsById.has(config.id)) {
          configsById.set(config.id, config);
        }
      }
    }
    return [...configsById.values()];
  }
}

function hasListAgentConfigs(
  provider: AiRegistryProvider
): provider is AiRegistryProvider & {
  listAgentConfigs: () => Promise<AgentConfig[]>;
} {
  return "listAgentConfigs" in provider;
}
