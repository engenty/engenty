import { describe, expect, it } from "vitest";
import {
  draftsToTaxonomyTermsForSave,
  resolveTaxonomyTermSlug,
  slugifyTaxonomyTermLabel,
} from "./taxonomy-term-save.js";

describe("taxonomy term save helpers", () => {
  it("slugifyTaxonomyTermLabel inserts dashes between words", () => {
    expect(slugifyTaxonomyTermLabel("Senior Engineer")).toBe("senior-engineer");
  });

  it("resolveTaxonomyTermSlug prefers explicit slug when provided", () => {
    expect(
      resolveTaxonomyTermSlug({
        label: "Senior Engineer",
        term_slug: "lead",
      })
    ).toBe("lead");
  });

  it("resolveTaxonomyTermSlug derives from label when slug empty", () => {
    expect(
      resolveTaxonomyTermSlug({
        label: "Senior Engineer",
      })
    ).toBe("senior-engineer");
  });

  it("draftsToTaxonomyTermsForSave skips blank rows and derives slugs from labels", () => {
    expect(
      draftsToTaxonomyTermsForSave([
        {
          id: "01934567-0000-7000-8000-000000000001",
          label: "Engineer",
          sort_order: 0,
        },
        { label: "", sort_order: 1 },
        { label: "Team Lead", sort_order: 2 },
      ])
    ).toEqual([
      {
        id: "01934567-0000-7000-8000-000000000001",
        label: "Engineer",
        term_slug: "engineer",
        parent_term_id: null,
        sort_order: 0,
      },
      {
        label: "Team Lead",
        term_slug: "team-lead",
        parent_term_id: null,
        sort_order: 1,
      },
    ]);
  });
});
