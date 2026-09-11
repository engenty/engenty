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
    for (const provider of this.providers) {
      const config = await provider.getAgentConfig(id, context);
      if (config) {
        // The Worker compute default (PLAN-agent-computers.md §1.1), applied
        // at the read seam so every consumer — chat, delegation, headless
        // runs, the registry API — sees one answer. Providers stay dumb;
        // declarations (a sandbox block, `enabled:false`) always win.
        return applyWorkerSandboxDefault(config);
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
          configsById.set(config.id, applyWorkerSandboxDefault(config));
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
