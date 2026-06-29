import { describe, expect, it } from "vitest";
import type { AiRegisteredAgent } from "../../lib/admin/ai-runtime-types";
import {
  filterAgents,
  getAgentCatalogGroup,
  groupAgents,
  isEditableAgent,
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

describe("isEditableAgent", () => {
  it("allows tenant-created database agents only", () => {
    expect(isEditableAgent(custom)).toBe(true);
    expect(isEditableAgent(external)).toBe(false);
    expect(isEditableAgent(copilot)).toBe(false);
    expect(isEditableAgent(worker)).toBe(false);
  });
});

describe("filterAgents", () => {
  const all = [copilot, worker, surface, external, custom];

  it("filters by role", () => {
    expect(
      filterAgents(all, {
        roleFilter: "specialist",
        searchQuery: "",
        sourceFilter: "all",
      })
    ).toEqual([worker, custom]);
  });

  it("filters by custom source", () => {
    expect(
      filterAgents(all, {
        roleFilter: "all",
        searchQuery: "",
        sourceFilter: "custom",
      })
    ).toEqual([external, custom]);
  });

  it("searches by name or id", () => {
    expect(
      filterAgents(all, {
        roleFilter: "all",
        searchQuery: "helper",
        sourceFilter: "all",
      })
    ).toEqual([custom]);
    expect(
      filterAgents(all, {
        roleFilter: "all",
        searchQuery: "chatbot.",
        sourceFilter: "all",
      })
    ).toEqual([external]);
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
