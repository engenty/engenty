import { describe, expect, it } from "vitest";
import { teamMemberInputSchema } from "../../src/schema/zod.js";
import {
  mapImportRowToTeamMemberCreateInput,
  mapImportRowToTeamMemberUpdatePatch,
  parseImportMemberType,
  resolveImportTaxonomyTerm,
} from "./import-team-members.js";

const roleTermId = "01934567-0000-7000-8000-000000000001";
const locationTermId = "01934567-0000-7000-8000-000000000002";

const roleTerms = [
  {
    id: roleTermId,
    label: "Engineering",
    term_slug: "engineering",
    parent_term_id: null,
    sort_order: 0,
  },
];
const locationTerms = [
  {
    id: locationTermId,
    label: "Vienna",
    term_slug: "vienna",
    parent_term_id: null,
    sort_order: 0,
  },
];
const taxonomy = { roleTerms, locationTerms };

describe("parseImportMemberType", () => {
  it("defaults to internal", () => {
    expect(parseImportMemberType(undefined)).toBe("internal");
    expect(parseImportMemberType("")).toBe("internal");
  });

  it("parses external and contractor", () => {
    expect(parseImportMemberType("external")).toBe("external");
    expect(parseImportMemberType("contractor")).toBe("contractor");
  });
});

describe("resolveImportTaxonomyTerm", () => {
  it("matches slug or label case-insensitively", () => {
    expect(resolveImportTaxonomyTerm("Engineering", roleTerms)).toBe(
      roleTermId
    );
    expect(resolveImportTaxonomyTerm("vienna", locationTerms)).toBe(
      locationTermId
    );
  });

  it("matches stable term id directly", () => {
    expect(resolveImportTaxonomyTerm(roleTermId, roleTerms)).toBe(roleTermId);
  });
});

describe("mapImportRowToTeamMemberCreateInput", () => {
  it("maps core profile fields", () => {
    const input = mapImportRowToTeamMemberCreateInput(
      {
        full_name: "Jane Doe",
        email: "jane@example.com",
        import_id: "ext-1",
        member_type: "internal",
        role_term: "Engineering",
        location_term: "Vienna",
      },
      taxonomy
    );
    expect(input.full_name).toBe("Jane Doe");
    expect(input.email).toBe("jane@example.com");
    expect(input.import_id).toBe("ext-1");
    expect(input.role_term_id).toBe(roleTermId);
    expect(input.location_term_id).toBe(locationTermId);
  });

  it("passes team member create schema validation", () => {
    const input = mapImportRowToTeamMemberCreateInput(
      { full_name: "Jane Doe" },
      taxonomy
    );
    const parsed = teamMemberInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it("omits empty taxonomy terms instead of sending null", () => {
    const input = mapImportRowToTeamMemberCreateInput(
      { full_name: "Jane Doe" },
      taxonomy
    );
    expect(input).not.toHaveProperty("role_term_id");
    expect(input).not.toHaveProperty("location_term_id");
  });
});

describe("mapImportRowToTeamMemberUpdatePatch", () => {
  it("sets import tracking and patchable fields", () => {
    const patch = mapImportRowToTeamMemberUpdatePatch(
      {
        full_name: "Jane Updated",
        import_id: "ext-1",
        role_term: "engineering",
      },
      "ext-1",
      "2026-06-02T12:00:00.000Z",
      taxonomy
    );
    expect(patch.import_id).toBe("ext-1");
    expect(patch.last_imported_at).toBe("2026-06-02T12:00:00.000Z");
    expect(patch.full_name).toBe("Jane Updated");
    expect(patch.role_term_id).toBe(roleTermId);
  });
});
