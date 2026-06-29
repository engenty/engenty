/**
 * LlamaParse (LlamaCloud) — cloud document → markdown.
 */

import { createLogger } from "@engenty/telemetry";
import type {
  ConversionOptions,
  ConversionResult,
  DocConverterProvider,
} from "../../interface.js";
import {
  fetchMarkdownFromResultContentMetadata,
  LLAMA_PARSE_EXPAND_FIELDS,
  markdownFromLlamaCloudParsingResult,
} from "../../llama-cloud-markdown.js";

const logger = createLogger({ name: "doc-converter-llamaparse" });

const SUPPORTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "text/html",
];

export type LlamaParseTier = "cost_effective" | "agentic" | "agentic_plus";

export interface LlamaParseProviderConfig {
  apiKey: string;
  /** Parsing tier; defaults to cost_effective */
  tier?: LlamaParseTier;
}

async function createLlamaClient(apiKey: string) {
  const LlamaCloud = (await import("@llamaindex/llama-cloud")).default;
  return new LlamaCloud({ apiKey });
}

function base64ToFile(
  base64: string,
  filename: string,
  mimeType: string
): File {
  const buf = Buffer.from(base64, "base64");
  return new File([buf], filename, { type: mimeType });
}

function bytesToBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

export class LlamaParseProvider implements DocConverterProvider {
  readonly id = "llamaparse";
  readonly name = "LlamaParse (cloud)";
  readonly supportedTypes = SUPPORTED_TYPES;

  private readonly apiKey: string;
  private readonly defaultTier: LlamaParseTier;

  constructor(config: LlamaParseProviderConfig) {
    this.apiKey = config.apiKey;
    this.defaultTier = config.tier ?? "cost_effective";
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
    const client = await createLlamaClient(this.apiKey);
    const effectiveTier =
      this.defaultTier === "agentic_plus" ? "agentic" : this.defaultTier;

    logger.info("LlamaParse: parsing document", {
      filename,
      tier: effectiveTier,
    });

    const base64 = bytesToBase64(data);
    const safeName =
      filename.trim() ||
      (mimeType === "application/pdf" ? "document.pdf" : "document");

    const job = await client.parsing.create({
      upload_file: base64ToFile(base64, safeName, mimeType),
      tier: effectiveTier,
      version: "latest",
    });

    if (!job.id) {
      throw new Error("LlamaParse: no job ID returned");
    }

    const result = await client.parsing.waitForCompletion(
      job.id,
      { expand: [...LLAMA_PARSE_EXPAND_FIELDS] },
      {
        timeout: 120_000,
        verbose: false,
      }
    );

    let markdown = markdownFromLlamaCloudParsingResult(result);
    if (!markdown) {
      markdown = await fetchMarkdownFromResultContentMetadata(result);
    }
    if (!markdown) {
      const jobBlock =
        result &&
        typeof result === "object" &&
        result !== null &&
        "job" in result
          ? (result as unknown as { job?: Record<string, unknown> }).job
          : undefined;
      const raw = result as unknown as Record<string, unknown>;
      logger.warn("LlamaParse: empty markdown after successful job", {
        filename: safeName,
        jobStatus:
          jobBlock && typeof jobBlock.status === "string"
            ? jobBlock.status
            : undefined,
        jobError:
          jobBlock && typeof jobBlock.error_message === "string"
            ? jobBlock.error_message
            : undefined,
        resultKeys:
          raw && typeof raw === "object" ? Object.keys(raw).sort() : [],
        hasResultContentMetadata: Boolean(raw?.result_content_metadata),
      });
    }

    const raw = result as unknown as Record<string, unknown>;
    const metadata: ConversionResult["metadata"] = {
      word_count: markdown.split(/\s+/).filter(Boolean).length,
    };
    const jobBlock = raw.job;
    if (jobBlock && typeof jobBlock === "object" && jobBlock !== null) {
      const meta = (jobBlock as { metadata?: { page_count?: number } })
        .metadata;
      if (typeof meta?.page_count === "number") {
        metadata.page_count = meta.page_count;
      }
    }
    const pageCount = raw.page_count;
    if (typeof pageCount === "number") {
      metadata.page_count = pageCount;
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
