import { describe, expect, it } from "vitest";
import type { CustomAgentConfig } from "../../lib/admin/ai-runtime-api";
import {
  buildAgentConfigFromDraft,
  createAgentDraft,
  parseAgentSubAgentsInput,
  validateAgentDraft,
} from "./agent-draft";

const config: CustomAgentConfig = {
  description: "Handles research requests.",
  id: "tenant.research-agent",
  instructions: "Research the question and summarize evidence.",
  model: "openai/gpt-5-mini",
  name: "Research agent",
  skillIds: ["research", "summarize"],
  subAgents: [{ alias: "tools", id: "engenty_tools" }],
  toolIds: ["engenty_tools_search", "engenty_tool_execute"],
};

describe("agent-draft", () => {
  it("round-trips an agent config through the form draft", () => {
    const draft = createAgentDraft(config);

    expect(buildAgentConfigFromDraft(draft)).toEqual(config);
  });

  it("deduplicates picker selections while preserving order", () => {
    const draft = {
      ...createAgentDraft(config),
      skillIds: ["research", "summarize", "research"],
    };

    expect(buildAgentConfigFromDraft(draft).skillIds).toEqual([
      "research",
      "summarize",
    ]);
  });

  it("parses sub-agent aliases from line input", () => {
    expect(
      parseAgentSubAgentsInput("engenty_tools as tools\nengenty.copilot")
    ).toEqual([
      { alias: "tools", id: "engenty_tools" },
      { id: "engenty.copilot" },
    ]);
  });

  it("validates id, required fields, and self references", () => {
    expect(
      validateAgentDraft({ ...createAgentDraft(config), id: "Bad Id" })
    ).toContain("Agent id");
    expect(
      validateAgentDraft({ ...createAgentDraft(config), name: "" })
    ).toContain("Agent name");
    expect(
      validateAgentDraft({
        ...createAgentDraft(config),
        subAgentsText: "tenant.research-agent",
      })
    ).toContain("cannot list itself");
  });
});
