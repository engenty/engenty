/**
 * Firecrawl v2 scrape → markdown ([docs](https://docs.firecrawl.dev/features/scrape)).
 */

import { createLogger } from "@engenty/telemetry";

import type {
  WebIngestAdapter,
  WebIngestAdapterOptions,
  WebIngestConfig,
} from "../../interface.js";
import { DEFAULT_HTML_EXCLUDE_SELECTORS } from "../../lib/html-extract-defaults.js";
import {
  buildWebIngestSections,
  extractWebIngestStructureFromHtml,
} from "../../lib/html-structure-extract.js";
import { stripCookieConsentFromMarkdown } from "../../lib/markdown-strip-cookie-consent.js";
import {
  pickBetterPageTitle,
  resolveSuggestedPageTitle,
} from "../../lib/resolve-page-title.js";
import type { WebIngestResult } from "../../types.js";

const logger = createLogger({ name: "web-ingest-firecrawl" });

const DEFAULT_API_BASE = "https://api.firecrawl.dev/v2";

function resolveFirecrawlKey(
  config?: WebIngestConfig,
  options?: WebIngestAdapterOptions
): string | undefined {
  const fromCall = options?.firecrawlApiKey?.trim();
  if (fromCall) {
    return fromCall;
  }
  const fromConfig = config?.firecrawlApiKey?.trim();
  if (fromConfig) {
    return fromConfig;
  }
  return typeof process !== "undefined" && process.env
    ? process.env.FIRECRAWL_API_KEY?.trim()
    : undefined;
}

function resolveFirecrawlBase(
  config?: WebIngestConfig,
  options?: WebIngestAdapterOptions
): string | undefined {
  return (
    options?.firecrawlApiBaseUrl?.trim() ||
    config?.firecrawlApiBaseUrl?.trim() ||
    (typeof process !== "undefined" && process.env
      ? process.env.FIRECRAWL_API_URL?.trim()
      : undefined)
  );
}

interface FirecrawlJson {
  data?: {
    html?: string;
    markdown?: string;
    metadata?: {
      sourceURL?: string;
      title?: string;
      ogTitle?: string;
    };
  };
  error?: string;
  success?: boolean;
}

export class FirecrawlAdapter implements WebIngestAdapter {
  readonly id = "firecrawl" as const;
  readonly name = "Firecrawl scrape API";
  readonly priority = 100;

  private readonly config: WebIngestConfig | undefined;

  constructor(config?: WebIngestConfig) {
    this.config = config;
  }

  isAvailable(options?: WebIngestAdapterOptions): boolean {
    return Boolean(resolveFirecrawlKey(this.config, options));
  }

  async ingestUrl(
    url: string,
    options?: WebIngestAdapterOptions
  ): Promise<WebIngestResult> {
    const key = resolveFirecrawlKey(this.config, options);
    if (!key) {
      throw new Error(
        "Firecrawl API key required (set FIRECRAWL_API_KEY or pass firecrawlApiKey)"
      );
    }
    const base = (
      resolveFirecrawlBase(this.config, options) ?? DEFAULT_API_BASE
    ).replace(/\/$/, "");
    const timeoutMs = options?.firecrawlTimeoutMs ?? 120_000;
    const fetchFn = options?.fetchImpl ?? fetch;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchFn(`${base}/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          excludeTags: DEFAULT_HTML_EXCLUDE_SELECTORS,
          formats: ["markdown", "html"],
          onlyMainContent: true,
          url,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error("Firecrawl request timed out");
      }
      throw e instanceof Error ? e : new Error("Firecrawl request failed");
    } finally {
      clearTimeout(timer);
    }

    const raw = (await response
      .json()
      .catch(() => null)) as FirecrawlJson | null;
    if (!raw || typeof raw !== "object") {
      logger.warn("Firecrawl invalid JSON", { status: response.status });
      throw new Error("Firecrawl returned invalid JSON");
    }

    if (!response.ok) {
      const msg =
        typeof raw.error === "string" && raw.error.trim()
          ? raw.error
          : `Firecrawl HTTP ${response.status}`;
      throw new Error(msg);
    }

    if (raw.success === false) {
      const msg =
        typeof raw.error === "string" && raw.error.trim()
          ? raw.error
          : "Firecrawl scrape failed";
      throw new Error(msg);
    }

    const md = stripCookieConsentFromMarkdown(raw.data?.markdown?.trim() ?? "");
    if (!md) {
      throw new Error("Firecrawl returned no markdown");
    }

    const finalUrl = raw.data?.metadata?.sourceURL?.trim() || url;
    const rawHtml = raw.data?.html;
    const metaTitle =
      raw.data?.metadata?.ogTitle?.trim() ||
      raw.data?.metadata?.title?.trim() ||
      undefined;
    const suggestedTitle = pickBetterPageTitle(
      finalUrl,
      await resolveSuggestedPageTitle({
        html: rawHtml,
        llmModel: options?.llmModel,
        markdown: md,
        pageUrl: finalUrl,
      }),
      metaTitle
    );
    const structure = rawHtml
      ? extractWebIngestStructureFromHtml(rawHtml, finalUrl)
      : { links: [], media: [] };
    return {
      bytes_read: new TextEncoder().encode(md).byteLength,
      content_type: "text/markdown",
      final_url: finalUrl,
      links: structure.links,
      markdown: md,
      media: structure.media,
      provider: "firecrawl",
      ...(rawHtml ? { raw_html: rawHtml } : {}),
      sections: buildWebIngestSections({ markdown: md, rawHtml }),
      ...(suggestedTitle ? { suggested_title: suggestedTitle } : {}),
    };
  }
}

export interface FirecrawlScrapeOptions extends WebIngestAdapterOptions {
  /** Override API host (e.g. self-hosted). */
  apiBaseUrl?: string;
  apiKey: string;
}

/** One-shot scrape (explicit key; same adapter logic). */
export async function scrapeUrlWithFirecrawl(
  url: string,
  options: FirecrawlScrapeOptions
): Promise<WebIngestResult> {
  const { apiBaseUrl, apiKey, ...rest } = options;
  const adapter = new FirecrawlAdapter({
    firecrawlApiBaseUrl: apiBaseUrl,
    firecrawlApiKey: apiKey,
  });
  return adapter.ingestUrl(url, {
    ...rest,
    firecrawlApiBaseUrl: apiBaseUrl,
    firecrawlApiKey: apiKey,
  });
}
