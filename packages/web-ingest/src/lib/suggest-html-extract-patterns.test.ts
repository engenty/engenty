import { describe, expect, it } from "vitest";

import { suggestHtmlExtractPatternsFromHtml } from "./suggest-html-extract-patterns.js";

describe("suggestHtmlExtractPatternsFromHtml", () => {
  it("throws when AI_GATEWAY_API_KEY is missing", async () => {
    const prev = process.env.AI_GATEWAY_API_KEY;
    process.env.AI_GATEWAY_API_KEY = "";
    await expect(
      suggestHtmlExtractPatternsFromHtml({
        html: "<html><body><p>x</p></body></html>",
      })
    ).rejects.toThrow(/AI_GATEWAY_API_KEY/);
    process.env.AI_GATEWAY_API_KEY = prev;
  });
});
