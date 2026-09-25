import type { AgentConfig } from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";
import { bindTestModelsPerTest } from "../../../__tests__/helpers/test-model-bindings.js";
import { assembleDynamicAgent } from "../assemble-dynamic-agent.js";

bindTestModelsPerTest();

describe("delegated leaf assembly", () => {
  it("cannot retain nested message_agent or configured sub-agents", async () => {
    const messageAgent = { execute: vi.fn(), id: "message_agent" } as never;
    const configs = new Map<string, AgentConfig>([
      [
        "specialist",
        {
          id: "specialist",
          instructions: "Work the assigned leaf task.",
          model: "test-model",
          name: "Specialist",
          skillIds: [],
          source: "builtin",
          subAgents: [{ id: "nested" }],
          toolIds: ["message_agent"],
        },
      ],
      [
        "nested",
        {
          id: "nested",
          instructions: "Nested",
          model: "test-model",
          name: "Nested",
          skillIds: [],
          source: "builtin",
          toolIds: [],
        },
      ],
    ]);
    const registry = {
      getAgentConfig: async (id: string) => configs.get(id),
      getTool: async (id: string) =>
        id === "message_agent" ? messageAgent : undefined,
    } as never;

    const agent = await assembleDynamicAgent(registry, "specialist", {
      blockedToolIds: ["message_agent"],
      extraTools: { message_agent: messageAgent },
      skipSubAgents: true,
    });
    expect(await agent.listTools()).not.toHaveProperty("message_agent");
    expect(await agent.listAgents()).toEqual({});
  });
});
