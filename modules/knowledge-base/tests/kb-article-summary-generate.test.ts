import { describe, expect, it } from "vitest";
import { kbArticleGenerateSummarySchema } from "../src/schema/articles.js";

describe("kbArticleGenerateSummarySchema", () => {
  it("accepts title and markdown body", () => {
    const parsed = kbArticleGenerateSummarySchema.parse({
      title: "Sanitätshelfer:in werden",
      content_markdown: "## Kurs\n\nDetails about the course.",
    });
    expect(parsed.title).toBe("Sanitätshelfer:in werden");
    expect(parsed.content_markdown).toContain("Kurs");
  });
});
