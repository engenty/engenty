import { describe, expect, it } from "vitest";
import type { KbArticleTemplate } from "../src/schema/types.js";
import {
  buildRefreshOutputSchema,
  substituteTemplatePropertyPlaceholders,
} from "../src/services/kb-template-property-extract.js";

function template(
  propertyDefinitions: KbArticleTemplate["property_definitions"],
  contentMarkdown?: string
): KbArticleTemplate {
  return {
    id: "tpl-1",
    tenant_id: "tenant-1",
    scope_id: "scope-1",
    kb_id: "kb-1",
    name: "Course page",
    description: null,
    property_definitions: propertyDefinitions,
    content_json: null,
    content_markdown: contentMarkdown ?? null,
    created_at: "",
    updated_at: "",
    deleted_at: null,
  };
}

describe("buildRefreshOutputSchema", () => {
  it("uses explicit property keys instead of z.record for gateway compatibility", () => {
    const schema = buildRefreshOutputSchema(
      template([
        {
          id: "p1",
          key: "course_code",
          label: "Course code",
          description: "AMS course identifier",
          type: "text",
          order: 0,
          show_in_compact: true,
        },
        {
          id: "p2",
          key: "duration_hours",
          label: "Duration",
          description: "Training length in hours",
          type: "number",
          order: 1,
          show_in_compact: false,
        },
      ])
    );

    const parsed = schema.parse({
      title: "Sanitätshelfer:in werden",
      summary: "Overview of the training course.",
      properties: {
        course_code: "SH-2026",
        duration_hours: 72,
      },
    });

    expect(parsed.properties).toEqual({
      course_code: "SH-2026",
      duration_hours: 72,
    });
  });

  it("accepts an empty properties object when the template has no fields", () => {
    const schema = buildRefreshOutputSchema(template([]));

    expect(
      schema.parse({
        title: "Untitled",
        summary: null,
        properties: {},
      })
    ).toEqual({
      title: "Untitled",
      summary: null,
      properties: {},
    });
  });
});

describe("substituteTemplatePropertyPlaceholders", () => {
  it("replaces property key and label slug placeholders", () => {
    const tpl = template([
      {
        id: "p1",
        key: "course_code",
        label: "Course Code",
        description: "",
        type: "text",
        order: 0,
      },
    ]);

    const markdown = substituteTemplatePropertyPlaceholders(
      "# [course_code]\n\nDuration: [course-code]",
      { course_code: "SH-2026" },
      tpl.property_definitions
    );

    expect(markdown).toBe("# SH-2026\n\nDuration: SH-2026");
  });

  it("leaves unknown placeholders untouched", () => {
    const markdown = substituteTemplatePropertyPlaceholders(
      "Intro: [summary]",
      { course_code: "SH-2026" },
      template([
        {
          id: "p1",
          key: "course_code",
          label: "Course code",
          description: "",
          type: "text",
          order: 0,
        },
      ]).property_definitions
    );

    expect(markdown).toBe("Intro: [summary]");
  });
});
