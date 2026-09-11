import { describe, expect, it } from "vitest";
import {
  blendCatalogScores,
  cosineSimilarity,
  rankRecordsLexically,
  rankScoredCatalog,
} from "./catalog-rank.js";

describe("catalog hybrid ranking", () => {
  it("returns 0 cosine for orthogonal or empty vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([], [1])).toBe(0);
  });

  it("returns 1 cosine for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("blends semantic-heavy hybrid scores", () => {
    expect(
      blendCatalogScores({
        lexical: 10,
        maxLexical: 10,
        semantic: 1,
        strategy: "hybrid",
      })
    ).toBeCloseTo(1);
    expect(
      blendCatalogScores({
        lexical: 10,
        maxLexical: 10,
        semantic: 0,
        strategy: "lexical",
      })
    ).toBe(10);
  });

  it("keeps lexical hits and drops weak semantic-only rows", () => {
    const ranked = rankScoredCatalog(
      [
        { entry: "lexical", lexical: 4, semantic: 0.1 },
        { entry: "related", lexical: 0, semantic: 0.55 },
        { entry: "noise", lexical: 0, semantic: 0.2 },
      ],
      "hybrid",
      { minSemantic: 0.4 }
    );
    expect(ranked.map((item) => item.entry).toSorted()).toEqual([
      "lexical",
      "related",
    ]);
  });

  it("ranks name/description records and stems coding to code", () => {
    const invoices = {
      description: "Invoice CRUD",
      id: "invoices",
      name: "Invoices",
    };
    const sandbox = {
      description: "Run Python or shell scripts in a sandbox",
      id: "sandbox-code-execution",
      name: "sandbox-code-execution",
    };
    expect(
      rankRecordsLexically([invoices, sandbox], "coding", (item) => item).map(
        (item) => item.id
      )
    ).toEqual(["sandbox-code-execution"]);
  });
});
