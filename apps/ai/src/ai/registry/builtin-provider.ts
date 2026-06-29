import { engentyCLIAgentConfig } from "../../../ai/agents/engenty.cli/index.js";
import {
  createBuiltinRegistryTools,
  engentyCopilotAgentConfig,
} from "../../../ai/agents/engenty.copilot/copilot-agent.js";
import type {
  AgentConfig,
  AiRegistryProvider,
  MastraToolDefinition,
} from "./types.js";

export class BuiltinProvider implements AiRegistryProvider {
  readonly providerId = "builtin";

  private readonly agentConfigs: Map<string, AgentConfig>;
  private readonly tools: Map<string, MastraToolDefinition>;

  constructor(options: {
    agentConfigs?: AgentConfig[];
    tools?: Record<string, MastraToolDefinition>;
  }) {
    this.agentConfigs = new Map(
      (options.agentConfigs ?? []).map((config) => [config.id, config])
    );
    this.tools = new Map(Object.entries(options.tools ?? {}));
  }

  async getAgentConfig(id: string): Promise<AgentConfig | undefined> {
    return this.agentConfigs.get(id);
  }

  async getTool(id: string): Promise<MastraToolDefinition | undefined> {
    return this.tools.get(id);
  }

  async listAgentConfigs(): Promise<AgentConfig[]> {
    return [...this.agentConfigs.values()].map((config) => ({
      ...config,
      source: config.source ?? "builtin",
    }));
  }
}

export function createBuiltinProvider(): BuiltinProvider {
  return new BuiltinProvider({
    agentConfigs: [
      engentyCopilotAgentConfig,
      // CLI Agent is registered here so the registry can resolve it when
      // the copilot's subAgents list references "engenty.cli" by ID.
      engentyCLIAgentConfig,
    ],
    tools: createBuiltinRegistryTools(),
  });
}
