import type { AgentConfig } from "@engenty/ai-core";
import { vi } from "vitest";
import { engentyCLIAgentConfig } from "../../../../ai/agents/engenty.cli/index.js";
import { engentyCopilotAgentConfig } from "../../../../ai/agents/engenty.copilot/copilot-agent.js";
import type { AiRegistry } from "../../registry/index.js";

const offlineSubAgentConfigs: AgentConfig[] = [
  {
    ...engentyCLIAgentConfig,
    // `preset` is `.default("custom")` in the schema, so the inferred output
    // type requires it even though callers may omit it on input.
    workspace: { enabled: false, preset: "custom" },
  },
];

/**
 * Keeps harness unit tests offline — no Docker sandboxes from builtin sub-agents.
 *
 * `listAgentConfigs` is not on `AiRegistry`; `base-documents.ts` duck-types for
 * it, so the return type declares it explicitly rather than smuggling it past
 * the excess-property check.
 */
export function createOfflineCopilotHarnessRegistry(
  overrides: Partial<AgentConfig> = {}
): AiRegistry & { listAgentConfigs: () => Promise<AgentConfig[]> } {
  const config: AgentConfig = {
    ...engentyCopilotAgentConfig,
    ...overrides,
    id: overrides.id ?? engentyCopilotAgentConfig.id,
    subAgents: overrides.subAgents ?? [],
    workspace: overrides.workspace ?? { enabled: false, preset: "custom" },
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
