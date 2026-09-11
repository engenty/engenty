import { isPdfMimeType } from "../chat-attachment-part.js";
import { markdownFromPagedParseResult } from "../page-break.js";
import type { BrowserDocParseResult, BrowserDocParser } from "./types.js";

let initPromise: Promise<void> | null = null;

async function ensureLiteParseWasm(): Promise<
  typeof import("@llamaindex/liteparse-wasm")
> {
  const mod = await import("@llamaindex/liteparse-wasm");
  initPromise ??= (async () => {
    await mod.default();
  })();
  await initPromise;
  return mod;
}

/** LiteParse WASM parses PDF bytes only — no LibreOffice in the browser. */
export const liteparseBrowserParser: BrowserDocParser = {
  id: "liteparse",
  canParse(mimeType, filename) {
    return isPdfMimeType(mimeType, filename);
  },
  async parse(input): Promise<BrowserDocParseResult | null> {
    if (!isPdfMimeType(input.mimeType, input.filename)) {
      return null;
    }
    const { LiteParse } = await ensureLiteParseWasm();
    const parser = new LiteParse({
      ocrEnabled: false,
      outputFormat: "markdown",
    });
    try {
      const result = await parser.parse(input.bytes);
      const markdown = markdownFromPagedParseResult({
        fallback: result.text,
        pages: (result.pages ?? []).map((page) => ({
          markdown: page.markdown,
          number: page.pageNum,
          text: page.text,
        })),
        total: result.totalPages || result.pages?.length,
      });
      if (!markdown) {
        return null;
      }
      return { markdown, provider: "liteparse" };
    } finally {
      parser.free();
    }
  },
};
