/**
 * Gemini (AI Gateway) — vision document → markdown.
 */

import { createLogger } from "@engenty/telemetry";
import type {
  ConversionOptions,
  ConversionResult,
  DocConverterProvider,
} from "../../interface.js";

const logger = createLogger({ name: "doc-converter-gemini" });

const DEFAULT_MODEL = "google/gemini-2.5-flash";

const SUPPORTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export interface GeminiProviderConfig {
  model?: string;
}

function bytesToDataUrl(data: Uint8Array, mimeType: string): string {
  const base64 = Buffer.from(data).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

export class GeminiProvider implements DocConverterProvider {
  readonly id = "gemini";
  readonly name = "Gemini Vision";
  readonly supportedTypes = SUPPORTED_TYPES;

  private readonly model: string;

  constructor(config?: GeminiProviderConfig) {
    this.model = config?.model?.trim() || DEFAULT_MODEL;
  }

  canConvert(mimeType: string): boolean {
    return SUPPORTED_TYPES.includes(mimeType);
  }

  async convert(
    data: Uint8Array,
    filename: string,
    mimeType: string,
    _options?: ConversionOptions
  ): Promise<ConversionResult> {
    const { generateText } = await import("ai");
    const dataUrl = bytesToDataUrl(data, mimeType);
    const filenameHint = filename.trim()
      ? ` The original filename is: ${filename}.`
      : "";

    logger.info("Gemini: converting document to markdown", {
      filename: filename || "(none)",
      model: this.model,
    });

    const { text } = await generateText({
      model: this.model,
      messages: [
        {
          role: "system",
          content: `You convert documents to clean, readable Markdown.${filenameHint}
Rules:
- Preserve headings, lists, tables (as Markdown tables when clear), and emphasis.
- Do not wrap the result in a code fence.
- Use null or omit sections that are not present; output only the document body as Markdown.
- For scanned or image-only pages, transcribe visible text faithfully.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image",
              image: new URL(dataUrl),
            },
            {
              type: "text",
              text: "Convert this document to Markdown. Output only the Markdown content.",
            },
          ],
        },
      ],
    });

    const markdown = (text ?? "").trim();
    const metadata: ConversionResult["metadata"] = {
      word_count: markdown.split(/\s+/).filter(Boolean).length,
    };

    return {
      markdown,
      metadata,
      source: {
        filename: filename.trim() || "document",
        mime_type: mimeType,
        size_bytes: data.byteLength,
      },
    };
  }
}
