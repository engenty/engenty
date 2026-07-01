import { describe, expect, it } from "vitest";

import { mergeHtmlExtractPatternSuggestions } from "./sitemap-html-extract.js";

describe("mergeHtmlExtractPatternSuggestions", () => {
  it("dedupes and unions selectors from multiple samples", () => {
    const merged = mergeHtmlExtractPatternSuggestions([
      {
        excludeSelectors: ["nav", ".sidebar"],
        includeSelectors: ["main"],
        suggestedTitle: "A",
      },
      {
        excludeSelectors: ["nav", "footer"],
        includeSelectors: ["article", "main"],
        suggestedTitle: "B",
      },
    ]);
    expect(merged.includeSelectors).toEqual(["main", "article"]);
    expect(merged.excludeSelectors).toEqual(["nav", ".sidebar", "footer"]);
  });
});
