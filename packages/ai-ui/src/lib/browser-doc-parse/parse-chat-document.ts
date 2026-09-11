import type { BrowserParseProvider } from "@engenty/ai-core/browser";
import { isImageMimeType } from "../chat-attachment-part.js";
import { parserForBrowserParse } from "./parser-for-browser-parse.js";
import { isTextLikeMime } from "./text-like.js";
import type { BrowserDocParseResult, BrowserDocParser } from "./types.js";

/**
 * Cap stored sidecar markdown (preview + later file_analyst). The run still
 * inlines only 32 KiB — this is not the prompt budget.
 */
export const EXTRACTED_MARKDOWN_MAX_CHARS = 400_000;

export function clipExtractedMarkdown(markdown: string): string {
  if (markdown.length <= EXTRACTED_MARKDOWN_MAX_CHARS) {
    return markdown;
  }
  return `${markdown.slice(0, EXTRACTED_MARKDOWN_MAX_CHARS)}\n\n…(truncated)`;
}

/**
 * Parse an office/PDF attachment in the browser. Images and already-text
 * files are skipped. Failures return null so upload still proceeds.
 */
export async function parseChatDocumentInBrowser(input: {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  mode?: BrowserParseProvider;
  parser?: BrowserDocParser;
}): Promise<BrowserDocParseResult | null> {
  if (
    isImageMimeType(input.mimeType) ||
    isTextLikeMime(input.mimeType, input.filename)
  ) {
    return null;
  }
  const parser = input.parser ?? parserForBrowserParse(input.mode ?? "anydoc");
  if (!parser) {
    return null;
  }
  if (!parser.canParse(input.mimeType, input.filename)) {
    return null;
  }
  try {
    const result = await parser.parse({
      bytes: input.bytes,
      filename: input.filename,
      mimeType: input.mimeType,
    });
    if (!result?.markdown.trim()) {
      return null;
    }
    return {
      markdown: clipExtractedMarkdown(result.markdown.trim()),
      provider: result.provider,
    };
  } catch {
    return null;
  }
}
