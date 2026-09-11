import type { BrowserParseProvider } from "@engenty/ai-core/browser";
import { anydocBrowserParser } from "./anydoc-parser.js";
import { liteparseBrowserParser } from "./liteparse-parser.js";
import type { BrowserDocParser } from "./types.js";

/**
 * LiteParse WASM for PDFs, Anydoc for office (WASM LiteParse has no LibreOffice).
 * PDF: try LiteParse first, then Anydoc if it returns empty / throws.
 */
export const liteparseWithAnydocFallback: BrowserDocParser = {
  id: "liteparse",
  canParse(mimeType, filename) {
    return (
      liteparseBrowserParser.canParse(mimeType, filename) ||
      anydocBrowserParser.canParse(mimeType, filename)
    );
  },
  async parse(input) {
    if (liteparseBrowserParser.canParse(input.mimeType, input.filename)) {
      try {
        const parsed = await liteparseBrowserParser.parse(input);
        if (parsed?.markdown.trim()) {
          return parsed;
        }
      } catch {
        // Fall through to anydoc.
      }
    }
    return anydocBrowserParser.parse(input);
  },
};

export function parserForBrowserParse(
  mode: BrowserParseProvider
): BrowserDocParser | null {
  if (mode === "off") {
    return null;
  }
  if (mode === "liteparse") {
    return liteparseWithAnydocFallback;
  }
  return anydocBrowserParser;
}
