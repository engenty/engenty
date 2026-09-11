import { describe, expect, it } from "vitest";
import {
  EXTRACTED_MARKDOWN_SIDECAR_SUFFIX,
  extractedMarkdownSidecarKey,
} from "./extracted-markdown-sidecar.js";

describe("extractedMarkdownSidecarKey", () => {
  it("appends the sidecar suffix once", () => {
    const original = "tenants/t1/chat/uploads/1_notes.pdf";
    const sidecar = extractedMarkdownSidecarKey(original);
    expect(sidecar).toBe(`${original}${EXTRACTED_MARKDOWN_SIDECAR_SUFFIX}`);
    expect(extractedMarkdownSidecarKey(sidecar)).toBe(sidecar);
  });

  it("returns empty for a blank key", () => {
    expect(extractedMarkdownSidecarKey("  ")).toBe("");
  });
});
