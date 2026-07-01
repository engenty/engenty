/**
 * @vitest-environment happy-dom
 */

import { markdownToJson } from "@engenty/tiptap-editor";
import { describe, expect, it } from "vitest";

/** Smoke: detail page uses the same markdown → JSON path as RichEditor read-only. */
describe("ArticleDetailPage markdown preview", () => {
  it("converts stored markdown to TipTap JSON for rich rendering", () => {
    const json = markdownToJson("# Title\n\n- one\n- two");
    expect(json.content?.some((n) => n.type === "heading")).toBe(true);
    expect(json.content?.some((n) => n.type === "bulletList")).toBe(true);
  });
});
