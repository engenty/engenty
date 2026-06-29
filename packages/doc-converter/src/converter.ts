/**
 * Document Converter — Facade.
 *
 * Selects the right provider based on MIME type and preference.
 * Follows the banking provider pattern (switch on provider name).
 */

import { createLogger, env } from "@engenty/telemetry";
import type {
  ConversionOptions,
  ConversionResult,
  DocConverterProvider,
} from "./interface.js";
import { GeminiProvider } from "./providers/gemini/index.js";
import { LiteParseProvider } from "./providers/liteparse/index.js";
import {
  LlamaParseProvider,
  type LlamaParseTier,
} from "./providers/llamaparse/index.js";
import { LocalProvider } from "./providers/local/index.js";

const logger = createLogger({ name: "doc-converter" });

export type ConverterProviderName =
  | "local"
  | "liteparse"
  | "llamaparse"
  | "gemini";

/**
 * Fallback order when the preferred provider can't handle a MIME type.
 * Cloud/vision providers (LlamaParse, Gemini) read images directly and beat the
 * local OCR path (LiteParse), which shells out to ImageMagick + Tesseract to
 * rasterize images — a heavy native dependency we don't want to require for a
 * simple PNG/JPEG. Local stays last as the universal offline fallback.
 */
const FALLBACK_PROVIDER_ORDER: ConverterProviderName[] = [
  "llamaparse",
  "gemini",
  "liteparse",
  "local",
];

function fallbackRank(id: string): number {
  const index = FALLBACK_PROVIDER_ORDER.indexOf(id as ConverterProviderName);
  return index === -1 ? FALLBACK_PROVIDER_ORDER.length : index;
}

export interface ConverterConfig {
  /** API key for Gemini / AI Gateway (optional; falls back to AI_GATEWAY_API_KEY) */
  gemini_api_key?: string;
  /** Model id for Gemini vision (e.g. google/gemini-2.5-flash) */
  gemini_model?: string;
  /** API key for LlamaParse (optional; falls back to LLAMA_CLOUD_API_KEY) */
  llamaparse_api_key?: string;
  /** LlamaParse parsing tier */
  llamaparse_tier?: LlamaParseTier;
  /** Preferred provider. Falls back to local if unavailable. */
  provider?: ConverterProviderName;
}

export class Converter {
  private readonly providers: Map<string, DocConverterProvider> = new Map();
  private readonly preferredProvider: ConverterProviderName;

  constructor(config?: ConverterConfig) {
    this.preferredProvider = config?.provider ?? "local";

    // Always register local provider as fallback
    this.registerProvider(new LocalProvider());
    this.registerProvider(new LiteParseProvider());

    const llamaKey =
      config?.llamaparse_api_key?.trim() || env("LLAMA_CLOUD_API_KEY")?.trim();
    if (llamaKey) {
      this.registerProvider(
        new LlamaParseProvider({
          apiKey: llamaKey,
          tier: config?.llamaparse_tier,
        })
      );
    }

    const geminiKey =
      config?.gemini_api_key?.trim() || env("AI_GATEWAY_API_KEY")?.trim();
    if (geminiKey) {
      this.registerProvider(
        new GeminiProvider({ model: config?.gemini_model })
      );
    }
  }

  registerProvider(provider: DocConverterProvider): void {
    this.providers.set(provider.id, provider);
    logger.info("Registered doc converter provider", { id: provider.id });
  }

  async convert(
    data: Uint8Array,
    filename: string,
    mimeType: string,
    options?: ConversionOptions
  ): Promise<ConversionResult> {
    // Try preferred provider first
    const preferred = this.providers.get(this.preferredProvider);
    if (preferred?.canConvert(mimeType)) {
      logger.info("Converting with preferred provider", {
        provider: preferred.id,
        filename,
        mimeType,
      });
      return preferred.convert(data, filename, mimeType, options);
    }

    // Fallback in priority order: a vision-capable cloud provider beats the
    // local OCR path so images don't require ImageMagick. Skip the preferred
    // provider — already tried above.
    const fallbacks = Array.from(this.providers.values())
      .filter((p) => p.id !== this.preferredProvider)
      .sort((a, b) => fallbackRank(a.id) - fallbackRank(b.id));
    for (const provider of fallbacks) {
      if (provider.canConvert(mimeType)) {
        logger.info("Converting with fallback provider", {
          provider: provider.id,
          filename,
          mimeType,
        });
        return provider.convert(data, filename, mimeType, options);
      }
    }

    throw new Error(
      `No converter available for MIME type: ${mimeType} (file: ${filename})`
    );
  }

  /** List all registered providers */
  listProviders(): Array<{ id: string; name: string; types: string[] }> {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      types: p.supportedTypes,
    }));
  }

  /** Check if any provider can handle this type */
  canConvert(mimeType: string): boolean {
    return Array.from(this.providers.values()).some((p) =>
      p.canConvert(mimeType)
    );
  }
}
