import { describe, expect, it } from "vitest";
import {
  teamMemberFieldDefinitionSchema,
  teamMemberFieldDefinitionsSchema,
} from "./member-field-definitions.js";

const baseField = {
  id: "01900000-0000-7000-8000-000000000001",
  visibility: "shared" as const,
  field_type: "text_input" as const,
  label: "Bio",
  description: "Short bio",
  field_key: "bio",
  options: [] as string[],
  sort_order: 0,
  multiple: false,
};

describe("teamMemberFieldDefinitionSchema", () => {
  it("accepts a valid text field", () => {
    const parsed = teamMemberFieldDefinitionSchema.safeParse(baseField);
    expect(parsed.success).toBe(true);
  });

  it("requires select options", () => {
    const parsed = teamMemberFieldDefinitionSchema.safeParse({
      ...baseField,
      field_type: "select",
      options: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects options on non-select types", () => {
    const parsed = teamMemberFieldDefinitionSchema.safeParse({
      ...baseField,
      options: ["a"],
    });
    expect(parsed.success).toBe(false);
  });

  it("allows multiple only for image and file", () => {
    expect(
      teamMemberFieldDefinitionSchema.safeParse({
        ...baseField,
        field_type: "image",
        multiple: true,
      }).success
    ).toBe(true);
    expect(
      teamMemberFieldDefinitionSchema.safeParse({
        ...baseField,
        field_type: "text_input",
        multiple: true,
      }).success
    ).toBe(false);
  });

  it("rejects invalid field_key", () => {
    const parsed = teamMemberFieldDefinitionSchema.safeParse({
      ...baseField,
      field_key: "Bad Key",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("teamMemberFieldDefinitionsSchema", () => {
  it("rejects duplicate field_key values", () => {
    const parsed = teamMemberFieldDefinitionsSchema.safeParse([
      baseField,
      {
        ...baseField,
        id: "01900000-0000-7000-8000-000000000002",
        label: "Bio copy",
      },
    ]);
    expect(parsed.success).toBe(false);
  });
});
