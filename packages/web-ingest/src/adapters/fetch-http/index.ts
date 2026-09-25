/**
 * Fetch HTTP(S) URL → markdown (bounded GET, SSRF blocks, Turndown+GFM for HTML).
 */

import type {
  WebIngestAdapter,
  WebIngestAdapterOptions,
  WebIngestConfig,
} from "../../interface.js";
import { applyHtmlExtractSelectors } from "../../lib/html-apply-selectors.js";
import { htmlToMarkdownFromFetchedPage } from "../../lib/html-prepare.js";
import {
  buildWebIngestSections,
  extractWebIngestStructureFromHtml,
} from "../../lib/html-structure-extract.js";
import {
  bytesToText,
  parseContentTypeHeader,
  readBodyWithCap,
} from "../../lib/http-body.js";
import { stripCookieConsentFromMarkdown } from "../../lib/markdown-strip-cookie-consent.js";
import {
  pickBetterPageTitle,
  resolveSuggestedPageTitle,
} from "../../lib/resolve-page-title.js";
import { safeFetchFollowingRedirects } from "../../lib/safe-fetch.js";
import { suggestHtmlExtractPatternsFromHtml } from "../../lib/suggest-html-extract-patterns.js";
import type { WebIngestResult } from "../../types.js";

const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const DEFAULT_USER_AGENT =
  "EngentyWebIngest/1.0 (+https://github.com/engenty/engenty; URL fetch)";

export class FetchHttpAdapter implements WebIngestAdapter {
  readonly id = "fetch" as const;
  readonly name = "HTTP fetch + Turndown (GFM)";
  readonly priority = 10;

  private readonly config: WebIngestConfig | undefined;

  constructor(config?: WebIngestConfig) {
    this.config = config;
  }

  isAvailable(_options?: WebIngestAdapterOptions): boolean {
    return true;
  }

  async ingestUrl(
    url: string,
    options?: WebIngestAdapterOptions
  ): Promise<WebIngestResult> {
    const maxBytes =
      options?.maxBytes ?? options?.maxResponseBytes ?? DEFAULT_MAX_BYTES;
    const timeoutMs =
      options?.timeoutMs ?? options?.fetchTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const userAgent =
      options?.userAgent ??
      options?.fetchUserAgent ??
      this.config?.fetchUserAgent ??
      DEFAULT_USER_AGENT;
    const fetchFn = options?.fetchImpl ?? fetch;

    // One AbortController covers the entire redirect chain
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    let finalUrl: string;

    try {
      // Every hop is SSRF-validated inside the shared helper.
      ({ finalUrl, response } = await safeFetchFollowingRedirects(url, {
        fetchImpl: fetchFn,
        headers: {
          Accept:
            "text/html,application/xhtml+xml,text/plain,text/markdown;q=0.9,*/*;q=0.1",
          "User-Agent": userAgent,
        },
        maxRedirects: MAX_REDIRECTS,
        signal: controller.signal,
      }));
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error("Fetch timed out");
      }
      throw e instanceof Error ? e : new Error("Fetch failed");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buf = await readBodyWithCap(response, maxBytes);
    const { charset, mime } = parseContentTypeHeader(
      response.headers.get("content-type")
    );
    let text = bytesToText(buf, charset);
    let cleanHtml: string | undefined;
    let rawHtml: string | undefined;

    let suggestedTitle: string | undefined;
    let markdown: string;
    if (
      mime.includes("html") ||
      mime.includes("xhtml") ||
      (mime === "application/octet-stream" &&
        /<\s*html[\s>]/i.test(text.slice(0, 2000)))
    ) {
      rawHtml = text;
      const he = options?.htmlExtract;
      let applyOpts = {
        includeSelectors: he?.includeSelectors,
        excludeSelectors: he?.excludeSelectors,
        skipDefaultExcludeSelectors: he?.skipDefaultExcludeSelectors,
      };
      if (he?.suggestPatternsWithLlm) {
        const model = he.llmModel ?? options?.llmModel;
        if (!model) {
          throw new Error(
            "htmlExtract.suggestPatternsWithLlm requires an llmModel"
          );
        }
        const suggested = await suggestHtmlExtractPatternsFromHtml({
          html: text,
          pageUrl: finalUrl,
          model,
        });
        const userIncludes = he.includeSelectors?.filter(Boolean) ?? [];
        applyOpts = {
          skipDefaultExcludeSelectors: he.skipDefaultExcludeSelectors,
          includeSelectors:
            userIncludes.length > 0 ? userIncludes : suggested.includeSelectors,
          excludeSelectors: [
            ...(he.excludeSelectors ?? []),
            ...suggested.excludeSelectors,
          ],
        };
        if (suggested.suggestedTitle?.trim()) {
          suggestedTitle = suggested.suggestedTitle.trim();
        }
      }
      text = applyHtmlExtractSelectors(text, applyOpts);
      cleanHtml = text;
      markdown = htmlToMarkdownFromFetchedPage(text);
    } else if (
      mime.startsWith("text/") ||
      mime === "application/json" ||
      mime === "application/javascript"
    ) {
      markdown = text.trim();
    } else {
      markdown = text.trim();
    }
    markdown = stripCookieConsentFromMarkdown(markdown);

    if (!markdown.trim()) {
      throw new Error("No extractable text from response");
    }

    const resolvedTitle = await resolveSuggestedPageTitle({
      html: rawHtml,
      llmModel: options?.htmlExtract?.llmModel ?? options?.llmModel,
      markdown,
      pageUrl: finalUrl,
      skipTitleLlm: options?.htmlExtract?.suggestPatternsWithLlm === true,
    });
    suggestedTitle = pickBetterPageTitle(
      finalUrl,
      suggestedTitle,
      resolvedTitle
    );

    const structure = cleanHtml
      ? extractWebIngestStructureFromHtml(cleanHtml, finalUrl)
      : { links: [], media: [] };

    return {
      bytes_read: buf.byteLength,
      content_type: mime,
      final_url: finalUrl,
      links: structure.links,
      markdown,
      media: structure.media,
      provider: "fetch",
      ...(rawHtml ? { raw_html: rawHtml } : {}),
      sections: buildWebIngestSections({ cleanHtml, markdown, rawHtml }),
      ...(suggestedTitle ? { suggested_title: suggestedTitle } : {}),
    };
  }
}

/** One-shot helper (same as `new FetchHttpAdapter().ingestUrl(...)`). */
export async function fetchUrlToMarkdown(
  url: string,
  options?: WebIngestAdapterOptions & { config?: WebIngestConfig }
): Promise<WebIngestResult> {
  const { config, ...rest } = options ?? {};
  return new FetchHttpAdapter(config).ingestUrl(url, rest);
}
