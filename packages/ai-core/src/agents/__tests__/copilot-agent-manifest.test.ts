import { beforeEach, describe, expect, it } from "vitest";
import {
  copilotAgentManifestSchema,
  getEngentyCopilotAgentManifest,
  resetEngentyCopilotAgentManifestCache,
} from "../copilot-agent-manifest.js";
import { GENERAL_CHAT_AGENT_ID } from "../copilot-constants.js";

describe("getEngentyCopilotAgentManifest", () => {
  beforeEach(() => {
    resetEngentyCopilotAgentManifestCache();
  });

  it("loads and validates apps ui engenty.copilot agent.json", () => {
    const m = getEngentyCopilotAgentManifest();
    expect(m.id).toBe(GENERAL_CHAT_AGENT_ID);
    expect(m.module_id).toBe("engenty");
    expect(m.instruction_files).toEqual(["AGENTS.md", "SOUL.md", "SKILLS.md"]);
    expect(m.instruction_keys).toEqual([
      "engenty.copilot.agents",
      "engenty.copilot.soul",
      "engenty.copilot.skills",
    ]);
    expect(m.tools).toContain("chatThreadSearch");
    expect(m.tools).toContain("registry_agents_list");
    expect(m.tools).toContain("message_agent");
    // Pinned in order so a skill added or dropped is a deliberate edit here,
    // not a silent change to what the copilot can do.
    expect(m.skills).toEqual([
      "work-routing",
      "hire-agent",
      "durable-work",
      "routines",
      "space-data",
      "space-setup",
      "getting-started",
    ]);
  });
});

describe("copilotAgentManifestSchema", () => {
  it("accepts minimal valid v1 document", () => {
    const parsed = copilotAgentManifestSchema.parse({
      $schema: "engenty/ai-agent-manifest/v1",
      description: "d",
      id: "x_y",
      instruction_keys: [],
      name: "N",
      module_id: "engenty",
      skills: [],
      tools: ["engentyApiCatalog"],
    });
    expect(parsed.id).toBe("x_y");
  });
});
