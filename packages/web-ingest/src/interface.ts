/**
 * Web ingest — adapter contract (same idea as `DocConverterProvider` in doc-converter).
 *
 * Each adapter turns a **public HTTP(S) URL** into markdown; the facade picks the
 * adapter from `strategy` / availability (e.g. Firecrawl when an API key exists).
 */

import type { HtmlExtractPatternOptions } from "./lib/html-apply-selectors.js";
import type { WebIngestResult } from "./types.js";

export type WebIngestAdapterId = WebIngestResult["provider"];

/** Fetch adapter: optional CSS extraction + LLM-assisted pattern generation. */
export interface WebIngestHtmlExtractOptions extends HtmlExtractPatternOptions {
  /** AI Gateway model id for pattern suggestion (default: openai/gpt-5-mini). */
  llmModel?: string;
  /** When true, runs LLM pattern suggestion on the fetched HTML, then merges selectors. */
  suggestPatternsWithLlm?: boolean;
}

/** Constructor / long-lived defaults (optional). Per-call options override in `ingestUrl`. */
export interface WebIngestConfig {
  /** Default User-Agent for the fetch adapter when not overridden per call. */
  fetchUserAgent?: string;
  firecrawlApiBaseUrl?: string;
  firecrawlApiKey?: string;
}

/**
 * Per-call options passed to `UrlIngest.ingestUrl` / `ingestUrlToMarkdown`.
 * Merged with `WebIngestConfig` from the facade constructor (call-time wins).
 */
export interface WebIngestAdapterOptions {
  fetchImpl?: typeof fetch;
  /** Fetch adapter: request timeout (ms). */
  fetchTimeoutMs?: number;
  /** Fetch adapter: `User-Agent` header. */
  fetchUserAgent?: string;
  firecrawlApiBaseUrl?: string;
  firecrawlApiKey?: string;
  firecrawlTimeoutMs?: number;
  /**
   * Fetch adapter (HTML only): strip/include regions via CSS before Turndown.
   * Omit for legacy behavior (full document). Pass `{}` to apply smart default excludes only.
   */
  htmlExtract?: WebIngestHtmlExtractOptions;
  /** @alias maxResponseBytes — fetch adapter only */
  maxBytes?: number;
  /** Fetch adapter: max response body size (bytes). */
  maxResponseBytes?: number;
  /** @alias fetchTimeoutMs — fetch adapter only */
  timeoutMs?: number;
  /** @alias fetchUserAgent — fetch adapter only */
  userAgent?: string;
}

export interface WebIngestAdapter {
  readonly id: WebIngestAdapterId;
  ingestUrl(
    url: string,
    options?: WebIngestAdapterOptions
  ): Promise<WebIngestResult>;
  /**
   * Whether this adapter can run. Implementations may inspect `options` (e.g.
   * per-call `firecrawlApiKey`) in addition to constructor config / env.
   */
  isAvailable(options?: WebIngestAdapterOptions): boolean;
  readonly name: string;
  /**
   * Higher runs first in `strategy: "auto"` when multiple adapters are registered
   * and available.
   */
  readonly priority: number;
}

/** Alias — same shape as fetch one-shot `fetchUrlToMarkdown` options. */
export type FetchUrlToMarkdownOptions = WebIngestAdapterOptions;
