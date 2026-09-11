/**
 * Mistral OCR (Document AI) — cloud document → markdown via POST /v1/ocr.
 */

import { createLogger } from "@engenty/telemetry";
import type {
  ConversionOptions,
  ConversionResult,
  DocConverterProvider,
} from "../../interface.js";
import { markdownFromPagedParseResult } from "../../page-break.js";

const logger = createLogger({ name: "doc-converter-mistral" });

const DEFAULT_MODEL = "mistral-ocr-latest";
const OCR_ENDPOINT = "https://api.mistral.ai/v1/ocr";
const REQUEST_TIMEOUT_MS = 120_000;

const DOCUMENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/avif"];

const SUPPORTED_TYPES = [...DOCUMENT_TYPES, ...IMAGE_TYPES];

export interface MistralOcrProviderConfig {
  apiKey: string;
  /** OCR model id; defaults to mistral-ocr-latest */
  model?: string;
}

interface MistralOcrPage {
  index?: number;
  markdown?: string;
}

interface MistralOcrResponse {
  pages?: MistralOcrPage[];
  usage_info?: { pages_processed?: number };
}

function bytesToDataUrl(data: Uint8Array, mimeType: string): string {
  const base64 = Buffer.from(data).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

export class MistralOcrProvider implements DocConverterProvider {
  readonly id = "mistral";
  readonly name = "Mistral OCR";
  readonly supportedTypes = SUPPORTED_TYPES;

  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: MistralOcrProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model?.trim() || DEFAULT_MODEL;
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
    const dataUrl = bytesToDataUrl(data, mimeType);
    // The OCR endpoint distinguishes page documents from single images.
    const document = IMAGE_TYPES.includes(mimeType)
      ? { type: "image_url", image_url: dataUrl }
      : { type: "document_url", document_url: dataUrl };

    logger.info("Mistral OCR: converting document", {
      filename: filename || "(none)",
      mimeType,
      model: this.model,
    });

    const response = await fetch(OCR_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        document,
        include_image_base64: false,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = (await response.text().catch(() => "")).slice(0, 500);
      throw new Error(
        `Mistral OCR request failed (${response.status}): ${body || response.statusText}`
      );
    }

    const result = (await response.json()) as MistralOcrResponse;
    const pages = Array.isArray(result.pages) ? result.pages : [];
    const markdown = markdownFromPagedParseResult({
      pages: pages.map((page, index) => ({
        markdown: page.markdown,
        number: (typeof page.index === "number" ? page.index : index) + 1,
      })),
      total: pages.length,
    });

    if (!markdown) {
      logger.warn("Mistral OCR: empty markdown in successful response", {
        filename: filename || "(none)",
        pageCount: pages.length,
      });
    }

    const metadata: ConversionResult["metadata"] = {
      word_count: markdown.split(/\s+/).filter(Boolean).length,
    };
    const pagesProcessed = result.usage_info?.pages_processed;
    if (typeof pagesProcessed === "number") {
      metadata.page_count = pagesProcessed;
    } else if (pages.length > 0) {
      metadata.page_count = pages.length;
    }

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
