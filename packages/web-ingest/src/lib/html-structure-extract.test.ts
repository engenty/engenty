import { describe, expect, it } from "vitest";
import { htmlToMarkdownFromFetchedPage } from "./html-prepare.js";
import { buildWebIngestSections } from "./html-structure-extract.js";
import { MARKDOWN_SECTION_TARGET_CHARS } from "./markdown-section-chunk.js";

/** Synthetic consolidated-law page: 140 §§, well past one section target. */
function buildOversizedLawHtml(paragraphCount: number): string {
  const body = Array.from({ length: paragraphCount }, (_, i) => {
    const n = i + 1;
    return [
      `<h2>§ ${n} Bestimmung ${n}</h2>`,
      `<p>${`Absatz zu § ${n} mit ausreichend Fließtext, damit das Gesamtdokument die Zielgröße einer einzelnen Sektion deutlich überschreitet. `.repeat(30)}</p>`,
    ].join("\n");
  }).join("\n");
  return `<!DOCTYPE html><html><head><title>Bauordnung</title></head><body><main>${body}</main></body></html>`;
}

describe("buildWebIngestSections with oversized documents", () => {
  it("keeps small pages as one markdown section", () => {
    const sections = buildWebIngestSections({
      markdown: "# Small\n\nBody.",
      rawHtml: "<html><body><h1>Small</h1><p>Body.</p></body></html>",
    });
    const markdownSections = sections.filter((s) => s.kind === "markdown");
    expect(markdownSections).toHaveLength(1);
    expect(markdownSections[0]?.locator).toBe("markdown");
    expect(markdownSections[0]?.metadata).toEqual({ role: "markdown" });
  });

  it("chunks an oversized page into ordered markdown sections with full coverage", () => {
    const paragraphCount = 140;
    const rawHtml = buildOversizedLawHtml(paragraphCount);
    const markdown = htmlToMarkdownFromFetchedPage(rawHtml);
    expect(markdown.length).toBeGreaterThan(MARKDOWN_SECTION_TARGET_CHARS);

    const sections = buildWebIngestSections({
      cleanHtml: rawHtml,
      markdown,
      rawHtml,
    });

    // Provenance HTML sections stay intact and untruncated.
    expect(sections.find((s) => s.locator === "raw_html")?.content).toBe(
      rawHtml
    );

    const markdownSections = sections.filter((s) => s.kind === "markdown");
    expect(markdownSections.length).toBeGreaterThan(1);

    // Ordered, contiguous positions after the HTML sections.
    const positions = markdownSections.map((s) => s.position);
    expect(positions).toEqual(
      Array.from(
        { length: positions.length },
        (_, i) => (positions[0] ?? 0) + i
      )
    );

    // Part metadata is complete and sequential.
    for (const [index, section] of markdownSections.entries()) {
      expect(section.metadata).toMatchObject({
        part: index + 1,
        part_count: markdownSections.length,
        role: "markdown",
      });
      expect(section.locator).toBe(`markdown:${index + 1}`);
      expect(section.content.length).toBeLessThanOrEqual(
        MARKDOWN_SECTION_TARGET_CHARS
      );
    }

    // Regression: EVERY § of the source document survives across the chunks —
    // nothing is cut off after the first section target.
    const combined = markdownSections.map((s) => s.content).join("\n\n");
    for (let n = 1; n <= paragraphCount; n++) {
      expect(combined).toContain(`§ ${n} Bestimmung ${n}`);
    }
    expect(combined).toContain(`§ ${paragraphCount} Bestimmung`);
  });
});
