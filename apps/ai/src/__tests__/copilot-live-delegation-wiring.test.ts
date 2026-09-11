import { describe, expect, it } from "vitest";
import {
  createBuiltinRegistryTools,
  createEngentyCopilotAgentTools,
} from "../../ai/agents/engenty.copilot/copilot-agent.js";

describe("Copilot live delegation wiring", () => {
  it("exposes both tools in actual runtime registries", () => {
    for (const tools of [
      createEngentyCopilotAgentTools(),
      createBuiltinRegistryTools(),
    ]) {
      expect(tools.registry_agents_list).toBeDefined();
      expect(tools.message_agent).toBeDefined();
    }
  });
});
