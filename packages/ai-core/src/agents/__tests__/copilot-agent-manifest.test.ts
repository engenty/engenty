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
    expect(m.instruction_files).toEqual([
      "AGENTS.md",
      "SOUL.md",
      "SKILLS.md",
    ]);
    expect(m.instruction_keys).toEqual([
      "engenty.copilot.agents",
      "engenty.copilot.soul",
      "engenty.copilot.skills",
    ]);
    expect(m.tools).toContain("engentyApiCatalog");
    expect(m.tools).toContain("engentyApi");
    expect(m.tools).toContain("memory");
    expect(m.tools).toContain("chatThreadSearch");
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
