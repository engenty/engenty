/**
 * LiteParse (LlamaIndex) — local document → layout-preserving text.
 *
 * @see https://developers.llamaindex.ai/liteparse/ — full `LiteParseConfig` options
 *   (OCR, DPI, workers, etc.) for future extension.
 *
 * - PDF: parsed in-memory. Other office/image/html formats may use a temp dir
 *   (`LITEPARSE_TMPDIR`) and system conversion per upstream; OCR may use
 *   Tesseract (`TESSDATA_PREFIX` / `tessdataPath`).
 * - `ConversionOptions.include_images` is not passed through yet; this provider
 *   returns plain text and optional page metadata.
 */

import { createLogger } from "@engenty/telemetry";
import type {
  ConversionOptions,
  ConversionResult,
  DocConverterProvider,
} from "../../interface.js";

const logger = createLogger({ name: "doc-converter-liteparse" });

/** Types LiteParse converts (often via PDF); mirrors cloud breadth where applicable. */
const SUPPORTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/html",
];

async function createParser(
  options?: ConversionOptions
): Promise<import("@llamaindex/liteparse").LiteParse> {
  const { LiteParse } = await import("@llamaindex/liteparse");
  const base: Partial<import("@llamaindex/liteparse").LiteParseConfig> = {
    outputFormat: "text",
  };
  if (typeof options?.max_pages === "number" && options.max_pages > 0) {
    base.maxPages = options.max_pages;
  }
  const lang = options?.language?.trim();
  if (lang) {
    base.ocrLanguage = lang;
  }
  return new LiteParse(base);
}

export class LiteParseProvider implements DocConverterProvider {
  readonly id = "liteparse";
  readonly name = "LiteParse (local)";
  readonly supportedTypes = SUPPORTED_TYPES;

  canConvert(mimeType: string): boolean {
    return SUPPORTED_TYPES.includes(mimeType);
  }

  async convert(
    data: Uint8Array,
    filename: string,
    mimeType: string,
    options?: ConversionOptions
  ): Promise<ConversionResult> {
    const safeName =
      filename.trim() ||
      (mimeType === "application/pdf" ? "document.pdf" : "document");

    logger.info("LiteParse: parsing document", { filename: safeName });

    const parser = await createParser(options);
    const result = await parser.parse(data);

    const markdown = result.text ?? "";
    const metadata: ConversionResult["metadata"] = {
      word_count: markdown.split(/\s+/).filter(Boolean).length,
    };
    if (result.pages?.length) {
      metadata.page_count = result.pages.length;
    }

    return {
      markdown,
      metadata,
      source: {
        filename: safeName,
        mime_type: mimeType,
        size_bytes: data.byteLength,
      },
    };
  }
}
