import { describe, expect, it } from "vitest";
import { resolveSkillDetailCodePreview } from "./skill-detail-preview.js";
import type { SkillDraft } from "./skill-draft.js";

function sampleDraft(): SkillDraft {
  return {
    allowed_tools: ["contacts_lookup"],
    body_markdown: "# Contact helper\n\nUse this skill for contacts.",
    compatibility: "",
    description: "Use this skill for contacts.",
    license: "",
    metadata_rows: [],
    module_id: "contacts",
    name: "contacts-helper",
    title: "Contact helper",
  };
}

describe("resolveSkillDetailCodePreview", () => {
  it("uses source text while editing", () => {
    expect(
      resolveSkillDetailCodePreview({
        draft: sampleDraft(),
        isEditing: true,
        selectedFile: "SKILL.md",
        selectedFileContentText: "",
        sourceText: "draft source",
      })
    ).toBe("draft source");
  });

  it("falls back to the skill draft when SKILL.md file text is empty", () => {
    const preview = resolveSkillDetailCodePreview({
      draft: sampleDraft(),
      isEditing: false,
      selectedFile: "SKILL.md",
      selectedFileContentText: "",
      sourceText: "",
    });

    expect(preview).toContain("name: contacts-helper");
    expect(preview).toContain("# Contact helper");
  });

  it("keeps populated file text in read-only mode", () => {
    expect(
      resolveSkillDetailCodePreview({
        draft: sampleDraft(),
        isEditing: false,
        selectedFile: "SKILL.md",
        selectedFileContentText: "# Persisted",
        sourceText: "",
      })
    ).toBe("# Persisted");
  });
});
