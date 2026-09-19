// A role template's whole job is to produce a draft that SAVES. One that
// fails validation, or collides with another template's id, would send someone
// straight into an error on the first thing they ever tried here.

import { describe, expect, it } from "vitest";
import { validateAgentDraft } from "./agent-draft.js";
import {
  AGENT_ROLE_TEMPLATES,
  draftFromRoleTemplate,
} from "./agent-role-templates.js";

describe("agent role templates", () => {
  it("every role produces a draft that passes validation as-is", () => {
    for (const template of AGENT_ROLE_TEMPLATES) {
      expect(validateAgentDraft(draftFromRoleTemplate(template))).toBeNull();
    }
  });

  it("ids are unique across roles", () => {
    const ids = AGENT_ROLE_TEMPLATES.map((template) => template.agentId);
    expect(new Set(ids).size).toBe(ids.length);
    const templateIds = AGENT_ROLE_TEMPLATES.map((t) => t.templateId);
    expect(new Set(templateIds).size).toBe(templateIds.length);
  });

  it("hands every role the gateway pair and nothing it did not ask for", () => {
    for (const template of AGENT_ROLE_TEMPLATES) {
      expect(template.toolIds).toContain("engenty_tools_search");
      expect(template.toolIds).toContain("engenty_tool_execute");
      // Capability creep is the failure mode here: a preset that quietly
      // grants more than its role needs is how agents end up over-permissioned.
      expect(template.toolIds.length).toBeLessThanOrEqual(4);
    }
  });

  it("carries real instructions, not a placeholder line", () => {
    for (const template of AGENT_ROLE_TEMPLATES) {
      expect(template.instructions.length).toBeGreaterThan(200);
      expect(template.instructions).toContain("## How you work");
    }
  });

  it("includes Looksmith as the identity role", () => {
    const looksmith = AGENT_ROLE_TEMPLATES.find(
      (template) => template.templateId === "looksmith"
    );
    expect(looksmith?.name).toBe("Looksmith");
    expect(looksmith?.agentId).toBe("studio.looksmith");
    expect(looksmith?.instructions).toContain("agent_look");
  });

  it("fills a draft from the role and leaves the rest empty to edit", () => {
    const template = AGENT_ROLE_TEMPLATES[0]!;
    const draft = draftFromRoleTemplate(template);
    expect(draft).toMatchObject({
      description: template.description,
      id: template.agentId,
      name: template.name,
    });
    expect(draft.skillIds).toEqual([]);
    expect(draft.subAgentsText).toBe("");
  });
});
