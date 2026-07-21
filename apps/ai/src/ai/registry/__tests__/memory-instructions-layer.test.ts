// The memory-discipline layer attaches centrally in buildAgentInstructions:
// any agent whose toolIds carry memory_save gets the full "## Memory" policy,
// agents without the tools stay untouched.

import type { AgentConfig } from "@engenty/ai-core";
import { describe, expect, it } from "vitest";
import { MEMORY_INSTRUCTIONS } from "../../instructions/memory-instructions.js";
import { buildAgentInstructions } from "../assemble-dynamic-agent.js";

function config(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "test.agent",
    name: "Test agent",
    instructions: "Base instructions.",
    model: "anthropic/claude-sonnet-5",
    skillIds: [],
    toolIds: [],
    ...overrides,
  };
}

describe("buildAgentInstructions — memory layer", () => {
  it("appends the memory policy when the agent carries memory_save", () => {
    const instructions = buildAgentInstructions(
      config({
        toolIds: ["memory_save", "memory_record_search"],
      })
    );
    expect(instructions).toContain("Base instructions.");
    expect(instructions).toContain("## Memory");
    expect(instructions).toContain(MEMORY_INSTRUCTIONS);
  });

  it("leaves agents without memory tools untouched", () => {
    const instructions = buildAgentInstructions(
      config({ toolIds: ["web_search"] })
    );
    expect(instructions).not.toContain("## Memory");
  });

  it("keeps the preferred-skills hint ordering (skills before memory)", () => {
    const instructions = buildAgentInstructions(
      config({ skillIds: ["contacts-search"], toolIds: ["memory_save"] })
    );
    const skillsAt = instructions.indexOf("Preferred skills:");
    const memoryAt = instructions.indexOf("## Memory");
    expect(skillsAt).toBeGreaterThan(-1);
    expect(memoryAt).toBeGreaterThan(skillsAt);
  });
});
