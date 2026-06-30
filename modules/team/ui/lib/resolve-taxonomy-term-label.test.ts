import { describe, expect, it } from "vitest";
import { resolveTaxonomyTermLabel } from "./resolve-taxonomy-term-label.js";

const terms = [
  {
    id: "01934567-0000-7000-8000-000000000001",
    term_slug: "engineer",
    label: "Engineer",
  },
  {
    id: "01934567-0000-7000-8000-000000000002",
    term_slug: "berlin",
    label: "Berlin",
  },
];

describe("resolveTaxonomyTermLabel", () => {
  it("returns empty label when slug missing", () => {
    expect(resolveTaxonomyTermLabel(terms, null, "None")).toBe("None");
  });

  it("resolves label by slug", () => {
    expect(resolveTaxonomyTermLabel(terms, "engineer", "None")).toBe(
      "Engineer"
    );
  });

  it("resolves label by term id", () => {
    expect(
      resolveTaxonomyTermLabel(
        terms,
        "01934567-0000-7000-8000-000000000002",
        "None"
      )
    ).toBe("Berlin");
  });
});
