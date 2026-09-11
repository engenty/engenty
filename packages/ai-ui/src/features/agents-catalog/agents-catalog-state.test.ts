import { describe, expect, it } from "vitest";
import type { AiRegisteredAgent } from "../../lib/admin/ai-runtime-types";
import {
  canResetAgentInstructions,
  catalogGroupFromLegacyRoleParam,
  filterAgents,
  getAgentCatalogGroup,
  groupAgents,
  isAlwaysActiveAgent,
  isEditableAgent,
  resolveAgentInstructionDocumentKeys,
} from "./agents-catalog-state";

function agent(partial: Partial<AiRegisteredAgent>): AiRegisteredAgent {
  return {
    description: null,
    id: "test.agent",
    instruction_keys: [],
    module_id: "test",
    name: "Test Agent",
    skills: [],
    ...partial,
  };
}

const copilot = agent({
  id: "engenty.copilot",
  role: "copilot",
  source: "builtin",
});
const worker = agent({
  id: "contacts.manager",
  name: "Contacts",
  role: "specialist",
  source: "module",
});
const surface = agent({
  id: "knowledge-base.answers",
  role: "chat_surface",
  source: "module",
});
const external = agent({
  id: "chatbot.faq",
  managed_by_module: "chatbot",
  role: "external",
  source: "database",
});
const custom = agent({
  id: "my-helper",
  name: "My Helper",
  role: "specialist",
  source: "database",
});

describe("getAgentCatalogGroup", () => {
  it("maps roles and source to the section order", () => {
    expect(getAgentCatalogGroup(copilot)).toBe("leadership");
    expect(getAgentCatalogGroup(worker)).toBe("specialists");
    expect(getAgentCatalogGroup(surface)).toBe("chat_surfaces");
    expect(getAgentCatalogGroup(external)).toBe("external");
    expect(getAgentCatalogGroup(custom)).toBe("custom");
  });
});

describe("isAlwaysActiveAgent", () => {
  it("locks the Copilot", () => {
    expect(isAlwaysActiveAgent(copilot)).toBe(true);
    expect(isAlwaysActiveAgent(worker)).toBe(false);
  });
});

describe("isEditableAgent", () => {
  it("allows tenant-created database agents only", () => {
    expect(isEditableAgent(custom)).toBe(true);
    expect(isEditableAgent(external)).toBe(false);
    expect(isEditableAgent(copilot)).toBe(false);
    expect(isEditableAgent(worker)).toBe(false);
  });
});

describe("canResetAgentInstructions", () => {
  it("allows every non-external agent", () => {
    expect(canResetAgentInstructions(copilot)).toBe(true);
    expect(canResetAgentInstructions(worker)).toBe(true);
    expect(canResetAgentInstructions(custom)).toBe(true);
    expect(canResetAgentInstructions(external)).toBe(false);
  });
});

describe("resolveAgentInstructionDocumentKeys", () => {
  it("includes instruction_keys, AGENTS.md key, and owned catalog docs", () => {
    expect(
      resolveAgentInstructionDocumentKeys(
        agent({
          id: "engenty.copilot",
          instruction_keys: [
            "engenty.copilot.agents",
            "engenty.copilot.soul",
            "engenty.copilot.skills",
          ],
        }),
        [
          {
            body: "",
            created_at: "",
            created_by_user_id: null,
            document_key: "engenty.copilot.append.notes",
            id: "1",
            is_active: true,
            layer: "tenant_override",
            metadata: { owner_id: "engenty.copilot", filename: "notes.md" },
            module_id: "engenty",
            source_kind: "user",
            tenant_id: "t1",
            title: "notes",
            updated_at: "",
            updated_by_user_id: null,
            version: 1,
          },
        ]
      ).toSorted()
    ).toEqual([
      "engenty.copilot.agents",
      "engenty.copilot.append.notes",
      "engenty.copilot.skills",
      "engenty.copilot.soul",
    ]);
  });
});

describe("filterAgents", () => {
  const all = [copilot, worker, surface, external, custom];
  const coordinator = agent({
    id: "engenty.coordinator",
    name: "Coordinator",
    role: "coordinator",
    source: "builtin",
  });

  it("filters by catalog group", () => {
    expect(
      filterAgents([copilot, coordinator, worker], {
        groupFilter: "leadership",
        searchQuery: "",
        sourceFilter: "all",
      })
    ).toEqual([copilot, coordinator]);
  });

  it("filters by custom source", () => {
    expect(
      filterAgents(all, {
        groupFilter: "all",
        searchQuery: "",
        sourceFilter: "custom",
      })
    ).toEqual([external, custom]);
  });

  it("searches by name, id, or description", () => {
    expect(
      filterAgents(all, {
        groupFilter: "all",
        searchQuery: "helper",
        sourceFilter: "all",
      })
    ).toEqual([custom]);
    expect(
      filterAgents(all, {
        groupFilter: "all",
        searchQuery: "chatbot.",
        sourceFilter: "all",
      })
    ).toEqual([external]);
  });

  it("matches coding against an agent whose description talks about code", () => {
    const coder = agent({
      description: "Reviews pull requests and writes code",
      id: "engenty.code-review",
      name: "Code review",
    });
    expect(
      filterAgents([worker, coder], {
        groupFilter: "all",
        searchQuery: "coding",
        sourceFilter: "all",
      })
    ).toEqual([coder]);
  });
});

describe("catalogGroupFromLegacyRoleParam", () => {
  it("maps old role= links onto catalog groups", () => {
    expect(catalogGroupFromLegacyRoleParam("copilot")).toBe("leadership");
    expect(catalogGroupFromLegacyRoleParam("coordinator")).toBe("leadership");
    expect(catalogGroupFromLegacyRoleParam("specialist")).toBe("specialists");
    expect(catalogGroupFromLegacyRoleParam("chat_surface")).toBe(
      "chat_surfaces"
    );
    expect(catalogGroupFromLegacyRoleParam("external")).toBe("external");
    expect(catalogGroupFromLegacyRoleParam(null)).toBe("all");
  });
});

describe("groupAgents", () => {
  it("groups in section order, skipping empty groups", () => {
    expect(groupAgents([custom, worker, copilot]).map((g) => g.group)).toEqual([
      "leadership",
      "specialists",
      "custom",
    ]);
  });
});
