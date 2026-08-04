/**
 * @engenty/web-ingest — URL → markdown with pluggable **adapters** (same pattern as
 * `DocConverterProvider` + `Converter` in `@engenty/doc-converter`).
 *
 * - **FetchHttpAdapter** (`fetch`): bounded GET + SSRF blocks + optional CSS include/exclude
 *   (smart defaults) + optional LLM selector suggestion, then Turndown+GFM.
 * - **FirecrawlAdapter** (`firecrawl`): [Firecrawl v2 scrape](https://docs.firecrawl.dev/features/scrape) when an API key is available.
 * - **UrlIngest**: facade; `strategy: "auto"` picks the highest-priority **available** adapter.
 */

export {
  FetchHttpAdapter,
  fetchUrlToMarkdown,
} from "./adapters/fetch-http/index.js";
export {
  FirecrawlAdapter,
  type FirecrawlScrapeOptions,
  scrapeUrlWithFirecrawl,
} from "./adapters/firecrawl/index.js";
export type {
  FetchUrlToMarkdownOptions,
  WebIngestAdapter,
  WebIngestAdapterId,
  WebIngestAdapterOptions,
  WebIngestConfig,
  WebIngestHtmlExtractOptions,
} from "./interface.js";
export {
  applyHtmlExtractSelectors,
  type HtmlExtractPatternOptions,
} from "./lib/html-apply-selectors.js";
export { DEFAULT_HTML_EXCLUDE_SELECTORS } from "./lib/html-extract-defaults.js";
export {
  extractHeadSummaryMarkdown,
  extractHtmlDocumentTitle,
  extractHtmlMetaContent,
  htmlToMarkdownFromFetchedPage,
  isLikelyClientRenderedShell,
  stripHtmlForMarkdown,
} from "./lib/html-prepare.js";
export {
  buildWebIngestSections,
  extractWebIngestStructureFromHtml,
} from "./lib/html-structure-extract.js";
export {
  createHtmlToMarkdownService,
  htmlToMarkdown,
} from "./lib/html-to-markdown.js";
export { stripCookieConsentFromMarkdown } from "./lib/markdown-strip-cookie-consent.js";
export {
  cleanPageTitle,
  extractFirstMarkdownH1,
  isTitleUrlLike,
  pickBetterPageTitle,
  type ResolveSuggestedPageTitleOptions,
  resolvePageTitleHeuristic,
  resolveSuggestedPageTitle,
  titleFromUrlPath,
} from "./lib/resolve-page-title.js";
export type { SafeFetchImpl, SafeFetchOptions } from "./lib/safe-fetch.js";
export { safeFetchFollowingRedirects } from "./lib/safe-fetch.js";
export type { LookupFn } from "./lib/ssrf.js";
export { assertPublicHttpHost, isBlockedIp } from "./lib/ssrf.js";
export {
  type HtmlExtractPatternSuggestion,
  htmlExtractPatternSuggestionSchema,
  type SuggestHtmlExtractPatternsFromHtmlOptions,
  suggestHtmlExtractPatternsFromHtml,
} from "./lib/suggest-html-extract-patterns.js";
export type {
  WebIngestLink,
  WebIngestLinkType,
  WebIngestMedia,
  WebIngestMediaType,
  WebIngestProvider,
  WebIngestResult,
  WebIngestSection,
  WebIngestSectionKind,
} from "./types.js";
export {
  type IngestStrategy,
  type IngestUrlToMarkdownOptions,
  ingestUrlToMarkdown,
  UrlIngest,
  type UrlIngestIngestOptions,
  type UrlIngestStrategy,
} from "./url-ingest.js";
