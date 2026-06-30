import { describe, expect, it } from "vitest";
import {
  appendRoleTaxonomyTerm,
  DuplicateRoleTermSlugError,
} from "./append-role-taxonomy-term.js";

describe("appendRoleTaxonomyTerm", () => {
  const existing = [
    {
      id: "01934567-0000-7000-8000-000000000001",
      term_slug: "engineer",
      label: "Engineer",
      parent_term_id: null,
      sort_order: 0,
    },
  ];

  it("appends a new role with derived slug", () => {
    expect(appendRoleTaxonomyTerm(existing, { label: "Team Lead" })).toEqual([
      {
        id: "01934567-0000-7000-8000-000000000001",
        term_slug: "engineer",
        label: "Engineer",
        parent_term_id: null,
        sort_order: 0,
      },
      {
        term_slug: "team-lead",
        label: "Team Lead",
        parent_term_id: null,
        sort_order: 1,
      },
    ]);
  });

  it("throws when slug already exists", () => {
    expect(() =>
      appendRoleTaxonomyTerm(existing, { label: "Engineer" })
    ).toThrow(DuplicateRoleTermSlugError);
  });
});
