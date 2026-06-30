import { describe, expect, it } from "vitest";
import {
  appendTaxonomyTerm,
  appendTaxonomyTermIfMissing,
  DuplicateTaxonomyTermSlugError,
} from "./append-taxonomy-term.js";

const roleTermId = "01934567-0000-7000-8000-000000000001";

const existing = [
  {
    id: roleTermId,
    label: "Engineering",
    term_slug: "engineering",
    parent_term_id: null,
    sort_order: 0,
  },
];

describe("appendTaxonomyTermIfMissing", () => {
  it("returns existing term id when label matches", () => {
    const result = appendTaxonomyTermIfMissing(existing, {
      label: "engineering",
    });
    expect(result.created).toBe(false);
    expect(result.term_id).toBe(roleTermId);
    expect(result.terms).toHaveLength(1);
  });

  it("creates a new term when label is unknown", () => {
    const result = appendTaxonomyTermIfMissing(existing, {
      label: "Geschäftsführer",
    });
    expect(result.created).toBe(true);
    expect(result.terms).toHaveLength(2);
    expect(result.terms[1]?.label).toBe("Geschäftsführer");
    expect(result.terms[1]?.term_slug).toBe("geschaftsfuhrer");
  });

  it("does not duplicate when slug already exists", () => {
    const result = appendTaxonomyTermIfMissing(existing, {
      label: "Engineering Team",
      term_slug: "engineering",
    });
    expect(result.created).toBe(false);
    expect(result.term_id).toBe(roleTermId);
  });
});

describe("appendTaxonomyTerm", () => {
  it("throws when slug already exists", () => {
    expect(() =>
      appendTaxonomyTerm(existing, {
        label: "Engineering Team",
        term_slug: "engineering",
      })
    ).toThrow(DuplicateTaxonomyTermSlugError);
  });
});
