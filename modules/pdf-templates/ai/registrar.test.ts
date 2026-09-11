import { describe, expect, it } from "vitest";
import { pdfTemplatesAiRegistration } from "./registrar.js";

describe("pdfTemplatesAiRegistration", () => {
  it("ships the two template playbooks and no agent", () => {
    // Skills-only module face: templates are edited through the copilot with the
    // catalog operations, so there is nothing for a module agent to own.
    const registration = pdfTemplatesAiRegistration();

    expect(
      (registration.skills ?? []).map((skill) => skill.name).sort()
    ).toEqual([
      "pdf-templates-create-and-edit",
      "pdf-templates-markup-reference",
    ]);
    expect(registration.dynamic?.agent_configs ?? []).toEqual([]);
    expect(registration.module_id).toBe("pdf-templates");
  });

  it("routes the copilot to preview before it writes", () => {
    // Unknown elements degrade to <View> and missing styles are ignored, so a
    // template only fails at the point a client reads the PDF.
    const skills = pdfTemplatesAiRegistration().dynamic?.skills ?? {};

    expect(skills["pdf-templates-create-and-edit"]).toMatch(
      /pdf_templates_preview/
    );
    expect(skills["pdf-templates-markup-reference"]).toMatch(
      /silently becomes a `View`/
    );
  });

  it("names the list operation as the entry point", () => {
    // pdf_templates_get needs an id, so a skill that starts at `get` strands the
    // agent — pdf_templates_list is why it was added.
    expect(
      pdfTemplatesAiRegistration().dynamic?.skills?.[
        "pdf-templates-create-and-edit"
      ]
    ).toMatch(/pdf_templates_list/);
  });
});
