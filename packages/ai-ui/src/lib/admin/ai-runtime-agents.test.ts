import { describe, expect, it } from "vitest";
import { mapRegistryAgentToRegisteredAgent } from "./ai-runtime-api.js";

describe("mapRegistryAgentToRegisteredAgent", () => {
  it("maps builtin copilot agents to engenty module_id", () => {
    const mapped = mapRegistryAgentToRegisteredAgent({
      id: "engenty.copilot",
      name: "Engenty Copilot",
      description: "General assistant",
      source: "builtin",
      skillIds: ["tasks.assist"],
      toolIds: ["engenty_tools_search"],
    });

    expect(mapped).toMatchObject({
      id: "engenty.copilot",
      module_id: "engenty",
      name: "Engenty Copilot",
      skills: ["tasks.assist"],
      tools: ["engenty_tools_search"],
      chat_triggers: {
        include_in_chat_picker: true,
        is_active: true,
        mention_routing_enabled: true,
      },
    });
  });

  it("maps module agents using id prefix", () => {
    const mapped = mapRegistryAgentToRegisteredAgent({
      id: "tasks.assist",
      name: "Tasks Assist",
      source: "module",
    });

    expect(mapped.module_id).toBe("tasks");
  });
});
