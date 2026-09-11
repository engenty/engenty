import { describe, expect, it } from "vitest";
import type { AiRegisteredAction } from "../../lib/admin/ai-runtime-types";
import { createActionDraft, createEmptyActionDraft } from "./workflow-draft";

function createAction(
  overrides: Partial<AiRegisteredAction> = {}
): AiRegisteredAction {
  return {
    agent_id: "contacts.researcher",
    allowed_tools: ["searchContacts"],
    context_type: "contact",
    description: "Search contacts with filters.",
    id: "contacts.search",
    input_schema_json: {
      properties: {
        search: { type: "string" },
      },
      type: "object",
    },
    module_id: "contacts",
    name: "Search contacts",
    skills: ["contacts-search"],
    ...overrides,
  };
}

describe("action-draft", () => {
  it("maps a registry action onto the view model", () => {
    expect(createActionDraft(createAction())).toEqual({
      action_key: "contacts.search",
      agent_id: "contacts.researcher",
      allowed_tools: ["searchContacts"],
      context_type: "contact",
      description: "Search contacts with filters.",
      input_schema_json: {
        properties: {
          search: { type: "string" },
        },
        type: "object",
      },
      module_id: "contacts",
      name: "Search contacts",
      skills: ["contacts-search"],
    });
  });

  it("renders a library action (no owning specialist) with an empty agent id", () => {
    const draft = createActionDraft(createAction({ agent_id: null }));
    expect(draft.agent_id).toBe("");
  });

  it("normalizes nullable fields to render-safe values", () => {
    const draft = createActionDraft(
      createAction({
        context_type: null,
        description: null,
        input_schema_json: null,
      })
    );
    expect(draft.context_type).toBe("");
    expect(draft.description).toBe("");
    expect(draft.input_schema_json).toEqual({});
  });

  it("clones the input schema so the draft never aliases the record", () => {
    const action = createAction();
    const draft = createActionDraft(action);
    draft.input_schema_json.type = "mutated";
    expect(action.input_schema_json?.type).toBe("object");
  });

  it("defaults the module id", () => {
    expect(createActionDraft(createAction({ module_id: "  " })).module_id).toBe(
      "engenty-core"
    );
    expect(createEmptyActionDraft().module_id).toBe("engenty-core");
  });
});
