import type { AgentConfig } from "@engenty/ai-core";
import { vi } from "vitest";
import { engentyCLIAgentConfig } from "../../../../ai/agents/engenty.cli/index.js";
import { engentyCopilotAgentConfig } from "../../../../ai/agents/engenty.copilot/copilot-agent.js";
import type { AiRegistry } from "../../registry/index.js";

const offlineSubAgentConfigs: AgentConfig[] = [
  {
    ...engentyCLIAgentConfig,
    workspace: { enabled: false },
  },
];

/** Keeps harness unit tests offline — no Docker sandboxes from builtin sub-agents. */
export function createOfflineCopilotHarnessRegistry(
  overrides: Partial<AgentConfig> = {}
): AiRegistry {
  const config: AgentConfig = {
    ...engentyCopilotAgentConfig,
    ...overrides,
    id: overrides.id ?? engentyCopilotAgentConfig.id,
    subAgents: overrides.subAgents ?? [],
    workspace: overrides.workspace ?? { enabled: false },
  };
  const configs = new Map<string, AgentConfig>([[config.id, config]]);
  for (const subAgent of config.subAgents ?? []) {
    const subConfig = offlineSubAgentConfigs.find(
      (candidate) => candidate.id === subAgent.id
    );
    if (subConfig) {
      configs.set(subConfig.id, subConfig);
    }
  }
  return {
    getAgentConfig: vi.fn(async (id: string) => configs.get(id)),
    getTool: vi.fn(async () => undefined),
    listAgentConfigs: vi.fn(async () => [...configs.values()]),
  };
}
