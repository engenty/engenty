import type { AgentConfig } from "@engenty/ai-core";
import { describe, expect, it } from "vitest";
import {
  type RuntimeModelConfig,
  resolveAgentModelId,
} from "../assemble-dynamic-agent.js";

function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "a",
    name: "A",
    instructions: "x",
    model: "static/model",
    skillIds: [],
    toolIds: [],
    ...overrides,
  };
}

const runtime: RuntimeModelConfig = {
  chatModelId: "t/chat",
  routingModelId: "t/routing",
  researchModelId: "t/research",
  planningCodingModelId: "t/planning",
  safeguardModelId: "t/safeguard",
};

describe("resolveAgentModelId", () => {
  it("explicit modelOverride beats tenant/purpose resolution", () => {
    expect(
      resolveAgentModelId(agent({ modelOverride: "pin/model" }), runtime)
    ).toBe("pin/model");
  });

  it("falls back to config.model when no runtime config is present", () => {
    expect(resolveAgentModelId(agent(), undefined)).toBe("static/model");
  });

  it("routes by explicit purpose", () => {
    expect(resolveAgentModelId(agent({ purpose: "research" }), runtime)).toBe(
      "t/research"
    );
    expect(
      resolveAgentModelId(agent({ purpose: "planning_coding" }), runtime)
    ).toBe("t/planning");
    expect(resolveAgentModelId(agent({ purpose: "safeguard" }), runtime)).toBe(
      "t/safeguard"
    );
  });

  it("defaults to routing for supervisors and chat for leaves", () => {
    expect(
      resolveAgentModelId(
        agent({ subAgents: [{ id: "child" }] }) as AgentConfig,
        runtime
      )
    ).toBe("t/routing");
    expect(resolveAgentModelId(agent(), runtime)).toBe("t/chat");
  });

  it("falls back to chat when a purpose tier is unset", () => {
    const partial: RuntimeModelConfig = {
      chatModelId: "t/chat",
      routingModelId: "t/routing",
    };
    expect(resolveAgentModelId(agent({ purpose: "research" }), partial)).toBe(
      "t/chat"
    );
  });
});
