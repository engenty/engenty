import { describe, expect, it } from "vitest";
import {
  buildSkillSourceFromDraft,
  parseSkillSourceToDraft,
  type SkillDraft,
  validateSkillDraft,
} from "./skill-draft.js";

function sampleDraft(): SkillDraft {
  return {
    allowed_tools: ["contacts_lookup", "contacts_update"],
    body_markdown:
      "# Contact helper\n\nUse this skill when a contact needs updates.\n",
    compatibility: "gpt-5",
    description: "Update contacts safely",
    license: "Custom",
    metadata_rows: [
      { id: "1", key: "owner_id", value: "contacts.manager" },
      { id: "2", key: "source_reference", value: "contacts" },
    ],
    module_id: "contacts",
    name: "contacts-update",
    title: "Update contact",
  };
}

describe("skill draft markdown sync", () => {
  it("round-trips source markdown into the same draft fields", () => {
    const source = buildSkillSourceFromDraft(sampleDraft());
    const parsed = parseSkillSourceToDraft(source, sampleDraft());

    expect(parsed.draft.name).toBe("contacts-update");
    expect(parsed.draft.title).toBe("Update contact");
    expect(parsed.draft.module_id).toBe("contacts");
    expect(parsed.draft.allowed_tools).toEqual([
      "contacts_lookup",
      "contacts_update",
    ]);
    expect(parsed.draft.metadata_rows.map((entry) => entry.key)).toEqual([
      "owner_id",
      "source_reference",
    ]);
    expect(parsed.draft.body_markdown.trim()).toContain(
      "Use this skill when a contact needs updates."
    );
  });

  it("keeps the fallback module_id even if source frontmatter changes it", () => {
    const source = buildSkillSourceFromDraft(sampleDraft()).replace(
      "module_id: contacts",
      "module_id: altered-module"
    );

    const parsed = parseSkillSourceToDraft(source, sampleDraft());

    expect(parsed.draft.module_id).toBe("contacts");
  });

  it("rejects duplicate metadata keys", () => {
    const draft = sampleDraft();
    draft.metadata_rows = [
      { id: "1", key: "owner_id", value: "a" },
      { id: "2", key: "owner_id", value: "b" },
    ];

    expect(validateSkillDraft(draft)).toContain("Metadata keys must be unique");
  });
});
