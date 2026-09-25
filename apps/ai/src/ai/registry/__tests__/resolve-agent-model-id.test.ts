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
  gradedModelIds: { low: "t/low", medium: "t/medium", high: "t/high" },
};

describe("resolveAgentModelId", () => {
  it("explicit modelOverride beats tenant resolution", () => {
    expect(
      resolveAgentModelId(agent({ modelOverride: "pin/model" }), runtime)
    ).toBe("pin/model");
  });

  it("falls back to config.model when no runtime config is present", () => {
    expect(resolveAgentModelId(agent(), undefined)).toBe("static/model");
  });

  it("places an unpinned run on the agent's declared effort tier", () => {
    expect(resolveAgentModelId(agent({ effort: "high" }), runtime)).toBe(
      "t/high"
    );
    expect(resolveAgentModelId(agent({ effort: "low" }), runtime)).toBe(
      "t/low"
    );
  });

  it("keeps the resolved chat model when the run's tier is pinned", () => {
    expect(
      resolveAgentModelId(agent({ effort: "high" }), {
        ...runtime,
        effortPinned: true,
      })
    ).toBe("t/chat");
  });

  it("uses the chat model for supervisors and leaves without an effort", () => {
    expect(
      resolveAgentModelId(
        agent({ subAgents: [{ id: "child" }] }) as AgentConfig,
        runtime
      )
    ).toBe("t/chat");
    expect(resolveAgentModelId(agent(), runtime)).toBe("t/chat");
  });

  it("falls back to chat when the effort tier is unbound", () => {
    const partial: RuntimeModelConfig = { chatModelId: "t/chat" };
    expect(resolveAgentModelId(agent({ effort: "high" }), partial)).toBe(
      "t/chat"
    );
  });

  it("skips an effort tier outside the tenant grants", () => {
    expect(
      resolveAgentModelId(agent({ effort: "high" }), {
        ...runtime,
        grants: { allowed_models: ["t/chat"] },
      })
    ).toBe("t/chat");
  });
});
