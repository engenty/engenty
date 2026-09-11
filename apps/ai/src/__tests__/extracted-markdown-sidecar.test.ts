import { describe, expect, it } from "vitest";
import { extractedMarkdownSidecarKey } from "../api/attachments/extracted-markdown-sidecar.js";

describe("extractedMarkdownSidecarKey", () => {
  it("appends .extracted.md once", () => {
    const original = "tenants/t1/chat/uploads/1_notes.pdf";
    expect(extractedMarkdownSidecarKey(original)).toBe(
      `${original}.extracted.md`
    );
    expect(extractedMarkdownSidecarKey(`${original}.extracted.md`)).toBe(
      `${original}.extracted.md`
    );
  });
});
