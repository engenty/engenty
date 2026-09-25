import { describe, expect, it } from "vitest";
import type { CustomAgentConfig } from "../../lib/admin/ai-runtime-api";
import {
  buildAgentConfigFromDraft,
  createAgentDraft,
  createEmptyAgentDraft,
  parseAgentSubAgentsInput,
  validateAgentDraft,
} from "./agent-draft";

/** Opaque fixture id — not the package default; round-trip only. */
const FIXTURE_MODEL = "openai/test-agent-model";

const config: CustomAgentConfig = {
  agentScope: "shared",
  description: "Handles research requests.",
  engenty: "drop",
  id: "tenant.research-agent",
  instructions: "Research the question and summarize evidence.",
  model: FIXTURE_MODEL,
  name: "Research agent",
  skillIds: ["research", "summarize"],
  subAgents: [{ alias: "tools", id: "engenty_tools" }],
  toolIds: ["engenty_tools_search", "engenty_tool_execute"],
};

describe("agent-draft", () => {
  it("leaves the model unset on new drafts (role binding decides)", () => {
    const draft = createEmptyAgentDraft();
    expect(draft.model).toBe("");
    expect(buildAgentConfigFromDraft(draft)).not.toHaveProperty("model");
    expect(draft.agentScope).toBe("shared");
    expect(draft.engenty).toBe("round");
    expect(draft.spaceIds).toEqual([]);
    expect(draft.connectorIds).toEqual([]);
  });

  it("round-trips an agent config through the form draft", () => {
    const draft = createAgentDraft(config);

    expect(buildAgentConfigFromDraft(draft)).toEqual(config);
  });

  it("round-trips a preferred connector subset", () => {
    const withConnectors: CustomAgentConfig = {
      ...config,
      connectorIds: ["google-gmail", "slack"],
    };
    expect(buildAgentConfigFromDraft(createAgentDraft(withConnectors))).toEqual(
      withConnectors
    );
  });

  it("round-trips starter chips including German overrides", () => {
    const withStarters: CustomAgentConfig = {
      ...config,
      starters: [
        {
          id: "job",
          label: "Do the job",
          prompt: "Please do the job.",
          locales: {
            de: { label: "Die Aufgabe", prompt: "Bitte die Aufgabe." },
          },
        },
      ],
    };
    expect(buildAgentConfigFromDraft(createAgentDraft(withStarters))).toEqual(
      withStarters
    );
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

  it("requires at least one space only when asked", () => {
    const draft = createAgentDraft(config);
    expect(validateAgentDraft(draft)).toBeNull();
    expect(validateAgentDraft(draft, { requireSpaces: true })).toContain(
      "space"
    );
    expect(
      validateAgentDraft(
        { ...draft, spaceIds: ["00000000-0000-4000-8000-000000000001"] },
        { requireSpaces: true }
      )
    ).toBeNull();
  });
});
