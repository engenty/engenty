import { describe, expect, it } from "vitest";
import {
  type ActionDraft,
  buildActionSourceFromDraft,
  parseActionSourceToDraft,
  validateActionDraft,
} from "./action-draft";

function createDraft(overrides: Partial<ActionDraft> = {}): ActionDraft {
  return {
    action_key: "contacts.search",
    agent_id: "contacts.manager",
    context_type: "contact",
    default_thread_mode: "new",
    description: "Search contacts with filters.",
    input_schema_json: {
      properties: {
        search: { type: "string" },
      },
      type: "object",
    },
    instruction_keys: ["contacts_manager_agents"],
    module_id: "contacts",
    name: "Search contacts",
    prompt_markdown: "# Search Contacts\n\nUse the contacts search tools.",
    skills: ["contacts-search"],
    allowed_tools: ["searchContacts"],
    ...overrides,
  };
}

describe("action-draft", () => {
  it("round-trips a draft through ACTION.md", () => {
    const source = buildActionSourceFromDraft(createDraft());
    const parsed = parseActionSourceToDraft(source, createDraft());

    expect(parsed.draft).toEqual(createDraft());
  });

  it("keeps the fallback module_id even if source frontmatter changes it", () => {
    const source = `---
id: contacts.search
name: Search contacts
agent_id: contacts.manager
module_id: hacked-module
description: Search contacts
default_thread_mode: new
---

# Search Contacts
`;

    const parsed = parseActionSourceToDraft(source, createDraft());

    expect(parsed.draft.module_id).toBe("contacts");
  });

  it("throws when input_schema_json is not an object", () => {
    const source = `---
id: contacts.search
name: Search contacts
agent_id: contacts.manager
default_thread_mode: new
input_schema_json:
  - nope
---

# Search Contacts
`;

    expect(() => parseActionSourceToDraft(source, createDraft())).toThrowError(
      "input_schema_json must be a JSON object."
    );
  });

  it("validates duplicate list entries", () => {
    const error = validateActionDraft(
      createDraft({
        skills: ["contacts-search", "contacts-search"],
      })
    );

    expect(error).toContain("Skills must be unique");
  });
});
