import { describe, expect, it } from "vitest";
import type { TeamTaxonomy, TeamTaxonomyTerm } from "../schema/taxonomies.js";
import { assertNoTermCycle, buildTermTree } from "./taxonomy-resolver.js";

const flatTaxonomy: Pick<
  TeamTaxonomy,
  "supports_hierarchy" | "supports_order"
> = {
  supports_hierarchy: true,
  supports_order: true,
};

describe("taxonomy-resolver", () => {
  it("buildTermTree nests terms by parent_term_id", () => {
    const terms: TeamTaxonomyTerm[] = [
      {
        id: "parent-id",
        tenant_id: "t1",
        taxonomy_slug: "role",
        term_slug: "leadership",
        label: "Leadership",
        parent_term_id: null,
        sort_order: 0,
        metadata: {},
      },
      {
        id: "child-id",
        tenant_id: "t1",
        taxonomy_slug: "role",
        term_slug: "ceo",
        label: "CEO",
        parent_term_id: "parent-id",
        sort_order: 0,
        metadata: {},
      },
    ];

    expect(buildTermTree(terms, flatTaxonomy)).toEqual([
      expect.objectContaining({
        id: "parent-id",
        children: [expect.objectContaining({ id: "child-id", children: [] })],
      }),
    ]);
  });

  it("assertNoTermCycle rejects cycles by id", () => {
    expect(() =>
      assertNoTermCycle(
        [
          { id: "a", parent_term_id: "b" },
          { id: "b", parent_term_id: "a" },
        ],
        "a",
        "b"
      )
    ).toThrow("Taxonomy term cycle detected");
  });
});
