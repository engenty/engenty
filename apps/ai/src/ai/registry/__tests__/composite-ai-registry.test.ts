import { describe, expect, it, vi } from "vitest";
import { CompositeAiRegistry } from "../composite-ai-registry.js";
import { DatabaseProvider } from "../database-provider.js";
import type { AgentConfig, AiRegistryProvider } from "../types.js";

function config(overrides: Partial<AgentConfig> & { id: string }): AgentConfig {
  return {
    instructions: "do the work",
    model: "openai/gpt-4.1-mini",
    name: overrides.id,
    skillIds: [],
    toolIds: ["skill"],
    ...overrides,
  };
}

type ListableProvider = AiRegistryProvider & {
  listAgentConfigs?: () => Promise<AgentConfig[]>;
};

function provider(
  overrides: Partial<ListableProvider> & { providerId: string }
): ListableProvider {
  return {
    getAgentConfig: vi.fn(async () => undefined),
    getTool: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("CompositeAiRegistry connectorIds overlay", () => {
  it("keeps a code agent as the definition and overlays connectorIds from the tenant row", async () => {
    const builtin = config({
      id: "engenty.copilot",
      interfaceRole: "live",
      kind: "interface",
      source: "builtin",
      toolIds: ["skill", "hire_agent"],
    });
    const row = config({
      connectorIds: ["google-gmail"],
      id: "engenty.copilot",
      instructions: "stale snapshot",
      source: "database",
      toolIds: ["stale"],
    });
    const registry = new CompositeAiRegistry([
      new DatabaseProvider(
        {
          getAgentConfig: vi.fn(async () => row),
          getTool: vi.fn(async () => undefined),
          listAgents: vi.fn(async () => [row]),
        },
        { tenantId: "tenant-1" }
      ),
      provider({
        getAgentConfig: vi.fn(async (id) =>
          id === builtin.id ? builtin : undefined
        ),
        listAgentConfigs: vi.fn(async () => [builtin]),
        providerId: "builtin",
      }),
    ]);

    await expect(
      registry.getAgentConfig("engenty.copilot")
    ).resolves.toMatchObject({
      connectorIds: ["google-gmail"],
      id: "engenty.copilot",
      instructions: "do the work",
      interfaceRole: "live",
      kind: "interface",
      source: "builtin",
      toolIds: ["skill", "hire_agent"],
    });

    const listed = await registry.listAgentConfigs();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      connectorIds: ["google-gmail"],
      source: "builtin",
      toolIds: ["skill", "hire_agent"],
    });
  });

  it("returns a database-only hire unchanged", async () => {
    const hire = config({
      connectorIds: ["slack"],
      id: "sales.researcher",
      source: "database",
    });
    const registry = new CompositeAiRegistry([
      new DatabaseProvider(
        {
          getAgentConfig: vi.fn(async () => hire),
          getTool: vi.fn(async () => undefined),
          listAgents: vi.fn(async () => [hire]),
        },
        { tenantId: "tenant-1" }
      ),
      provider({ providerId: "builtin" }),
    ]);

    await expect(
      registry.getAgentConfig("sales.researcher")
    ).resolves.toMatchObject({
      connectorIds: ["slack"],
      id: "sales.researcher",
      source: "database",
    });
  });
});
