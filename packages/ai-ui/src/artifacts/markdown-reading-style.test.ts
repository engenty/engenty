import { describe, expect, it } from "vitest";
import {
  isMarkdownReadingStyle,
  markdownDocumentColumnClassName,
  markdownReadingWrapClassName,
} from "./markdown-reading-style.js";

describe("markdown reading style", () => {
  it("accepts the three surfaces", () => {
    expect(isMarkdownReadingStyle("normal")).toBe(true);
    expect(isMarkdownReadingStyle("large")).toBe(true);
    expect(isMarkdownReadingStyle("tone")).toBe(true);
    expect(isMarkdownReadingStyle("reader")).toBe(false);
  });

  it("only enlarges Large and Reader", () => {
    expect(markdownReadingWrapClassName("normal")).toBe("");
    expect(markdownReadingWrapClassName("large")).toBe(
      "markdown-document-reading-large"
    );
    expect(markdownReadingWrapClassName("tone")).toBe(
      "markdown-document-reading-tone"
    );
  });

  it("widens the column only in Large", () => {
    expect(markdownDocumentColumnClassName("normal")).toBe("max-w-3xl");
    expect(markdownDocumentColumnClassName("tone")).toBe("max-w-3xl");
    expect(markdownDocumentColumnClassName("large")).toBe("max-w-5xl");
  });
});
