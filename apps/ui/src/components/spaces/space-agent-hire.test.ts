import { DEFAULT_AI_CHAT_MODEL_ID } from "@engenty/ai-core/browser";
import { describe, expect, it } from "vitest";
import {
  agentIdFromHireName,
  buildSpaceAgentHireInput,
  FALLBACK_HIRE_AGENT_ID,
  FIRST_ENGENTY_SKILL_ID,
  FIRST_ENGENTY_TOOL_IDS,
  firstEngentyDraft,
  hireAgentId,
  hireInstructions,
  type SpaceAgentHireTemplate,
} from "./space-agent-hire";

const ART: SpaceAgentHireTemplate = {
  agentId: "art.director",
  description: "Reviews visual work against the brand.",
  instructions: "You are an art director.\n\n## How you work\n- Look first.",
  name: "Art Director",
  skillIds: [],
  templateId: "art-director",
  toolIds: ["engenty_tools_search", "engenty_tool_execute"],
};

describe("space agent hire", () => {
  it("slugs a display name into a registry id", () => {
    expect(agentIdFromHireName("Friend")).toBe("friend");
    expect(agentIdFromHireName("Deck Designer")).toBe("deck-designer");
    expect(agentIdFromHireName("  ")).toBe(FALLBACK_HIRE_AGENT_ID);
  });

  it("keeps the role id when the template name is unchanged", () => {
    expect(
      hireAgentId({
        description: ART.description,
        engenty: "oval",
        name: "Art Director",
        template: ART,
      })
    ).toBe("art.director");
  });

  it("re-slugs when the person renames a role", () => {
    expect(
      hireAgentId({
        description: ART.description,
        engenty: "oval",
        name: "Brand Lead",
        template: ART,
      })
    ).toBe("brand-lead");
  });

  it("seeds instructions from the description when hiring blank", () => {
    const instructions = hireInstructions({
      description: "Watch deploys and report what breaks.",
      engenty: "round",
      name: "QA Engineer",
      template: null,
    });
    expect(instructions).toContain("QA Engineer");
    expect(instructions).toContain("Watch deploys and report what breaks.");
    expect(instructions).toContain("## What you are here for");
  });

  it("keeps template instructions when a role is picked", () => {
    expect(
      hireInstructions({
        description: "A shorter note.",
        engenty: "oval",
        name: "Art Director",
        template: ART,
      })
    ).toBe(ART.instructions);
  });

  it("builds a shared Engenty payload mounted on the space", () => {
    const input = buildSpaceAgentHireInput(
      {
        description: "Turns notes into an on-brand deck.",
        engenty: "round",
        name: "Deck Designer",
        template: null,
      },
      "space-1"
    );
    expect(input).toMatchObject({
      agentScope: "shared",
      description: "Turns notes into an on-brand deck.",
      engenty: "round",
      id: "deck-designer",
      model: DEFAULT_AI_CHAT_MODEL_ID,
      name: "Deck Designer",
      skillIds: [],
      spaceIds: ["space-1"],
      toolIds: ["engenty_tools_search", "engenty_tool_execute"],
    });
    expect(input.instructions).toContain("Turns notes into an on-brand deck.");
  });

  it("pre-fills the first engenty from the space and its purpose", () => {
    const draft = firstEngentyDraft("Acme GmbH", {
      description:
        "A client or engagement: offers, invoices, contacts and the projects that go with them.",
      name: "Client",
    });
    expect(draft.name).toBe("Chief of Staff");
    expect(draft.description).toContain('First engenty in "Acme GmbH".');
    expect(draft.description).toContain("This space is a client or engagement");
    const input = buildSpaceAgentHireInput(draft, "space-1");
    expect(input).toMatchObject({
      id: "chief-of-staff",
      skillIds: [FIRST_ENGENTY_SKILL_ID],
      spaceIds: ["space-1"],
      toolIds: FIRST_ENGENTY_TOOL_IDS,
    });
    expect(input.instructions).toContain(FIRST_ENGENTY_SKILL_ID);
    expect(input.instructions).toContain("Acme GmbH");
  });

  it("re-slugs a renamed first engenty and keeps its playbook", () => {
    const draft = { ...firstEngentyDraft("Acme GmbH", null), name: "Ada" };
    const input = buildSpaceAgentHireInput(draft, "space-1");
    expect(input.id).toBe("ada");
    expect(input.skillIds).toEqual([FIRST_ENGENTY_SKILL_ID]);
    expect(draft.description).not.toContain("This space is");
  });
});
