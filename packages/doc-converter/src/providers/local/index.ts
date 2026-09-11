/**
 * Local provider — Uses pdf-parse for PDFs and mammoth for DOCX.
 *
 * No external API calls needed. Good as fallback.
 */

import { htmlToMarkdown } from "@engenty/web-ingest";
import type {
  ConversionOptions,
  ConversionResult,
  DocConverterProvider,
} from "../../interface.js";
import { markdownFromPagedParseResult } from "../../page-break.js";

const SUPPORTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
];

export class LocalProvider implements DocConverterProvider {
  readonly id = "local";
  readonly name = "Local (pdf-parse + mammoth)";
  readonly supportedTypes = SUPPORTED_TYPES;

  canConvert(mimeType: string): boolean {
    return SUPPORTED_TYPES.includes(mimeType);
  }

  async convert(
    data: Uint8Array,
    filename: string,
    mimeType: string,
    _options?: ConversionOptions
  ): Promise<ConversionResult> {
    let markdown = "";
    const metadata: ConversionResult["metadata"] = {};

    if (mimeType === "application/pdf") {
      const { PDFParse } = await import("pdf-parse");
      const buffer = Buffer.from(data);
      const parser = new PDFParse({ data: buffer });
      try {
        const textResult = await parser.getText({ pageJoiner: "" });
        const infoResult = await parser.getInfo();
        markdown = markdownFromPagedParseResult({
          fallback: textResult.text,
          pages: textResult.pages.map((page) => ({
            number: page.num,
            text: page.text,
          })),
          total: textResult.total,
        });
        metadata.page_count = textResult.total;
        const info = infoResult.info as
          | { Title?: string; Author?: string }
          | undefined;
        metadata.title = info?.Title;
        metadata.author = info?.Author;
      } finally {
        await parser.destroy();
      }
    } else if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      const mammoth = await import("mammoth");
      const buffer = Buffer.from(data);
      const result = await mammoth.convertToHtml({ buffer });
      // Simple HTML to markdown conversion (basic)
      markdown = htmlToMarkdown(result.value);
    } else if (mimeType === "text/plain" || mimeType === "text/markdown") {
      markdown = new TextDecoder().decode(data);
    }

    metadata.word_count = markdown.split(/\s+/).filter(Boolean).length;

    return {
      markdown,
      metadata,
      source: {
        filename,
        mime_type: mimeType,
        size_bytes: data.byteLength,
      },
    };
  }
}
