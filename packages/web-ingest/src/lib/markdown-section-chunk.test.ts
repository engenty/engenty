import { describe, expect, it } from "vitest";
import {
  chunkMarkdownIntoSections,
  MARKDOWN_SECTION_TARGET_CHARS,
} from "./markdown-section-chunk.js";

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

describe("chunkMarkdownIntoSections", () => {
  it("returns markdown unchanged when it fits the target", () => {
    const md = "# Title\n\nShort body.";
    expect(chunkMarkdownIntoSections(md)).toEqual([md]);
  });

  it("splits at heading boundaries and keeps every heading with its body", () => {
    const parts = Array.from(
      { length: 40 },
      (_, i) => `## § ${i + 1}\n\n${`Absatz text for § ${i + 1}. `.repeat(40)}`
    );
    const md = parts.join("\n\n");
    const chunks = chunkMarkdownIntoSections(md, 4000);

    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i <= 40; i++) {
      const holders = chunks.filter((c) => c.includes(`## § ${i}\n`));
      expect(holders).toHaveLength(1);
    }
    // Order is preserved: § markers appear in ascending order across chunks.
    const joined = chunks.join("\n");
    let last = -1;
    for (let i = 1; i <= 40; i++) {
      const pos = joined.indexOf(`## § ${i}\n`);
      expect(pos).toBeGreaterThan(last);
      last = pos;
    }
  });

  it("never loses non-whitespace content", () => {
    const md = Array.from(
      { length: 30 },
      (_, i) => `# H${i}\n\n${`word${i} `.repeat(500)}`
    ).join("\n\n");
    const chunks = chunkMarkdownIntoSections(md, 5000);
    expect(normalizeWhitespace(chunks.join(" "))).toBe(normalizeWhitespace(md));
  });

  it("splits heading-free markdown on paragraph boundaries", () => {
    const md = Array.from(
      { length: 50 },
      (_, i) => `paragraph ${i} ${"x".repeat(300)}`
    ).join("\n\n");
    const chunks = chunkMarkdownIntoSections(md, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
    expect(normalizeWhitespace(chunks.join(" "))).toBe(normalizeWhitespace(md));
  });

  it("hard-cuts a single oversized paragraph as a last resort", () => {
    const md = "y".repeat(7000);
    const chunks = chunkMarkdownIntoSections(md, 2000);
    expect(chunks.length).toBe(4);
    expect(chunks.join("")).toBe(md);
  });

  it("does not treat # inside code fences as a heading boundary", () => {
    const fenced = "```\n# not a heading\ncode line\n```";
    const md = [
      `# Real\n\n${"a".repeat(1500)}`,
      fenced,
      `# Next\n\n${"b".repeat(1500)}`,
    ].join("\n\n");
    const chunks = chunkMarkdownIntoSections(md, 2000);
    const fenceHolder = chunks.find((c) => c.includes("# not a heading"));
    expect(fenceHolder).toBeDefined();
    expect(fenceHolder).toContain("```\n# not a heading\ncode line\n```");
  });

  it("uses the documented default target", () => {
    const md = "z".repeat(MARKDOWN_SECTION_TARGET_CHARS + 1);
    expect(chunkMarkdownIntoSections(md).length).toBeGreaterThan(1);
    expect(
      chunkMarkdownIntoSections("z".repeat(MARKDOWN_SECTION_TARGET_CHARS))
    ).toHaveLength(1);
  });
});
