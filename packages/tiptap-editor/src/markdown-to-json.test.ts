/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from "vitest";
import { markdownToJson } from "./rich/markdown-to-json.js";

describe("markdownToJson", () => {
  it("parses markdown into TipTap JSON with the rich schema", () => {
    const json = markdownToJson("## Hello\n\nParagraph text.");
    expect(json.type).toBe("doc");
    const first = json.content?.[0];
    expect(first?.type).toBe("heading");
    expect((first as { attrs?: { level?: number } }).attrs?.level).toBe(2);
  });
});
