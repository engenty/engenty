import { describe, expect, it } from "vitest";
import {
  clipExtractedMarkdown,
  EXTRACTED_MARKDOWN_MAX_CHARS,
  parseChatDocumentInBrowser,
} from "./parse-chat-document.js";
import type { BrowserDocParser } from "./types.js";

const stubParser: BrowserDocParser = {
  id: "stub",
  canParse: (mime) => mime === "application/pdf",
  parse: async () => ({
    markdown: "Lake Attersee is 22 °C",
    provider: "stub",
  }),
};

describe("parseChatDocumentInBrowser", () => {
  it("extracts markdown for PDFs via the parser", async () => {
    const result = await parseChatDocumentInBrowser({
      bytes: new Uint8Array([1, 2, 3]),
      filename: "notes.pdf",
      mimeType: "application/pdf",
      parser: stubParser,
    });
    expect(result).toEqual({
      markdown: "Lake Attersee is 22 °C",
      provider: "stub",
    });
  });

  it("returns null when browser parse is off", async () => {
    const result = await parseChatDocumentInBrowser({
      bytes: new Uint8Array([1]),
      filename: "notes.pdf",
      mimeType: "application/pdf",
      mode: "off",
    });
    expect(result).toBeNull();
  });

  it("skips images", async () => {
    const result = await parseChatDocumentInBrowser({
      bytes: new Uint8Array([1]),
      filename: "photo.png",
      mimeType: "image/png",
      parser: stubParser,
    });
    expect(result).toBeNull();
  });

  it("returns null when the parser throws", async () => {
    const result = await parseChatDocumentInBrowser({
      bytes: new Uint8Array([1]),
      filename: "notes.pdf",
      mimeType: "application/pdf",
      parser: {
        id: "boom",
        canParse: () => true,
        parse: async () => {
          throw new Error("unsupported");
        },
      },
    });
    expect(result).toBeNull();
  });

  it("clips oversized markdown", () => {
    const clipped = clipExtractedMarkdown(
      "a".repeat(EXTRACTED_MARKDOWN_MAX_CHARS + 20)
    );
    expect(clipped.endsWith("…(truncated)")).toBe(true);
    expect(clipped.length).toBeLessThan(EXTRACTED_MARKDOWN_MAX_CHARS + 40);
  });
});
