import { describe, expect, it } from "vitest";
import {
  normalizeTeamMemberFieldDefinitionsForSave,
  reorderTeamMemberFieldDefinitions,
  slugFromFieldLabel,
} from "./team-member-field-definitions-lib.js";

describe("slugFromFieldLabel", () => {
  it("slugifies labels", () => {
    expect(slugFromFieldLabel("LinkedIn URL")).toBe("linkedin-url");
  });
});

describe("normalizeTeamMemberFieldDefinitionsForSave", () => {
  it("drops empty rows and reindexes sort_order per visibility", () => {
    const normalized = normalizeTeamMemberFieldDefinitionsForSave([
      {
        id: "1",
        visibility: "shared",
        field_type: "text_input",
        label: "  Bio  ",
        description: "",
        field_key: "bio",
        options: [],
        sort_order: 5,
        multiple: false,
      },
      {
        id: "2",
        visibility: "shared",
        field_type: "text_input",
        label: "",
        description: "",
        field_key: "",
        options: [],
        sort_order: 0,
        multiple: false,
      },
      {
        id: "3",
        visibility: "private",
        field_type: "number",
        label: "Shoe size",
        description: "",
        field_key: "shoe-size",
        options: [],
        sort_order: 0,
        multiple: false,
      },
    ]);
    expect(normalized).toHaveLength(2);
    expect(normalized[0]?.sort_order).toBe(0);
    expect(normalized[1]?.sort_order).toBe(0);
    expect(normalized[1]?.visibility).toBe("private");
  });
});

describe("reorderTeamMemberFieldDefinitions", () => {
  it("only reorders within the same visibility section", () => {
    const rows = [
      {
        id: "a",
        visibility: "shared" as const,
        field_type: "text_input" as const,
        label: "A",
        description: "",
        field_key: "a",
        options: [],
        sort_order: 0,
        multiple: false,
      },
      {
        id: "b",
        visibility: "private" as const,
        field_type: "text_input" as const,
        label: "B",
        description: "",
        field_key: "b",
        options: [],
        sort_order: 0,
        multiple: false,
      },
    ];
    expect(reorderTeamMemberFieldDefinitions(rows, "a", "b", "before")).toEqual(
      rows
    );
  });
});
