import { describe, expect, it } from "vitest";
import {
  buildSkillMarkdownPreview,
  parseSkillFrontmatterPreview,
} from "./skill-markdown-preview.js";

describe("parseSkillFrontmatterPreview", () => {
  it("returns null without frontmatter", () => {
    expect(parseSkillFrontmatterPreview("# Hello")).toBeNull();
  });

  it("parses synthetic preview markdown", () => {
    const md = buildSkillMarkdownPreview({
      allowed_tools: ["searchContacts"],
      compatibility: null,
      description: "Find contacts",
      license: null,
      metadata: { module_id: "contacts", reference_kind: "module" },
      name: "contacts-search",
    });
    const parsed = parseSkillFrontmatterPreview(md);
    expect(parsed).not.toBeNull();
    expect(parsed?.primaryLines.some((l) => l.key === "name")).toBe(true);
    expect(parsed?.metadataLines).toContainEqual({
      key: "module_id",
      value: "contacts",
    });
    expect(parsed?.allowedTools).toEqual(["searchContacts"]);
  });

  it("parses allowed-tools space-delimited field (Agent Skills spec)", () => {
    const md = `---
title: T
allowed-tools: a b
metadata:
  x: "1"
---
# Body
`;
    const parsed = parseSkillFrontmatterPreview(md);
    expect(parsed?.allowedTools).toEqual(["a", "b"]);
    expect(parsed?.primaryLines.find((l) => l.key === "title")?.value).toBe(
      "T"
    );
  });
});
